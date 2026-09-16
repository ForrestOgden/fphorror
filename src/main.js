import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (s) => document.querySelector(s);
const gameRoot = $('#game');
const menu = $('#menu');
const settings = $('#settings');
const pause = $('#pause');
const death = $('#death');
const paywall = $('#paywall');
const cinematic = $('#cinematic');
const cinematicKicker = $('#cinematicKicker');
const cinematicLine = $('#cinematicLine');
const hud = $('#hud');
const floorTag = $('#floorTag');
const objectiveEl = $('#objective');
const promptEl = $('#prompt');
const crosshair = $('#crosshair');
const staminaFill = $('#stamina > div');
const fade = $('#fade');
const blood = $('#blood');
const flashEl = $('#flash');
const grainEl = $('#grain');
const assetBadge = $('#assetBadge');
const inventoryEl = $('#inventory');
const toastEl = $('#toast');

const state = {
  running: false,
  paused: false,
  dead: false,
  transitioning: false,
  floor: 8,
  direction: -1,
  stamina: 1,
  sprinting: false,
  flashlightOn: true,
  sensitivity: Number($('#sens').value),
  headBob: $('#headBob').checked,
  volume: Number($('#volume').value),
  renderScale: Number($('#scale').value),
  elapsed: 0,
  floorElapsed: 0,
  scareFlags: new Set(),
  entityMode: 'hidden',
  entitySpeed: 0,
  heartbeat: 0,
  inputMode: 'mouse',
  endingActive: false,
  finaleRunning: false,
  gpMoveX: 0,
  gpMoveY: 0,
  walkPhase: 0,
  moveSpeed: 0,
  inventory: { fuse: false, key: false, relay: false },
  weapon: false,
  weaponDurability: 0,
  beastStunUntil: 0,
  currentInteractable: null,
  winReady: false,
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------------------------------
// Renderer / camera
// -----------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);
scene.fog = new THREE.FogExp2(0x050505, 0.045);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
const yaw = new THREE.Object3D();
yaw.position.set(0, 0, 16);
yaw.add(camera);
camera.position.set(0, 1.68, 0);
scene.add(yaw);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio * state.renderScale, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.76;
renderer.outputColorSpace = THREE.SRGBColorSpace;
gameRoot.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.52, 0.88);
composer.addPass(bloom);
const fxaa = new ShaderPass(FXAAShader);
composer.addPass(fxaa);
composer.addPass(new OutputPass());

function syncFXAA() {
  const px = renderer.getPixelRatio();
  fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * px), 1 / (innerHeight * px));
}
syncFXAA();

// -----------------------------------------------------------------------------
// Fallback textures + Poly Haven PBR surface upgrade
// -----------------------------------------------------------------------------
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296);
}

function makeWallTexture(seed = 1) {
  const rnd = seeded(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#77736a';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16000; i++) {
    const v = 80 + Math.floor(rnd() * 65);
    x.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.02 + rnd() * 0.05})`;
    x.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 4, 1 + rnd() * 4);
  }
  for (let i = 0; i < 35; i++) {
    const gx = rnd() * 512;
    const gy = rnd() * 512;
    const r = 10 + rnd() * 90;
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, `rgba(20,18,15,${0.06 + rnd() * 0.10})`);
    g.addColorStop(1, 'rgba(20,18,15,0)');
    x.fillStyle = g;
    x.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeFloorTexture(seed = 8) {
  const rnd = seeded(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#262521';
  x.fillRect(0, 0, 512, 512);
  for (let iy = 0; iy < 16; iy++) {
    for (let ix = 0; ix < 16; ix++) {
      const b = 31 + Math.floor(rnd() * 10);
      x.fillStyle = `rgb(${b},${b},${b - 2})`;
      x.fillRect(ix * 32 + 1, iy * 32 + 1, 30, 30);
    }
  }
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = `rgba(0,0,0,${rnd() * .08})`;
    x.fillRect(rnd() * 512, rnd() * 512, rnd() * 3, rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 16);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const wallMat = new THREE.MeshStandardMaterial({ map: makeWallTexture(91), color: 0x8a867d, roughness: .94, metalness: .02 });
const floorMat = new THREE.MeshStandardMaterial({ map: makeFloorTexture(13), color: 0x77736a, roughness: .96, metalness: .02 });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x4a4945, roughness: 1 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x171614, roughness: .82 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x292a2a, roughness: .42, metalness: .78 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x2d2018, roughness: .72, metalness: .08 });
const elevatorWallMat = new THREE.MeshStandardMaterial({ color: 0x6b6b67, roughness: .5, metalness: .72 });
const elevatorFloorMat = new THREE.MeshStandardMaterial({ color: 0x30302d, roughness: .72, metalness: .5 });
const elevatorDoorMat = new THREE.MeshStandardMaterial({ color: 0x4f4f4c, roughness: .44, metalness: .82 });
const elevatorPaintMat = new THREE.MeshStandardMaterial({ color: 0x252a2d, roughness: .78, metalness: .32 });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .92, metalness: 0 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0x725b2f, roughness: .42, metalness: .82 });
const fixtureMat = new THREE.MeshStandardMaterial({ color: 0xc2c0b4, emissive: 0xe6e0cc, emissiveIntensity: 1.1, roughness: .6 });

const PH = 'https://dl.polyhaven.org/file/ph-assets';
const PH_API = 'https://api.polyhaven.com';
const assetStats = { local: 0, remote: 0 };
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

function loadTexture(url, srgb = false) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}

async function loadTextureCandidates(urls, srgb = false) {
  let lastError;
  for (const url of urls) {
    try {
      const texture = await loadTexture(url, srgb);
      if (!url.startsWith('http')) assetStats.local += 1;
      else assetStats.remote += 1;
      return texture;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('No texture candidate loaded');
}

function textureCandidates(slug, suffix) {
  const file = `${slug}_${suffix}_1k.jpg`;
  return [
    `./assets/polyhaven/textures/${slug}/${file}`,
    `./public/assets/polyhaven/textures/${slug}/${file}`,
    `${PH}/Textures/jpg/1k/${slug}/${file}`,
  ];
}

async function applyPolyHavenMaterial(material, slug, repeatX, repeatY) {
  try {
    const [diff, normal, rough] = await Promise.all([
      loadTextureCandidates(textureCandidates(slug, 'diff'), true),
      loadTextureCandidates(textureCandidates(slug, 'nor_gl')),
      loadTextureCandidates(textureCandidates(slug, 'rough')),
    ]);
    for (const t of [diff, normal, rough]) t.repeat.set(repeatX, repeatY);
    material.map = diff;
    material.normalMap = normal;
    material.roughnessMap = rough;
    material.color.setHex(0xffffff);
    material.roughness = 1;
    material.needsUpdate = true;
    return true;
  } catch (err) {
    console.warn(`[NULL FLOOR] Poly Haven texture fallback used for ${slug}`, err);
    return false;
  }
}

async function applyPolyHavenMetalMaterial(material, slug, repeatX, repeatY) {
  try {
    const [diff, normal, rough, metal] = await Promise.all([
      loadTextureCandidates(textureCandidates(slug, 'diff'), true),
      loadTextureCandidates(textureCandidates(slug, 'nor_gl')),
      loadTextureCandidates(textureCandidates(slug, 'rough')),
      loadTextureCandidates(textureCandidates(slug, 'metal')),
    ]);
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const t of [diff, normal, rough, metal]) {
      t.repeat.set(repeatX, repeatY);
      t.anisotropy = maxAniso;
    }
    material.map = diff;
    material.normalMap = normal;
    material.roughnessMap = rough;
    material.metalnessMap = metal;
    material.color.setHex(0xffffff);
    material.roughness = 1;
    material.metalness = 1;
    material.needsUpdate = true;
    return true;
  } catch (err) {
    console.warn(`[NULL FLOOR] Poly Haven metal fallback used for ${slug}`, err);
    return applyPolyHavenMaterial(material, slug, repeatX, repeatY);
  }
}

async function applyBundledSurface(material, folder, repeatX, repeatY, {
  bumpScale = 0.02,
  normalScale = 1,
} = {}) {
  const roots = [
    `./assets/surfaces/${folder}`,
    `./public/assets/surfaces/${folder}`,
  ];
  const candidates = (file) => roots.map((root) => `${root}/${file}`);
  try {
    const [diff, normal, rough, height] = await Promise.all([
      loadTextureCandidates(candidates('diff_2k.jpg'), true),
      loadTextureCandidates(candidates('normal_2k.jpg')),
      loadTextureCandidates(candidates('rough_2k.jpg')),
      loadTextureCandidates(candidates('height_2k.jpg')),
    ]);
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const t of [diff, normal, rough, height]) {
      t.repeat.set(repeatX, repeatY);
      t.anisotropy = maxAniso;
    }
    material.map = diff;
    material.normalMap = normal;
    material.normalScale.set(normalScale, normalScale);
    material.roughnessMap = rough;
    material.bumpMap = height;
    material.bumpScale = bumpScale;
    material.color.setHex(0xffffff);
    material.roughness = 1;
    material.metalness = 0;
    material.needsUpdate = true;
    return true;
  } catch (err) {
    console.warn(`[NULL FLOOR] Bundled surface pack failed: ${folder}`, err);
    return false;
  }
}

async function upgradeSurfaces() {
  assetBadge.textContent = 'LOADING LOCAL 2K PBR';

  const [localWall, localFloor, localDoor] = await Promise.all([
    applyBundledSurface(wallMat, 'concrete_wall_004', 13, 1.45, { bumpScale: 0.035, normalScale: 0.8 }),
    applyBundledSurface(floorMat, 'concrete_floor_02', 2.3, 14, { bumpScale: 0.028, normalScale: 0.9 }),
    applyBundledSurface(doorMat, 'rough_pine_door', 1, 1, { bumpScale: 0.022, normalScale: 0.85 }),
  ]);

  // Preserve the existing Poly Haven stream as a graceful fallback if a bundled pack is missing.
  const wallReady = localWall || await applyPolyHavenMaterial(wallMat, 'worn_plaster_wall', 2, 10);
  const floorReady = localFloor || await applyPolyHavenMaterial(floorMat, 'worn_tile_floor', 3, 18);
  const ceilingReady = await applyPolyHavenMaterial(ceilingMat, 'ceiling_interior', 3, 18);
  await Promise.allSettled([
    applyPolyHavenMetalMaterial(elevatorWallMat, 'metal_plate_02', 2.4, 2.4),
    applyPolyHavenMetalMaterial(elevatorDoorMat, 'painted_metal_shutter', 1.3, 2.0),
    applyPolyHavenMetalMaterial(elevatorFloorMat, 'metal_grate_rusty', 2.3, 2.3),
  ]);

  if (localWall && localFloor && localDoor) {
    assetBadge.textContent = 'LOCAL 2K PBR · POLY HAVEN CC0 ART';
  } else if (wallReady || floorReady || ceilingReady) {
    assetBadge.textContent = `MIXED PBR · POLY HAVEN CC0 · ${assetStats.local ? 'LOCAL' : 'REMOTE'}`;
  } else {
    assetBadge.textContent = 'PBR FALLBACK · POLY HAVEN CC0';
  }
}

function meshBox(name, size, pos, mat, parent = scene, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  m.name = name;
  m.position.copy(pos);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// -----------------------------------------------------------------------------
// Poly Haven model manager (1K glTF for web performance)
// -----------------------------------------------------------------------------
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

function polyModelURLs(id) {
  const file = `${id}_1k.gltf`;
  return [
    `./assets/polyhaven/models/${id}/${file}`,
    `./public/assets/polyhaven/models/${id}/${file}`,
    `${PH}/Models/gltf/1k/${id}/${file}`,
  ];
}

const fallbackAssetColors = {
  WoodenChair_01: 0x4b2f1f,
  painted_wooden_chair_02: 0x31504a,
  painted_wooden_cabinet: 0x3b554f,
  vintage_suitcase: 0x4f5c45,
  metal_trash_can: 0x4c4f4b,
  trashbag: 0x171918,
  industrial_wall_lamp: 0x423b31,
  industrial_caged_sconce: 0x32312e,
  fancy_picture_frame_01: 0x4b3422,
  painted_wooden_bench: 0x4a5c50,
  cardboard_box_01: 0x8b6846,
  korean_fire_extinguisher_01: 0x9a1f20,
  small_wooden_table_01: 0x4a3021,
  power_box_01: 0x5b625f,
  utility_box_01: 0x4a564d,
  modular_electric_cables: 0x242628,
  security_camera_01: 0x565c5d,
  fire_alarm: 0xa52424,
  barrel_03: 0x385866,
  can_rusted: 0x6a4931,
  pipe_wrench: 0x8f2d24,
};

function fallbackAssetColor(id, materialName = '') {
  if (fallbackAssetColors[id]) return fallbackAssetColors[id];
  const text = `${id}:${materialName}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  const palette = [0x4b4036, 0x39423c, 0x4b4b47, 0x5b4936, 0x34383a, 0x5a554a];
  return palette[Math.abs(h) % palette.length];
}

function prepareModel(root, id = 'polyhaven') {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const prepared = list.map((source) => {
      if (!source) return source;
      const m = source.clone();
      m.envMapIntensity = 0.38;
      const textureReady = (tex) => !!(tex && (tex.image || tex.source?.data));
      const hasDiffuse = textureReady(m.map);
      if (!hasDiffuse) {
        // A glTF can technically finish after an image request failed. Never leave that as a white prop.
        if (m.map && !textureReady(m.map)) m.map = null;
        if (m.normalMap && !textureReady(m.normalMap)) m.normalMap = null;
        if (m.roughnessMap && !textureReady(m.roughnessMap)) m.roughnessMap = null;
        if (m.metalnessMap && !textureReady(m.metalnessMap)) m.metalnessMap = null;
        const c = fallbackAssetColor(id, m.name || o.name || 'material');
        m.color?.setHex(c);
        m.roughness = Number.isFinite(m.roughness) ? Math.max(m.roughness, .45) : .72;
        if (m.metalness == null) m.metalness = /metal|iron|steel/i.test(`${m.name} ${o.name}`) ? .65 : .05;
      } else if (m.color) {
        // Never multiply a valid Poly Haven diffuse map by a placeholder tint.
        m.color.setHex(0xffffff);
      }
      m.needsUpdate = true;
      return m;
    });
    o.material = Array.isArray(o.material) ? prepared : prepared[0];
  });
  return root;
}

function loadGltf(url, loader = gltfLoader, id = 'polyhaven') {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve({ root: prepareModel(gltf.scene, id), animations: gltf.animations || [] }), undefined, reject);
  });
}

async function loadPolyViaApi(id) {
  const res = await fetch(`${PH_API}/files/${encodeURIComponent(id)}`, { mode: 'cors', cache: 'force-cache' });
  if (!res.ok) throw new Error(`Poly Haven API ${res.status} for ${id}`);
  const files = await res.json();
  const resolutions = ['1k', '2k', '4k'];
  let main = null;
  for (const resKey of resolutions) {
    const candidate = files?.gltf?.[resKey]?.gltf;
    if (candidate?.url) { main = candidate; break; }
  }
  if (!main?.url) throw new Error(`No glTF package exposed for ${id}`);

  const includes = new Map();
  for (const [rel, meta] of Object.entries(main.include || {})) {
    if (!meta?.url) continue;
    const norm = rel.replaceAll('\\', '/');
    includes.set(norm, meta.url);
    includes.set(norm.split('/').pop(), meta.url);
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const clean = decodeURIComponent(url.split('?')[0]).replaceAll('\\', '/');
    const base = clean.split('/').pop();
    const tail2 = clean.split('/').slice(-2).join('/');
    return includes.get(clean) || includes.get(tail2) || includes.get(base) || url;
  });
  const loader = new GLTFLoader(manager);
  const loaded = await loadGltf(main.url, loader, id);
  assetStats.remote += 1;
  return loaded;
}

function loadPolyModel(id) {
  if (!modelCache.has(id)) {
    modelCache.set(id, (async () => {
      const localCandidates = [
        `./assets/polyhaven/models/${id}/${id}_1k.gltf`,
        `./public/assets/polyhaven/models/${id}/${id}_1k.gltf`,
      ];
      for (const url of localCandidates) {
        try {
          const loaded = await loadGltf(url, gltfLoader, id);
          assetStats.local += 1;
          return loaded;
        } catch {}
      }
      try {
        return await loadPolyViaApi(id);
      } catch (apiError) {
        // Last-chance legacy CDN path. The API path is preferred because it resolves include files correctly.
        let lastError = apiError;
        for (const url of polyModelURLs(id).slice(2)) {
          try {
            const loaded = await loadGltf(url, gltfLoader, id);
            assetStats.remote += 1;
            return loaded;
          } catch (err) { lastError = err; }
        }
        console.warn(`[NULL FLOOR] Poly Haven model failed: ${id}`, lastError);
        throw lastError || new Error(`Unable to load ${id}`);
      }
    })());
  }
  return modelCache.get(id);
}

async function spawnPolyProp(id, { parent, position, rotation = [0, 0, 0], scale = 1, name = id } = {}) {
  try {
    const loaded = await loadPolyModel(id);
    const root = loaded.root.clone(true);
    root.name = name;
    root.position.set(...position);
    root.rotation.set(...rotation);
    root.scale.setScalar(scale);
    (parent || scene).add(root);
    return root;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// World shell
// -----------------------------------------------------------------------------
const world = new THREE.Group();
scene.add(world);
const corridor = new THREE.Group();
world.add(corridor);
const decor = new THREE.Group();
world.add(decor);
const mutable = new THREE.Group();
world.add(mutable);
const blockers = [];
const ceilingLights = [];
const doorLabels = [];
const doorRecords = [];
const activeRoomZones = [];
const portraits = [];
const baseProps = {};

meshBox('floor', new THREE.Vector3(6.6, .16, 42), new THREE.Vector3(0, -.08, 0), floorMat, corridor, false);
meshBox('ceiling', new THREE.Vector3(6.6, .18, 42), new THREE.Vector3(0, 4.02, 0), ceilingMat, corridor, false);
meshBox('leftTrim', new THREE.Vector3(.12, .18, 42), new THREE.Vector3(-3.18, .13, 0), trimMat, corridor, false);
meshBox('rightTrim', new THREE.Vector3(.12, .18, 42), new THREE.Vector3(3.18, .13, 0), trimMat, corridor, false);

// Corridor side walls are segmented around every doorway. This gives real portal openings so
// selected apartments/service rooms can be entered instead of faking an open door against a solid wall.
const doorZs = [-13, -7, -1, 5, 11];
function buildSegmentedCorridorWall(side) {
  const x = side * 3.3;
  const gapHalf = .88;
  let cursor = -21;
  for (const z of doorZs) {
    const end = z - gapHalf;
    const len = end - cursor;
    if (len > .02) meshBox('wall-segment', new THREE.Vector3(.18, 4, len), new THREE.Vector3(x, 2, cursor + len / 2), wallMat, corridor, false);
    meshBox('door-wall-header', new THREE.Vector3(.18, 1.02, gapHalf * 2), new THREE.Vector3(x, 3.49, z), wallMat, corridor, false);
    cursor = z + gapHalf;
  }
  const len = 21 - cursor;
  if (len > .02) meshBox('wall-segment', new THREE.Vector3(.18, 4, len), new THREE.Vector3(x, 2, cursor + len / 2), wallMat, corridor, false);
}
buildSegmentedCorridorWall(-1);
buildSegmentedCorridorWall(1);

function textTexture(text, fg = '#d7d4ca', bg = 'rgba(0,0,0,0)', w = 256, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = fg;
  x.font = '700 54px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildDoor(side, z, num) {
  const x = side * 3.18;
  const pivot = new THREE.Group();
  pivot.name = `door-pivot-${num}`;
  pivot.position.set(x, 0, z - .73);
  corridor.add(pivot);

  const panel = meshBox(`door-${num}`, new THREE.Vector3(.12, 2.65, 1.46), new THREE.Vector3(0, 1.39, .73), doorMat, pivot);
  // Three shallow raised/inset zones give the pine doors architectural depth instead of a flat slab.
  for (const y of [.86, 1.68, 2.28]) {
    const h = y < 1 ? .52 : .42;
    meshBox('door-inset', new THREE.Vector3(.018, h, .92), new THREE.Vector3(-side * .071, y, .73), trimMat, pivot, false);
  }

  meshBox('frame', new THREE.Vector3(.16, 2.92, .1), new THREE.Vector3(x - side * .06, 1.5, z - .79), trimMat, corridor);
  meshBox('frame', new THREE.Vector3(.16, 2.92, .1), new THREE.Vector3(x - side * .06, 1.5, z + .79), trimMat, corridor);
  meshBox('frame', new THREE.Vector3(.16, .12, 1.7), new THREE.Vector3(x - side * .06, 2.94, z), trimMat, corridor);

  const knobStem = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .10, 12), metalMat);
  knobStem.rotation.z = Math.PI / 2;
  knobStem.position.set(-side * .08, 1.25, 1.18);
  pivot.add(knobStem);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.058, 16, 12), brassMat);
  knob.position.set(-side * .14, 1.25, 1.18);
  pivot.add(knob);

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(.44, .2), new THREE.MeshBasicMaterial({ map: textTexture(num), transparent: true }));
  plate.position.set(x - side * .071, 2.25, z);
  plate.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  corridor.add(plate);

  const rec = {
    index: doorRecords.length,
    side, z, base: num, pivot, panel, knob, label: plate,
    unlocked: false, open: false, opening: false, roomActive: false, roomType: null,
  };
  doorRecords.push(rec);
  doorLabels.push({ mesh: plate, base: num, record: rec });
  return rec;
}

doorZs.forEach((z, i) => {
  buildDoor(-1, z, String(801 + i * 2).padStart(3, '0'));
  buildDoor(1, z, String(802 + i * 2).padStart(3, '0'));
});

function buildElevator(z, facing) {
  const grp = new THREE.Group();
  grp.position.z = z;
  corridor.add(grp);

  // Architectural portal — separate jambs/header so the cabin is genuinely visible when doors open.
  meshBox('elevator-jamb-l', new THREE.Vector3(.42, 3.65, .48), new THREE.Vector3(-2.12, 1.83, 0), trimMat, grp);
  meshBox('elevator-jamb-r', new THREE.Vector3(.42, 3.65, .48), new THREE.Vector3(2.12, 1.83, 0), trimMat, grp);
  meshBox('elevator-header', new THREE.Vector3(4.65, .42, .48), new THREE.Vector3(0, 3.46, 0), trimMat, grp);
  meshBox('elevator-threshold', new THREE.Vector3(4.0, .08, .56), new THREE.Vector3(0, .02, -facing * .18), elevatorFloorMat, grp, false);

  // Sliding textured metal doors.
  const leftDoor = meshBox('elevator-left', new THREE.Vector3(1.94, 3.16, .12), new THREE.Vector3(-.98, 1.61, -facing * .16), elevatorDoorMat, grp);
  const rightDoor = meshBox('elevator-right', new THREE.Vector3(1.94, 3.16, .12), new THREE.Vector3(.98, 1.61, -facing * .16), elevatorDoorMat, grp);
  for (const door of [leftDoor, rightDoor]) {
    // Raised vertical seams make the doors read as fabricated steel even before PBR maps finish loading.
    for (let i = -1; i <= 1; i++) {
      const seam = meshBox('door-seam', new THREE.Vector3(.018, 2.85, .018), new THREE.Vector3(i * .52, 0, -facing * .075), trimMat, door, false);
      seam.position.y = 0;
    }
  }

  // Full cabin beyond the doors.
  const inside = -facing;
  const cabinCenter = inside * 1.72;
  meshBox('cabin-floor', new THREE.Vector3(3.92, .10, 3.15), new THREE.Vector3(0, -.01, cabinCenter), elevatorFloorMat, grp, false);
  meshBox('cabin-ceiling', new THREE.Vector3(3.92, .12, 3.15), new THREE.Vector3(0, 3.25, cabinCenter), elevatorWallMat, grp, false);
  meshBox('cabin-left-wall', new THREE.Vector3(.12, 3.25, 3.15), new THREE.Vector3(-1.96, 1.62, cabinCenter), elevatorWallMat, grp);
  meshBox('cabin-right-wall', new THREE.Vector3(.12, 3.25, 3.15), new THREE.Vector3(1.96, 1.62, cabinCenter), elevatorWallMat, grp);
  meshBox('cabin-back-wall', new THREE.Vector3(3.92, 3.25, .12), new THREE.Vector3(0, 1.62, inside * 3.27), elevatorWallMat, grp);

  // Lower protection panels and kick plates.
  meshBox('kick-back', new THREE.Vector3(3.75, .48, .06), new THREE.Vector3(0, .25, inside * 3.19), elevatorPaintMat, grp);
  meshBox('kick-left', new THREE.Vector3(.06, .48, 2.8), new THREE.Vector3(-1.88, .25, cabinCenter), elevatorPaintMat, grp);
  meshBox('kick-right', new THREE.Vector3(.06, .48, 2.8), new THREE.Vector3(1.88, .25, cabinCenter), elevatorPaintMat, grp);

  // Handrail set.
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb4aaa0, roughness: .27, metalness: .9 });
  const makeRail = (radius, length, pos, rot) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), railMat);
    m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; grp.add(m); return m;
  };
  makeRail(.045, 3.25, [0, 1.08, inside * 3.12], [0, 0, Math.PI / 2]);
  makeRail(.045, 2.45, [-1.82, 1.08, cabinCenter], [Math.PI / 2, 0, 0]);
  makeRail(.045, 2.45, [1.82, 1.08, cabinCenter], [Math.PI / 2, 0, 0]);

  // Ceiling fluorescent fixture and real cabin light.
  const cabinFixture = meshBox('cabin-fixture', new THREE.Vector3(1.8, .055, .55), new THREE.Vector3(0, 3.13, cabinCenter), fixtureMat, grp, false);
  const cabinLight = new THREE.PointLight(0xdfe5df, 0, 7.5, 2);
  cabinLight.position.set(0, 2.85, cabinCenter);
  cabinLight.castShadow = true;
  cabinLight.shadow.mapSize.set(512, 512);
  grp.add(cabinLight);

  // Exterior call panel.
  const panel = meshBox('call-panel', new THREE.Vector3(.30, .72, .09), new THREE.Vector3(2.52, 1.42, -facing * .25), elevatorPaintMat, grp);
  const led = new THREE.Mesh(new THREE.SphereGeometry(.062, 14, 12), new THREE.MeshStandardMaterial({ color: 0x350005, emissive: 0xb4131d, emissiveIntensity: 2.8, roughness: .35 }));
  led.position.set(2.52, 1.51, -facing * .31);
  grp.add(led);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .025, 18), new THREE.MeshStandardMaterial({ color: 0x85827b, roughness: .28, metalness: .85 }));
  button.rotation.x = Math.PI / 2;
  button.position.set(2.52, 1.27, -facing * .32);
  grp.add(button);

  // Interior control panel: 12 physical buttons, speaker grille and emergency stop.
  const controlX = 1.87;
  const controlZ = inside * 2.25;
  meshBox('control-panel', new THREE.Vector3(.08, 1.65, .76), new THREE.Vector3(controlX, 1.5, controlZ), elevatorPaintMat, grp);
  const panelButtons = [];
  let buttonNumber = 8;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .028, 16), new THREE.MeshStandardMaterial({ color: 0x77746d, roughness: .3, metalness: .86, emissive: 0x000000 }));
      b.rotation.z = Math.PI / 2;
      const by = 1.95 - row * .25;
      const bz = controlZ + (col - 1) * .19;
      b.position.set(controlX - .055, by, bz);
      grp.add(b); panelButtons.push(b);

      // Tiny engraved-looking floor legends keep the panel from reading like unlabeled placeholder cylinders.
      const labelText = buttonNumber > 0 ? String(buttonNumber--) : (col === 0 ? '◀' : col === 1 ? '■' : '▶');
      const label = new THREE.Mesh(new THREE.PlaneGeometry(.075, .055), new THREE.MeshBasicMaterial({ map: textTexture(labelText, '#bdb9ad', 'rgba(0,0,0,0)', 96, 72), transparent: true, toneMapped: false }));
      label.rotation.y = -Math.PI / 2;
      label.position.set(controlX - .047, by + .085, bz);
      grp.add(label);
    }
  }
  const emergency = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .035, 18), new THREE.MeshStandardMaterial({ color: 0x9f161c, roughness: .38, metalness: .35, emissive: 0x330000, emissiveIntensity: .6 }));
  emergency.rotation.z = Math.PI / 2;
  emergency.position.set(controlX - .065, .82, controlZ);
  grp.add(emergency);
  for (let i = 0; i < 12; i++) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.012, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    hole.rotation.y = -Math.PI / 2;
    hole.position.set(controlX - .071, 2.28 - Math.floor(i / 4) * .07, controlZ + (i % 4 - 1.5) * .05);
    grp.add(hole);
  }

  // Floor indicator and service placard.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(.92, .34), new THREE.MeshBasicMaterial({ map: textTexture('08', '#d61520', 'rgba(0,0,0,.92)', 256, 100), transparent: true, toneMapped: false }));
  sign.position.set(0, 3.48, -facing * .255);
  sign.rotation.y = facing < 0 ? Math.PI : 0;
  grp.add(sign);
  const placard = new THREE.Mesh(new THREE.PlaneGeometry(.88, .24), new THREE.MeshBasicMaterial({ map: textTexture('SERVICE', '#a7a39a', 'rgba(18,18,18,.96)', 420, 120), transparent: true }));
  placard.position.set(-1.34, 2.75, inside * 3.19);
  placard.rotation.y = facing > 0 ? 0 : Math.PI;
  grp.add(placard);

  const capacity = new THREE.Mesh(new THREE.PlaneGeometry(1.02, .42), new THREE.MeshBasicMaterial({ map: textTexture('2500 LB · 13 PERSONS', '#aaa69b', 'rgba(13,13,13,.95)', 620, 150), transparent: true }));
  capacity.position.set(.78, 2.72, inside * 3.19);
  capacity.rotation.y = facing > 0 ? 0 : Math.PI;
  grp.add(capacity);

  // Mechanical door tracks, sill grooves, and ceiling ventilation add close-up detail during rides.
  for (const x of [-1.86, -1.25, -.62, 0, .62, 1.25, 1.86]) {
    meshBox('threshold-groove', new THREE.Vector3(.018, .014, .52), new THREE.Vector3(x, .055, -facing * .19), rubberMat, grp, false);
  }
  const vent = meshBox('cabin-vent', new THREE.Vector3(.95, .035, .52), new THREE.Vector3(-.95, 3.16, cabinCenter + inside * .62), elevatorPaintMat, grp, false);
  for (let i=-4;i<=4;i++) meshBox('vent-slot', new THREE.Vector3(.045, .018, .42), new THREE.Vector3(-.95 + i*.095, 3.135, cabinCenter + inside*.62), rubberMat, grp, false);
  for (const zOff of [-.78, .78]) {
    const corner = new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,3.0,8), railMat);
    corner.position.set(-1.88,1.62,cabinCenter+zOff); corner.castShadow=true; grp.add(corner);
  }

  // Small bolts and grime-friendly geometry details.
  for (const x of [-2.25, 2.25]) for (const y of [.42, 1.15, 2.0, 2.85]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .025, 10), metalMat);
    bolt.rotation.x = Math.PI / 2; bolt.position.set(x, y, -facing * .27); grp.add(bolt);
  }

  return {
    grp, panel, led, button, sign, z, facing,
    doors: [leftDoor, rightDoor],
    cabinLight, cabinFixture, panelButtons,
    doorClosed: [-.98, .98],
    doorOpen: [-1.90, 1.90],
    busy: false,
  };
}

function elevatorForDirection() { return state.direction < 0 ? elevatorA : elevatorB; }
function entryElevatorForDirection() { return state.direction < 0 ? elevatorB : elevatorA; }

function setElevatorDoorPositions(el, amount) {
  const t = clamp(amount, 0, 1);
  el.doors[0].position.x = lerp(el.doorClosed[0], el.doorOpen[0], t);
  el.doors[1].position.x = lerp(el.doorClosed[1], el.doorOpen[1], t);
}

async function animateElevatorDoors(el, open, duration = 700) {
  const from = open ? 0 : 1;
  const to = open ? 1 : 0;
  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      let t = clamp((now - start) / duration, 0, 1);
      t = t * t * (3 - 2 * t);
      setElevatorDoorPositions(el, lerp(from, to, t));
      if (t < .999) requestAnimationFrame(frame); else { setElevatorDoorPositions(el, to); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

const elevatorA = buildElevator(-20.4, 1);
const elevatorB = buildElevator(20.4, -1);

for (let i = 0; i < 8; i++) {
  const z = -17.5 + i * 5;
  const fixture = meshBox('fixture', new THREE.Vector3(1.05, .08, .3), new THREE.Vector3(0, 3.88, z), fixtureMat, corridor, false);
  const l = new THREE.PointLight(0xf0e5c8, 14, 8, 2.2);
  l.position.set(0, 3.65, z);
  l.castShadow = i % 2 === 0;
  l.shadow.mapSize.set(512, 512);
  l.shadow.bias = -.001;
  corridor.add(l);
  ceilingLights.push({ light: l, fixture, z, base: 14, phase: Math.random() * 10 });
}
const ambience = new THREE.HemisphereLight(0x4e5961, 0x080706, .16);
scene.add(ambience);

// Procedural portrait canvases remain interactive, while Poly Haven frames replace the primitive frames.
function createPortrait(z, side = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const x = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(.72, 1.05), new THREE.MeshStandardMaterial({ map: tex, roughness: .82 }));
  p.position.set(side * 3.165, 2.08, z);
  p.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  corridor.add(p);
  const data = { mesh: p, canvas, ctx: x, tex, z, side };
  portraits.push(data);
  drawPortrait(data, 0);
}

function drawPortrait(p, eyeShift = 0) {
  const x = p.ctx;
  x.clearRect(0, 0, 256, 384);
  x.fillStyle = '#15120f';
  x.fillRect(0, 0, 256, 384);
  x.fillStyle = '#312e29';
  x.beginPath();
  x.ellipse(128, 167, 62, 94, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#080808';
  x.fillRect(79, 143, 46, 18);
  x.fillRect(134, 143, 46, 18);
  x.fillStyle = '#d8d0bf';
  x.beginPath();
  x.arc(105 + eyeShift, 152, 5, 0, Math.PI * 2);
  x.arc(155 + eyeShift, 152, 5, 0, Math.PI * 2);
  x.fill();
  p.tex.needsUpdate = true;
}

createPortrait(-10, 1);
createPortrait(2, 1);
createPortrait(13, 1);

async function placeWallSconceAssembly(side, z, y = 2.52) {
  // The Poly Haven lamp is treated as one authored fixture and mounted to a backing plate/conduit.
  // This avoids the old "loose lamp parts floating on a wall" look and gives it a believable power path.
  const mount = meshBox('sconce-mount', new THREE.Vector3(.055,.42,.34), new THREE.Vector3(side*3.055,y,z), elevatorPaintMat, decor, false);
  const conduit = meshBox('sconce-conduit', new THREE.Vector3(.035,.78,.035), new THREE.Vector3(side*3.06,y+.56,z), metalMat, decor, false);
  mount.castShadow = conduit.castShadow = false;
  const bulb = new THREE.PointLight(0xe0c59d, 2.8, 4.2, 2.1);
  bulb.position.set(side*2.82,y-.02,z);
  decor.add(bulb);
  return spawnPolyProp('industrial_caged_sconce', {
    parent: decor,
    position:[side*3.01,y,z],
    rotation:[0,side>0 ? -Math.PI/2 : Math.PI/2,0],
    scale:.48,
    name:`assembled-sconce-${side}-${z}`,
  });
}

function addExtinguisherBracket(side, z, y = 1.06) {
  meshBox('extinguisher-bracket', new THREE.Vector3(.045,.30,.22), new THREE.Vector3(side*3.055,y,z), elevatorPaintMat, decor, false);
  meshBox('extinguisher-strap', new THREE.Vector3(.09,.045,.30), new THREE.Vector3(side*2.99,y-.02,z), metalMat, decor, false);
}

async function populatePolyHavenDecor() {
  addExtinguisherBracket(1,-15.7,1.02);
  const jobs = [
    spawnPolyProp('WoodenChair_01', { parent: decor, position: [-2.25, 0, 8.6], rotation: [0, Math.PI / 2, 0], scale: .72, name: 'ph-chair' }).then((o) => baseProps.chair = o),
    spawnPolyProp('painted_wooden_cabinet', { parent: decor, position: [2.62, 0, -9.1], rotation: [0, -Math.PI / 2, 0], scale: .88, name: 'ph-cabinet' }).then((o) => baseProps.cabinet = o),
    spawnPolyProp('vintage_suitcase', { parent: decor, position: [2.25, .03, 4.2], rotation: [0, -1.2, 0], scale: .55, name: 'ph-suitcase' }).then((o) => baseProps.suitcase = o),
    spawnPolyProp('metal_trash_can', { parent: decor, position: [-2.35, 0, -14.8], rotation: [0, .35, 0], scale: .52, name: 'ph-trashcan' }).then((o) => baseProps.trash = o),
    spawnPolyProp('trashbag', { parent: decor, position: [-2.0, 0, -12.9], rotation: [0, -.2, 0], scale: .7, name: 'ph-trashbag' }).then((o) => baseProps.trashbag = o),
    placeWallSconceAssembly(-1,-4,2.52),
    spawnPolyProp('painted_wooden_bench', { parent: decor, position: [-2.45, 0, -4.7], rotation: [0, Math.PI / 2, 0], scale: .9, name: 'ph-bench' }),
    spawnPolyProp('cardboard_box_01', { parent: decor, position: [2.42, 0, 14.1], rotation: [0, -.45, 0], scale: .9, name: 'ph-box' }),
    spawnPolyProp('korean_fire_extinguisher_01', { parent: decor, position: [2.76, .42, -15.7], rotation: [0, -Math.PI / 2, 0], scale: .76, name: 'ph-extinguisher' }),
    spawnPolyProp('small_wooden_table_01', { parent: decor, position: [-2.45, 0, 14.8], rotation: [0, Math.PI / 2, 0], scale: .75, name: 'ph-side-table' }),
    spawnPolyProp('power_box_01', { parent: decor, position: [-3.03, 1.25, -17.1], rotation: [0, Math.PI / 2, 0], scale: 1.08, name: 'ph-power-box' }).then((o) => baseProps.powerBox = o),
    spawnPolyProp('utility_box_01', { parent: decor, position: [2.62, 0, 16.2], rotation: [0, -Math.PI / 2, 0], scale: .62, name: 'ph-utility-box' }),
    placeWallSconceAssembly(1,17.4,2.46),
    placeWallSconceAssembly(-1,-17.4,2.46),
    spawnPolyProp('modular_electric_cables', { parent: decor, position: [-2.96, 2.42, -16.45], rotation: [0, Math.PI / 2, 0], scale: .34, name: 'ph-cables' }),
    spawnPolyProp('security_camera_01', { parent: decor, position: [2.94, 3.15, -11.8], rotation: [0, -Math.PI / 2, -.08], scale: .55, name: 'ph-security-camera' }).then((o) => baseProps.securityCamera = o),
    spawnPolyProp('fire_alarm', { parent: decor, position: [-3.05, 1.42, 6.7], rotation: [0, Math.PI / 2, 0], scale: 1.25, name: 'ph-fire-alarm' }),
    spawnPolyProp('barrel_03', { parent: decor, position: [-2.52, 0, 16.0], rotation: [0, .18, 0], scale: .68, name: 'ph-barrel' }),
    spawnPolyProp('can_rusted', { parent: decor, position: [-2.38, .76, 14.48], rotation: [0, -.28, .05], scale: .72, name: 'ph-rusted-can' }),
    spawnPolyProp('pipe_wrench', { parent: decor, position: [-2.42, .78, 14.84], rotation: [0, .25, Math.PI / 2], scale: .56, name: 'ph-pipe-wrench-decor' }),
  ];
  for (const p of portraits) {
    jobs.push(spawnPolyProp('fancy_picture_frame_01', {
      parent: decor,
      position: [p.side * 3.12, 2.08, p.z],
      rotation: [0, p.side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI / 2],
      scale: 1.25,
      name: 'ph-frame',
    }));
  }
  await Promise.allSettled(jobs);
}

// -----------------------------------------------------------------------------
// Atmospheric dust — restrained, slow particles that catch corridor light.
// -----------------------------------------------------------------------------
const dustGeo = new THREE.BufferGeometry();
const dustPositions = new Float32Array(260 * 3);
{
  const rnd = seeded(9173);
  for (let i = 0; i < 260; i++) {
    dustPositions[i*3] = (rnd() - .5) * 5.7;
    dustPositions[i*3+1] = .25 + rnd() * 3.55;
    dustPositions[i*3+2] = -19 + rnd() * 38;
  }
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dustMat = new THREE.PointsMaterial({ color: 0xc1b9a8, size: .018, transparent: true, opacity: .17, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
const dust = new THREE.Points(dustGeo, dustMat);
scene.add(dust);

// -----------------------------------------------------------------------------
// Flashlight
// -----------------------------------------------------------------------------
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, 0, -8);
camera.add(flashTarget);
const flashlight = new THREE.SpotLight(0xe9edf2, 44, 18, Math.PI / 7.5, .38, 1.65);
flashlight.position.set(.12, -.08, .05);
flashlight.target = flashTarget;
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.bias = -.0005;
camera.add(flashlight);

// -----------------------------------------------------------------------------
// Skeletal horror entities — real bone rigs, painted materials, authored gait
// -----------------------------------------------------------------------------
function makeFleshTexture(seed = 13, base = '#8b8175', bruise = '#39282b') {
  const rnd = seeded(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const a = .015 + rnd() * .05;
    const v = 80 + Math.floor(rnd() * 95);
    x.fillStyle = `rgba(${v + 18},${v + 4},${v},${a})`;
    x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 24; i++) {
    const gx = rnd() * 256, gy = rnd() * 256, r = 10 + rnd() * 36;
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, bruise + '88'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(gx-r, gy-r, r*2, r*2);
  }
  x.strokeStyle = 'rgba(48,25,30,.28)'; x.lineWidth = 1;
  for (let i = 0; i < 28; i++) {
    x.beginPath();
    let px = rnd()*256, py = rnd()*256; x.moveTo(px,py);
    for (let k=0;k<5;k++){ px += (rnd()-.5)*30; py += 9+rnd()*20; x.lineTo(px,py); }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}

const creatureSkinMat = new THREE.MeshStandardMaterial({ map: makeFleshTexture(31), color: 0xa79b8d, roughness: .72, metalness: 0 });
const creatureDarkSkinMat = new THREE.MeshStandardMaterial({ map: makeFleshTexture(54, '#5d5a54', '#201b20'), color: 0x807a70, roughness: .67, metalness: 0 });
const creatureWetMat = new THREE.MeshStandardMaterial({ color: 0x281719, roughness: .22, metalness: .02 });
const creatureMouthMat = new THREE.MeshStandardMaterial({ color: 0x260005, emissive: 0x210003, emissiveIntensity: .22, roughness: .38 });
const creatureToothMat = new THREE.MeshStandardMaterial({ color: 0xcfc5aa, roughness: .62, metalness: 0 });
const creatureEyeMat = new THREE.MeshStandardMaterial({ color: 0xd5d6c9, emissive: 0x899a83, emissiveIntensity: 1.1, roughness: .22 });

function creatureCapsule(radius, length, mat = creatureSkinMat, radial = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, radial), mat);
  m.castShadow = true; m.receiveShadow = true; return m;
}

function boneSegment(parent, name, position, mesh) {
  const bone = new THREE.Bone(); bone.name = name; bone.position.set(...position); parent.add(bone);
  if (mesh) bone.add(mesh);
  return bone;
}

function buildRiggedCreature(variant = 'stalker') {
  const root = new THREE.Group();
  root.name = `rigged-${variant}`; root.visible = false;
  const crouched = variant === 'crawler';
  const skin = crouched ? creatureDarkSkinMat : creatureSkinMat;

  const pelvis = boneSegment(root, 'pelvis', [0, crouched ? .76 : 1.06, 0]);
  const pelvisMesh = creatureCapsule(.28, .34, skin); pelvisMesh.scale.set(1.1,.8,.72); pelvis.add(pelvisMesh);
  const spine = boneSegment(pelvis, 'spine', [0, .38, 0]);
  const torsoMesh = creatureCapsule(.34, .86, skin); torsoMesh.position.y=.43; torsoMesh.scale.set(.9,1,.6); spine.add(torsoMesh);
  const chest = boneSegment(spine, 'chest', [0, .86, 0]);
  const chestMesh = creatureCapsule(.37, .38, skin); chestMesh.position.y=.17; chestMesh.scale.set(.95,.82,.58); chest.add(chestMesh);
  const neck = boneSegment(chest, 'neck', [0, .43, 0]);
  const neckMesh = creatureCapsule(.11,.28,creatureWetMat); neckMesh.position.y=.15; neck.add(neckMesh);
  const head = boneSegment(neck, 'head', [0,.34,-.02]);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.31,20,16), skin); skull.scale.set(.72,1.28,.8); skull.castShadow=true; head.add(skull);

  // Empty eye sockets + luminous wet eyes deep inside them.
  const socketMat = new THREE.MeshBasicMaterial({color:0x020202});
  for (const side of [-1,1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(.062,10,8), socketMat); socket.position.set(side*.105,.07,-.238); socket.scale.set(1.25,.72,.4); head.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.025,10,8), creatureEyeMat); eye.position.set(side*.105,.066,-.278); head.add(eye);
  }
  const jaw = boneSegment(head, 'jaw', [0,-.22,-.09]);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(.29,.16,.22), creatureMouthMat); mouth.position.set(0,-.03,-.06); mouth.castShadow=true; jaw.add(mouth);
  for (let i=0;i<6;i++) {
    for (const row of [-1,1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(.018,.10,7), creatureToothMat);
      tooth.position.set((i-2.5)*.044, row*.05, -.17); tooth.rotation.x = row>0 ? Math.PI : 0; mouth.add(tooth);
    }
  }

  const limb = (side, isArm) => {
    const anchor = boneSegment(isArm ? chest : pelvis, isArm ? `${side<0?'L':'R'}_shoulder` : `${side<0?'L':'R'}_hip`,
      isArm ? [side*.47,.20,0] : [side*.22,-.05,0]);
    const upperLen = isArm ? (crouched? .92:.82) : .78;
    const lowerLen = isArm ? (crouched? 1.02:.88) : .83;
    const upper = creatureCapsule(isArm?.095:.14, upperLen, skin); upper.position.y = -upperLen*.5; anchor.add(upper);
    const joint = boneSegment(anchor, isArm ? 'elbow':'knee', [0,-upperLen,0]);
    const lower = creatureCapsule(isArm?.078:.105, lowerLen, creatureWetMat); lower.position.y = -lowerLen*.5; joint.add(lower);
    const end = boneSegment(joint, isArm ? 'wrist':'ankle', [0,-lowerLen,0]);
    if (isArm) {
      const palm = new THREE.Mesh(new THREE.SphereGeometry(.10,12,10), creatureWetMat); palm.scale.set(.72,1.22,.6); palm.position.y=-.08; end.add(palm);
      for (let f=-2;f<=2;f++) { const finger=creatureCapsule(.015,.27+Math.abs(f)*.025,creatureWetMat,7); finger.position.set(f*.035,-.24,0); finger.rotation.z=f*.035; end.add(finger); }
    } else {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.22,.12,.47), creatureWetMat); foot.position.set(0,-.08,-.13); foot.castShadow=true; end.add(foot);
    }
    return { anchor, joint, end };
  };
  const leftArm=limb(-1,true), rightArm=limb(1,true), leftLeg=limb(-1,false), rightLeg=limb(1,false);

  // Bone ridges / vertebrae make silhouettes much less mannequin-like.
  for(let i=0;i<5;i++){
    const spike=new THREE.Mesh(new THREE.ConeGeometry(.045,.22,7),creatureWetMat); spike.rotation.x=Math.PI/2; spike.position.set(0,.22+i*.17,.29); spine.add(spike);
  }
  const ribs=[];
  for(let i=0;i<4;i++){
    const rib=new THREE.Mesh(new THREE.TorusGeometry(.29-i*.018,.018,6,18,Math.PI*1.55),creatureWetMat); rib.rotation.set(Math.PI/2,0,.3); rib.position.set(0,.64-i*.15,-.13); spine.add(rib); ribs.push(rib);
  }

  if (crouched) {
    spine.rotation.x = -.72; neck.rotation.x=.58; leftArm.anchor.rotation.x=-.75; rightArm.anchor.rotation.x=-.75;
    root.scale.set(1.04,.92,1.04);
  } else {
    root.scale.set(1.08,1.12,1.08);
  }

  root.userData.rig = { pelvis, spine, chest, neck, head, jaw, leftArm, rightArm, leftLeg, rightLeg, ribs, variant };
  root.userData.isRigged = true;
  scene.add(root);
  return root;
}

const entity = buildRiggedCreature('stalker');
const crawler = buildRiggedCreature('crawler');

function animateCreature(creature, dt, velocity = 0, attack = false) {
  if (!creature.visible) return;
  const r = creature.userData.rig;
  const t = state.elapsed + (r.variant === 'crawler' ? 1.7 : 0);
  const moving = velocity > .08;
  const cadence = r.variant === 'crawler' ? 5.2 : 3.8;
  const gait = t * (cadence + velocity * 1.25);
  const stride = moving ? Math.sin(gait) * clamp(velocity/4,.12,.82) : 0;
  r.leftLeg.anchor.rotation.x = stride;
  r.rightLeg.anchor.rotation.x = -stride;
  r.leftLeg.joint.rotation.x = moving ? Math.max(0,-stride)*.95 : .05;
  r.rightLeg.joint.rotation.x = moving ? Math.max(0,stride)*.95 : -.02;
  r.leftArm.anchor.rotation.x = -stride*.72 + (r.variant==='crawler'?-1.05:.12);
  r.rightArm.anchor.rotation.x = stride*.72 + (r.variant==='crawler'?-1.05:-.12);
  r.leftArm.anchor.rotation.z = -.16; r.rightArm.anchor.rotation.z=.16;
  r.leftArm.joint.rotation.x = -.22-Math.abs(stride)*.35;
  r.rightArm.joint.rotation.x = -.22-Math.abs(stride)*.35;
  r.pelvis.rotation.z = Math.sin(gait*.5)*.035;
  r.spine.rotation.z = -r.pelvis.rotation.z*.8;
  if (r.variant !== 'crawler') r.spine.rotation.x = -.08 + Math.sin(t*1.8)*.025;
  r.head.rotation.z = Math.sin(t*10.7)*.022 + (Math.sin(t*2.23)>.989 ? .28 : 0);
  r.head.rotation.x = .08 + Math.sin(t*1.4)*.035;
  r.jaw.rotation.x = -.06 + Math.max(0,Math.sin(t*4.7))*.10;
  if (attack || state.entityMode === 'hunter' || state.finaleRunning) {
    r.spine.rotation.x -= .22; r.head.rotation.x=-.22;
    r.leftArm.anchor.rotation.x -= .62; r.rightArm.anchor.rotation.x -= .62;
    r.jaw.rotation.x=.42+Math.max(0,Math.sin(t*9))*.16;
  }
}

function animateEntity(dt, velocity = 0) { animateCreature(entity, dt, velocity, state.entityMode==='hunter' || state.finaleRunning); }

// -----------------------------------------------------------------------------
// Mutable props / anomalies
// -----------------------------------------------------------------------------
function clearMutable() {
  while (mutable.children.length) {
    const o = mutable.children.pop();
    o.traverse?.((c) => {
      if (c.userData?.ephemeralGeometry) c.geometry?.dispose?.();
      if (c.material?.userData?.ephemeral) c.material.dispose?.();
    });
  }
}

function addWallWriting(text, z = 0, side = -1, color = '#6e0c10') {
  const tex = textTexture(text, color, 'rgba(0,0,0,0)', 700, 180);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  mat.userData.ephemeral = true;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 1.1), mat);
  p.userData.ephemeralGeometry = true;
  p.position.set(side * 3.185, 2.0, z);
  p.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  mutable.add(p);
  return p;
}

function addRedPool(z) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x250000, roughness: .42, metalness: 0 });
  mat.userData.ephemeral = true;
  const m = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40), mat);
  m.userData.ephemeralGeometry = true;
  m.rotation.x = -Math.PI / 2;
  m.position.set(.5, .012, z);
  m.scale.set(1.7, .7, 1);
  mutable.add(m);
  return m;
}

function addShadowFigure(z, x = 0, opacity = .5) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false });
  mat.userData.ephemeral = true;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.28, 1.2, 4, 8), mat);
  body.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 10, 8), mat);
  head.position.y = 2.25;
  g.add(body, head);
  g.position.set(x, 0, z);
  mutable.add(g);
  return g;
}

async function addPolyAnomalyProp(id, opts) {
  return spawnPolyProp(id, { parent: mutable, ...opts });
}

// -----------------------------------------------------------------------------
// Door + enterable room system
// -----------------------------------------------------------------------------
let roomGeneration = 0;
const roomProfiles = {
  6: { doorIndex: 7, type: 'tenant013' },   // right side, z=5 — Apartment 013
  4: { doorIndex: 2, type: 'maintenance' }, // left side, z=-7
  2: { doorIndex: 9, type: 'utility' },     // right side, z=11
};

function resetDoorState() {
  activeRoomZones.length = 0;
  roomGeneration += 1;
  for (const d of doorRecords) {
    d.unlocked = false;
    d.open = false;
    d.opening = false;
    d.roomActive = false;
    d.roomType = null;
    d.pivot.rotation.y = 0;
  }
}

function doorWorldPoint(d) {
  return d.knob.getWorldPosition(new THREE.Vector3());
}

function addAllDoorInteractables() {
  for (const d of doorRecords) {
    interactables.push({ type: 'door', door: d, object: d.knob, radius: 1.48, requiresAim: true, aimDot: .60 });
  }
}

function jiggleLockedDoor(d) {
  if (!d || d.opening) return;
  d.opening = true;
  showToast('THE DOOR IS LOCKED', 1500);
  const base = d.pivot.rotation.y;
  const sequence = [0, .018, -.014, .010, -.006, 0];
  sequence.forEach((offset, i) => setTimeout(() => {
    d.pivot.rotation.y = base + offset * d.side;
    if (i === 1 || i === 3) recorded.play2D('latch', .24, .84 + i * .08) || audio.click();
    if (i === sequence.length - 1) { d.pivot.rotation.y = base; d.opening = false; }
  }, i * 62));
}

function animateApartmentDoor(d, shouldOpen) {
  if (!d || d.opening || !d.unlocked) return;
  d.opening = true;
  const start = d.pivot.rotation.y;
  const target = shouldOpen ? d.side * 1.43 : 0;
  const began = performance.now();
  recorded.play2D('latch', .30, shouldOpen ? .92 : .78) || audio.click();
  if (shouldOpen) setTimeout(() => recorded.play2D('creak', .18, .76), 130);
  const frame = (now) => {
    let t = clamp((now - began) / 620, 0, 1);
    t = t * t * (3 - 2 * t);
    d.pivot.rotation.y = lerp(start, target, t);
    if (t < .999) requestAnimationFrame(frame);
    else {
      d.pivot.rotation.y = target;
      d.open = shouldOpen;
      d.opening = false;
    }
  };
  requestAnimationFrame(frame);
}

function handleDoorInteraction(d) {
  if (!d) return;
  if (!d.unlocked) { jiggleLockedDoor(d); return; }
  animateApartmentDoor(d, !d.open);
}

async function spawnRoomProp(id, opts, generation = roomGeneration) {
  const obj = await spawnPolyProp(id, { parent: mutable, ...opts });
  if (generation !== roomGeneration && obj?.parent) obj.parent.remove(obj);
  return obj;
}

function buildRoomShell(d, type) {
  const side = d.side;
  const z = d.z;
  const depth = 4.75;
  const width = 5.15;
  const roomH = 3.18;
  const nearX = side * 3.18;
  const farX = side * (3.18 + depth);
  const centerX = (nearX + farX) / 2;
  const farInnerX = side * (3.18 + depth - .18);
  const g = new THREE.Group();
  g.name = `room-${type}`;
  mutable.add(g);

  meshBox('room-floor', new THREE.Vector3(depth, .12, width), new THREE.Vector3(centerX, -.05, z), floorMat, g, false);
  meshBox('room-ceiling', new THREE.Vector3(depth, .12, width), new THREE.Vector3(centerX, roomH, z), ceilingMat, g, false);
  meshBox('room-far-wall', new THREE.Vector3(.16, roomH, width), new THREE.Vector3(farX, roomH/2, z), wallMat, g, false);
  meshBox('room-side-a', new THREE.Vector3(depth, roomH, .16), new THREE.Vector3(centerX, roomH/2, z-width/2), wallMat, g, false);
  meshBox('room-side-b', new THREE.Vector3(depth, roomH, .16), new THREE.Vector3(centerX, roomH/2, z+width/2), wallMat, g, false);

  // Baseboard / trim makes the spaces read like deliberately dressed rooms, not hollow boxes.
  meshBox('room-base-far', new THREE.Vector3(.08, .16, width-.14), new THREE.Vector3(farInnerX, .10, z), trimMat, g, false);
  meshBox('room-base-a', new THREE.Vector3(depth-.2, .16, .08), new THREE.Vector3(centerX, .10, z-width/2+.09), trimMat, g, false);
  meshBox('room-base-b', new THREE.Vector3(depth-.2, .16, .08), new THREE.Vector3(centerX, .10, z+width/2-.09), trimMat, g, false);

  const fixture = meshBox('room-light-fixture', new THREE.Vector3(.74,.055,.30), new THREE.Vector3(centerX, roomH-.08, z-.35), fixtureMat, g, false);
  fixture.material = fixtureMat;
  const light = new THREE.PointLight(type === 'tenant013' ? 0xcbb89a : 0xc9d2cf, type === 'utility' ? 7.5 : 10.5, 6.5, 2);
  light.position.set(centerX, roomH-.34, z-.35);
  light.castShadow = false;
  g.add(light);

  d.roomActive = true;
  d.roomType = type;
  activeRoomZones.push({ door: d, side, z, nearX, farX, centerX, width, depth, roomH, group: g });
  return activeRoomZones.at(-1);
}

function roomX(zone, inwardMeters) {
  return zone.side * (3.18 + inwardMeters);
}

async function dressTenantRoom(zone) {
  const gen = roomGeneration;
  const z = zone.z;
  // Furniture follows real placement logic: storage on walls, chair by table, suitcase at furniture edge,
  // rubbish in a corner. These are intentionally arranged rather than randomly scattered.
  await Promise.allSettled([
    spawnRoomProp('painted_wooden_cabinet', { position:[roomX(zone,4.15),0,z+1.55], rotation:[0, zone.side>0 ? -Math.PI/2 : Math.PI/2,0], scale:.80, name:'013-cabinet' }, gen),
    spawnRoomProp('small_wooden_table_01', { position:[roomX(zone,3.05),0,z-.55], rotation:[0,.08,0], scale:.76, name:'013-table' }, gen),
    spawnRoomProp('WoodenChair_01', { position:[roomX(zone,2.35),0,z-.95], rotation:[0,zone.side>0 ? .78 : -.78,0], scale:.68, name:'013-chair' }, gen),
    spawnRoomProp('vintage_suitcase', { position:[roomX(zone,3.82),.03,z+1.02], rotation:[0,.18,0], scale:.56, name:'013-suitcase' }, gen),
    spawnRoomProp('trashbag', { position:[roomX(zone,4.08),0,z-1.72], rotation:[0,-.3,0], scale:.62, name:'013-trash' }, gen),
    spawnRoomProp('fancy_picture_frame_01', { position:[roomX(zone,4.58),1.85,z-.15], rotation:[0,zone.side>0 ? -Math.PI/2 : Math.PI/2,Math.PI/2], scale:1.05, name:'013-frame' }, gen),
  ]);
  if (gen !== roomGeneration) return;
  if (!state.inventory.fuse) makePartObject('fuse', [roomX(zone,3.0), .78, z-.48]);
  addRoomWriting(zone, '013', z + 1.82, '#661015');
}

async function dressMaintenanceRoom(zone) {
  const gen = roomGeneration;
  const z = zone.z;
  await Promise.allSettled([
    spawnRoomProp('power_box_01', { position:[roomX(zone,4.48),1.08,z], rotation:[0,zone.side>0 ? -Math.PI/2 : Math.PI/2,0], scale:.95, name:'maint-power-box' }, gen),
    spawnRoomProp('modular_electric_cables', { position:[roomX(zone,4.38),2.35,z+.58], rotation:[0,zone.side>0 ? -Math.PI/2 : Math.PI/2,0], scale:.34, name:'maint-cables' }, gen),
    spawnRoomProp('painted_wooden_bench', { position:[roomX(zone,2.8),0,z-1.55], rotation:[0,0,0], scale:.72, name:'maint-bench' }, gen),
    spawnRoomProp('cardboard_box_01', { position:[roomX(zone,3.75),0,z+1.55], rotation:[0,-.35,0], scale:.72, name:'maint-box' }, gen),
    spawnRoomProp('korean_fire_extinguisher_01', { position:[roomX(zone,4.28),.52,z-1.76], rotation:[0,zone.side>0 ? -Math.PI/2 : Math.PI/2,0], scale:.76, name:'maint-extinguisher' }, gen),
    spawnRoomProp('barrel_03', { position:[roomX(zone,3.55),0,z+1.35], rotation:[0,.16,0], scale:.58, name:'maint-barrel' }, gen),
  ]);
  if (gen !== roomGeneration) return;
  if (!state.inventory.key) makePartObject('key', [roomX(zone,2.75), .78, z-1.35]);
  if (!state.weapon) makeWeaponPickup([roomX(zone,2.78), .84, z-1.7]);
}

async function dressUtilityRoom(zone) {
  const gen = roomGeneration;
  const z = zone.z;
  await Promise.allSettled([
    spawnRoomProp('utility_box_01', { position:[roomX(zone,4.12),0,z+1.48], rotation:[0,zone.side>0 ? -Math.PI/2 : Math.PI/2,0], scale:.68, name:'utility-box-room' }, gen),
    spawnRoomProp('power_box_01', { position:[roomX(zone,4.45),1.10,z-.75], rotation:[0,zone.side>0 ? -Math.PI/2 : Math.PI/2,0], scale:.9, name:'utility-panel-room' }, gen),
    spawnRoomProp('modular_electric_cables', { position:[roomX(zone,4.35),2.15,z-.10], rotation:[0,zone.side>0 ? -Math.PI/2 : Math.PI/2,0], scale:.38, name:'utility-cables-room' }, gen),
    spawnRoomProp('metal_trash_can', { position:[roomX(zone,3.72),0,z-1.65], rotation:[0,.2,0], scale:.48, name:'utility-trash' }, gen),
    spawnRoomProp('barrel_03', { position:[roomX(zone,3.2),0,z+1.45], rotation:[0,-.12,0], scale:.58, name:'utility-barrel' }, gen),
    spawnRoomProp('can_rusted', { position:[roomX(zone,3.58),.16,z+1.10], rotation:[0,.3,.08], scale:.82, name:'utility-can' }, gen),
  ]);
  if (gen !== roomGeneration) return;
  if (!state.inventory.relay) makePartObject('relay', [roomX(zone,3.65), .38, z+.25]);
}

function addRoomWriting(zone, text, z, color='#5f0c10') {
  const tex = textTexture(text, color, 'rgba(0,0,0,0)', 500, 180);
  const mat = new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false });
  mat.userData.ephemeral = true;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5,.58), mat);
  p.userData.ephemeralGeometry = true;
  p.position.set(roomX(zone,4.63),1.75,z);
  p.rotation.y = zone.side > 0 ? -Math.PI/2 : Math.PI/2;
  mutable.add(p);
}

function configureDoorsAndRooms() {
  resetDoorState();
  addAllDoorInteractables();
  const profile = roomProfiles[state.floor];
  if (!profile) return;
  const d = doorRecords[profile.doorIndex];
  if (!d) return;
  d.unlocked = true;
  const zone = buildRoomShell(d, profile.type);
  if (profile.type === 'tenant013') dressTenantRoom(zone);
  if (profile.type === 'maintenance') dressMaintenanceRoom(zone);
  if (profile.type === 'utility') dressUtilityRoom(zone);
}

// -----------------------------------------------------------------------------
// Objective / pickup system — three components are required to escape Floor 00
// -----------------------------------------------------------------------------
const interactables = [];
const partMeta = {
  fuse: { label: 'SERVICE FUSE', color: 0xc83035 },
  key: { label: 'MAINTENANCE KEY', color: 0xb99b58 },
  relay: { label: 'OVERRIDE RELAY', color: 0x6b96a8 },
};

function showToast(text, ms = 1800) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function updateInventoryUI() {
  for (const id of Object.keys(partMeta)) {
    inventoryEl.querySelector(`[data-part="${id}"]`)?.classList.toggle('owned', !!state.inventory[id]);
  }
}

function makePartObject(id, position) {
  const meta = partMeta[id];
  const g = new THREE.Group();
  g.name = `pickup-${id}`;
  g.position.set(...position);
  const bodyMat = new THREE.MeshStandardMaterial({ color: meta.color, roughness: .36, metalness: .58, emissive: new THREE.Color(meta.color).multiplyScalar(.12), emissiveIntensity: .55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x181817, roughness: .78, metalness: .25 });
  if (id === 'fuse') {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.42,18), bodyMat); core.rotation.z=Math.PI/2; g.add(core);
    for (const x of [-.25,.25]) { const cap=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.09,18),brassMat); cap.rotation.z=Math.PI/2; cap.position.x=x; g.add(cap); }
  } else if (id === 'key') {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.48), brassMat); stem.position.z=-.09; g.add(stem);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.13,.035,8,20), brassMat); ring.rotation.x=Math.PI/2; ring.position.z=.2; g.add(ring);
    for (let i=0;i<3;i++) { const tooth=new THREE.Mesh(new THREE.BoxGeometry(.055,.08,.08),brassMat); tooth.position.set(.06*(i-1),0,-.34-i*.03); g.add(tooth); }
  } else {
    const base = new THREE.Mesh(new THREE.BoxGeometry(.42,.18,.30), dark); g.add(base);
    for(let i=0;i<4;i++){ const coil=new THREE.Mesh(new THREE.TorusGeometry(.045,.014,7,16),bodyMat); coil.rotation.x=Math.PI/2; coil.position.set((i-1.5)*.09,.11,0); g.add(coil); }
    const plate=new THREE.Mesh(new THREE.BoxGeometry(.34,.04,.22),brassMat); plate.position.y=-.11; g.add(plate);
  }
  g.traverse((o)=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
  mutable.add(g);
  interactables.push({ type:'part', id, object:g, radius:1.35, prompt:`TAKE ${meta.label}` });
  return g;
}

async function makeWeaponPickup(position) {
  const gen = roomGeneration;
  let obj = await spawnRoomProp('pipe_wrench', { position, rotation:[0,.18,Math.PI/2], scale:.62, name:'weapon-pipe-wrench' }, gen);
  if (gen !== roomGeneration) return null;
  if (!obj) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.62,12), new THREE.MeshStandardMaterial({color:0x7f2921,roughness:.55,metalness:.55}));
    handle.rotation.z=Math.PI/2; g.add(handle);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(.20,.08,.09), metalMat); jaw.position.x=.31; g.add(jaw);
    g.position.set(...position); mutable.add(g); obj=g;
  }
  interactables.push({ type:'weapon', id:'pipe_wrench', object:obj, radius:1.25, prompt:'TAKE PIPE WRENCH', requiresAim:true, aimDot:.45 });
  return obj;
}

function collectWeapon(item) {
  if (!item || item.type !== 'weapon' || state.weapon) return;
  state.weapon = true;
  state.weaponDurability = 3;
  item.object.visible = false;
  audio.click();
  showToast('PIPE WRENCH ACQUIRED · LEFT CLICK / B TO SWING', 2300);
  writeCheckpoint();
}

let meleeCooldownUntil = 0;
function meleeAttack() {
  if (!state.running || state.paused || state.transitioning || state.dead || !state.weapon) return;
  const now = performance.now();
  if (now < meleeCooldownUntil) return;
  meleeCooldownUntil = now + 620;
  audio.burst(.10,.07,520);
  const baseRoll = camera.rotation.z;
  camera.rotation.z += .028;
  setTimeout(() => { camera.rotation.z = baseRoll; }, 130);

  if (entity.visible && distToEntity() < 2.35 && cameraLooksAt(entity,.52)) {
    state.beastStunUntil = now + 1700;
    state.weaponDurability = Math.max(0, state.weaponDurability - 1);
    const away = entity.position.clone().sub(yaw.position).setY(0).normalize();
    entity.position.addScaledVector(away, .65);
    audio.stinger();
    showToast(state.weaponDurability ? `THE WRENCH CONNECTS · ${state.weaponDurability} HIT${state.weaponDurability===1?'':'S'} LEFT` : 'THE PIPE WRENCH BENDS AND BREAKS', 1500);
    if (!state.weaponDurability) state.weapon = false;
  }
}

function makeEscapePanel(position) {
  const g = new THREE.Group();
  g.name='escape-panel'; g.position.set(...position);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(.62,1.15,.18), elevatorPaintMat); shell.castShadow=true; g.add(shell);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(.48,.42,.05), elevatorWallMat); plate.position.set(0,.22,-.115); g.add(plate);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.35,.12), new THREE.MeshBasicMaterial({ map:textTexture('LOCKED','#d31520','rgba(0,0,0,.95)',420,120), transparent:true, toneMapped:false })); screen.position.set(0,.36,-.145); g.add(screen);
  const slots=[];
  for(let i=0;i<3;i++){ const slot=new THREE.Mesh(new THREE.BoxGeometry(.12,.17,.04),rubberMat); slot.position.set((i-1)*.16,.05,-.145); g.add(slot); slots.push(slot); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.04,12,10), new THREE.MeshStandardMaterial({color:0x280005,emissive:0xc5141d,emissiveIntensity:2})); lamp.position.set(0,-.34,-.14); g.add(lamp);
  mutable.add(g);
  const item={type:'escape',id:'escape',object:g,radius:1.55,prompt:'RESTORE EMERGENCY OVERRIDE',screen,slots,lamp}; interactables.push(item); return item;
}

function clearInteractables() { interactables.length = 0; state.currentInteractable = null; }

function closestInteractable() {
  let best=null, bestD=Infinity;
  const look = new THREE.Vector3();
  camera.getWorldDirection(look);
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  for (const item of interactables) {
    if (!item.object?.parent) continue;
    const wp=item.object.getWorldPosition(new THREE.Vector3());
    const d=wp.distanceTo(camPos);
    if (d >= item.radius || d >= bestD) continue;
    if (item.requiresAim) {
      const dir = wp.clone().sub(camPos).normalize();
      if (look.dot(dir) < (item.aimDot ?? .52)) continue;
    }
    best=item; bestD=d;
  }
  return best;
}

function collectPart(item) {
  if (!item || item.type!=='part' || state.inventory[item.id]) return;
  state.inventory[item.id]=true;
  item.object.visible=false;
  updateInventoryUI();
  audio.click();
  showToast(`${partMeta[item.id].label} ACQUIRED`);
  updateObjectiveText();
  writeCheckpoint();
  if (item.id==='fuse') { scareFlash(.13); audio.whisperAt(new THREE.Vector3(3.05,1.6,5)); }
  if (item.id==='key') { audio.remoteFootstep(new THREE.Vector3(yaw.position.x,0,yaw.position.z+4)); }
  if (item.id==='relay') { cascadeLightsOff(state.direction>0,95); setTimeout(restoreLights,900); }
}

// -----------------------------------------------------------------------------
// Recorded / spatial audio, with procedural fallback
// -----------------------------------------------------------------------------
const listener = new THREE.AudioListener();
camera.add(listener);
const threeAudioLoader = new THREE.AudioLoader();
const recorded = {
  buffers: new Map(),
  loaded: false,
  ambient: null,
  urls: {
    step0: ['./assets/audio/footstep00.ogg', './public/assets/audio/footstep00.ogg', 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep00.ogg'],
    step1: ['./assets/audio/footstep02.ogg', './public/assets/audio/footstep02.ogg', 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep02.ogg'],
    step2: ['./assets/audio/footstep06.ogg', './public/assets/audio/footstep06.ogg', 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep06.ogg'],
    step3: ['./assets/audio/footstep09.ogg', './public/assets/audio/footstep09.ogg', 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep09.ogg'],
    creak: ['./assets/audio/creak2.ogg', './public/assets/audio/creak2.ogg', 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/creak2.ogg'],
    latch: ['./assets/audio/metalLatch.ogg', './public/assets/audio/metalLatch.ogg', 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/metalLatch.ogg'],
    ambience: ['./assets/audio/freezer_0.ogg', './public/assets/audio/freezer_0.ogg', 'https://opengameart.org/sites/default/files/freezer_0.ogg'],
    elevator: ['./assets/audio/old_elevator_door.mp3', './public/assets/audio/old_elevator_door.mp3', 'https://opengameart.org/sites/default/files/old_elevator_door.mp3'],
    voice: ['./assets/audio/i_see_you_voice_0.mp3', './public/assets/audio/i_see_you_voice_0.mp3', 'https://opengameart.org/sites/default/files/i_see_you_voice_0.mp3'],
  },
  loadUrl(url) {
    return new Promise((resolve, reject) => threeAudioLoader.load(url, resolve, undefined, reject));
  },
  async loadOne(name, urls) {
    for (const url of urls) {
      try {
        const buffer = await this.loadUrl(url);
        this.buffers.set(name, buffer);
        return true;
      } catch {
        // Continue to next local/remote source.
      }
    }
    return false;
  },
  async init() {
    if (this.loaded) return;
    this.loaded = true;
    await Promise.allSettled(Object.entries(this.urls).map(([n, urls]) => this.loadOne(n, urls)));
    if (this.buffers.has('ambience')) {
      this.ambient = new THREE.Audio(listener);
      this.ambient.setBuffer(this.buffers.get('ambience'));
      this.ambient.setLoop(true);
      this.ambient.setVolume(.16 * state.volume);
    }
  },
  startAmbient() {
    if (this.ambient && !this.ambient.isPlaying) this.ambient.play();
  },
  setVolume(v) {
    if (this.ambient) this.ambient.setVolume(.16 * v);
  },
  play2D(name, volume = .5, rate = 1) {
    const b = this.buffers.get(name);
    if (!b) return false;
    const s = new THREE.Audio(listener);
    s.setBuffer(b);
    s.setVolume(volume * state.volume);
    s.setPlaybackRate(rate);
    s.onEnded = () => s.disconnect();
    s.play();
    return true;
  },
  playSpatial(name, pos, volume = .8, refDistance = 2, maxDistance = 22, rate = 1) {
    const b = this.buffers.get(name);
    if (!b) return false;
    const anchor = new THREE.Object3D();
    anchor.position.copy(pos);
    const s = new THREE.PositionalAudio(listener);
    s.setBuffer(b);
    s.setRefDistance(refDistance);
    s.setMaxDistance(maxDistance);
    s.setRolloffFactor(1.2);
    s.setVolume(volume * state.volume);
    s.setPlaybackRate(rate);
    anchor.add(s);
    scene.add(anchor);
    s.onEnded = () => scene.remove(anchor);
    s.play();
    return true;
  },
};

const audio = {
  ctx: null,
  master: null,
  noise: null,
  droneGain: null,
  droneFilter: null,
  droneOscA: null,
  droneOscB: null,
  droneOscC: null,
  beatTimer: 0,
  init() {
    if (this.ctx) {
      this.ctx.resume();
      recorded.startAmbient();
      return;
    }
    this.ctx = listener.context;
    this.master = this.ctx.createGain();
    this.master.gain.value = state.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = 42;
    g.gain.value = .023;
    lp.type = 'lowpass';
    lp.frequency.value = 120;
    osc.connect(lp).connect(g).connect(this.master);
    osc.start();

    // Adaptive horror drone: three deliberately imperfect low tones become louder, brighter and
    // more dissonant as the creature approaches. It remains subtle at distance so footsteps stay readable.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = .0035;
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 105;
    this.droneFilter.Q.value = .7;
    this.droneOscA = this.ctx.createOscillator();
    this.droneOscB = this.ctx.createOscillator();
    this.droneOscC = this.ctx.createOscillator();
    this.droneOscA.type = 'sine'; this.droneOscA.frequency.value = 34.2;
    this.droneOscB.type = 'triangle'; this.droneOscB.frequency.value = 35.8;
    this.droneOscC.type = 'sine'; this.droneOscC.frequency.value = 51.4;
    for (const o of [this.droneOscA,this.droneOscB,this.droneOscC]) {
      o.connect(this.droneFilter);
      o.start();
    }
    this.droneFilter.connect(this.droneGain).connect(this.master);
    recorded.init().then(() => recorded.startAmbient());
  },
  setVolume(v) {
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, .05);
    recorded.setVolume(v);
  },
  tone(freq, dur = .1, vol = .04, type = 'sine', detune = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  },
  burst(dur = .1, vol = .04, freq = 700) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = .8;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, this.ctx.currentTime + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start();
    s.stop(this.ctx.currentTime + dur);
  },
  footstep(sprint = false) {
    const key = `step${Math.floor(Math.random() * 4)}`;
    if (!recorded.play2D(key, sprint ? .33 : .24, .94 + Math.random() * .12)) {
      this.burst(.09, sprint ? .05 : .035, 140 + Math.random() * 65);
      this.tone(54 + Math.random() * 8, .06, .018, 'sine');
    }
  },
  remoteFootstep(pos) {
    const key = `step${Math.floor(Math.random() * 4)}`;
    if (!recorded.playSpatial(key, pos, .55, 1.5, 22, .88 + Math.random() * .16)) this.burst(.09, .03, 120);
  },
  click() {
    if (!recorded.play2D('latch', .18, 1.1)) this.tone(750, .035, .025, 'square');
  },
  knockAt(pos) {
    if (recorded.playSpatial('creak', pos, .65, 1.1, 20, .6)) return;
    this.burst(.08, .11, 95);
    setTimeout(() => this.burst(.07, .085, 100), 170);
    setTimeout(() => this.burst(.06, .06, 105), 320);
  },
  stinger() {
    this.burst(.35, .16, 1300);
    this.tone(54, .65, .11, 'sawtooth');
    this.tone(43, .9, .08, 'sine');
  },
  whisperAt(pos) {
    if (recorded.playSpatial('voice', pos, .35, 1.3, 16, .76)) return;
    this.burst(1.15, .035, 2400);
    this.tone(180, .8, .012, 'sine', -500);
  },
  breathAt(pos) {
    for (let i = 0; i < 4; i++) setTimeout(() => {
      if (!recorded.playSpatial('creak', pos, .18, 1, 12, .42 + Math.random() * .08)) this.burst(.65, .025, 580);
    }, i * 900);
  },
  remoteSteps(pos, count = 9, interval = 440) {
    for (let i = 0; i < count; i++) setTimeout(() => this.remoteFootstep(pos.clone().add(new THREE.Vector3((Math.random() - .5) * .7, 0, i * .18))), i * interval);
  },
  powerDip() {
    this.tone(58, .7, .08, 'sawtooth');
    this.burst(.2, .04, 1800);
  },
  elevator(pos = yaw.position) {
    if (!recorded.playSpatial('elevator', pos.clone(), .65, 2, 18, 1)) {
      this.tone(220, .16, .03, 'sine');
      setTimeout(() => this.tone(165, .25, .025, 'sine'), 150);
    }
  },
  update(dt) {
    if (!this.ctx || !state.running) return;

    // Threat mix is distance-driven, with a small floor-depth bias. The beast becomes audible before
    // it is obvious visually, but the mix never jumps abruptly when it spawns or vanishes.
    const floorPressure = clamp((8 - state.floor) / 8, 0, 1);
    let threat = floorPressure * .16;
    if (entity.visible) {
      const d = distToEntity();
      threat = Math.max(threat, 1 - clamp((d - 1.6) / 17.5, 0, 1));
      if (state.entityMode === 'hunter' || state.finaleRunning) threat = Math.max(threat, .38);
    }
    if (performance.now() < state.beastStunUntil) threat *= .55;
    if (this.droneGain) {
      const t = this.ctx.currentTime;
      this.droneGain.gain.setTargetAtTime(.003 + threat * .052, t, .24);
      this.droneFilter.frequency.setTargetAtTime(95 + threat * 330, t, .30);
      this.droneOscA.frequency.setTargetAtTime(34.2 + threat * 2.6, t, .34);
      this.droneOscB.frequency.setTargetAtTime(35.8 + threat * 5.1, t, .29);
      this.droneOscC.frequency.setTargetAtTime(51.4 + threat * 8.4, t, .31);
      if (recorded.ambient) recorded.ambient.setVolume((.12 + floorPressure*.03 + threat*.045) * state.volume);
    }

    this.beatTimer -= dt;
    if (state.heartbeat > .15 && this.beatTimer <= 0) {
      this.tone(48, .09, .035 + .045 * state.heartbeat, 'sine');
      setTimeout(() => this.tone(42, .08, .025 + .035 * state.heartbeat, 'sine'), 120);
      this.beatTimer = .75 - .35 * state.heartbeat;
    }
    if (Math.random() < dt * .035) this.tone(280 + Math.random() * 60, .25, .005, 'sine');
  },
};

// -----------------------------------------------------------------------------
// Input: keyboard/mouse + Gamepad API
// -----------------------------------------------------------------------------
const keys = {};
let pitch = 0;
const gpPrev = new Map();
let currentGamepadIndex = null;

function setInputMode(mode) {
  state.inputMode = mode;
  document.body.dataset.input = mode;
}

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  setInputMode('mouse');
  if (e.code === 'KeyF' && state.running && !state.paused) toggleFlashlight();
  if (e.code === 'KeyE' && state.running && !state.paused) interact();
  if (e.code === 'Escape' && state.running && !state.dead && !state.transitioning) togglePause(true);
});
addEventListener('keyup', (e) => keys[e.code] = false);
addEventListener('blur', () => {
  for (const k of Object.keys(keys)) keys[k] = false;
  state.gpMoveX = state.gpMoveY = 0;
  state.gpSprint = false;
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement || !state.running || state.paused || state.transitioning) return;
  setInputMode('mouse');
  yaw.rotation.y -= e.movementX * state.sensitivity;
  pitch -= e.movementY * state.sensitivity;
  pitch = clamp(pitch, -1.48, 1.48);
  camera.rotation.x = pitch;
});
renderer.domElement.addEventListener('click', () => {
  setInputMode('mouse');
  if (state.running && !state.paused && !state.dead && !state.transitioning) renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === renderer.domElement) meleeAttack();
});

document.addEventListener('pointerlockchange', () => {
  if (state.running && !state.dead && !state.transitioning && state.inputMode === 'mouse' && document.pointerLockElement !== renderer.domElement) {
    state.paused = true;
    pause.classList.add('visible');
  }
});

addEventListener('gamepadconnected', (e) => {
  currentGamepadIndex = e.gamepad.index;
  setInputMode('gamepad');
  assetBadge.textContent = `${assetBadge.textContent} · GAMEPAD READY`;
});
addEventListener('gamepaddisconnected', (e) => {
  if (currentGamepadIndex === e.gamepad.index) currentGamepadIndex = null;
});

function deadzone(v, dz = .16) {
  if (Math.abs(v) < dz) return 0;
  return (Math.abs(v) - dz) / (1 - dz) * Math.sign(v);
}

function pressedOnce(gp, index) {
  const key = `${gp.index}:${index}`;
  const now = !!gp.buttons[index]?.pressed;
  const before = gpPrev.get(key) || false;
  gpPrev.set(key, now);
  return now && !before;
}

function pollGamepad(dt) {
  const pads = navigator.getGamepads?.() || [];
  let gp = currentGamepadIndex != null ? pads[currentGamepadIndex] : null;
  if (!gp) gp = [...pads].find(Boolean);
  if (!gp) {
    state.gpMoveX = 0;
    state.gpMoveY = 0;
    state.gpSprint = false;
    return;
  }
  currentGamepadIndex = gp.index;
  const lx = deadzone(gp.axes[0] || 0);
  const ly = deadzone(gp.axes[1] || 0);
  const rx = deadzone(gp.axes[2] || 0, .12);
  const ry = deadzone(gp.axes[3] || 0, .12);
  if (Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > .02) setInputMode('gamepad');
  state.gpMoveX = lx;
  state.gpMoveY = ly;
  if (state.running && !state.paused && !state.transitioning) {
    yaw.rotation.y -= rx * dt * 2.4;
    pitch = clamp(pitch - ry * dt * 1.95, -1.48, 1.48);
    camera.rotation.x = pitch;
    if (pressedOnce(gp, 0)) interact();          // A / Cross
    if (pressedOnce(gp, 1)) meleeAttack();       // B / Circle
    if (pressedOnce(gp, 2)) toggleFlashlight();  // X / Square
    if (pressedOnce(gp, 9)) togglePause(true);   // Menu / Options
  } else {
    if (menu.classList.contains('visible') && pressedOnce(gp, 9)) resetGame();
    if (pause.classList.contains('visible') && pressedOnce(gp, 9)) togglePause(false);
    if (death.classList.contains('visible') && pressedOnce(gp, 0)) resetGame();
  }
  state.gpSprint = !!gp.buttons[4]?.pressed || !!gp.buttons[10]?.pressed || (gp.buttons[7]?.value || 0) > .45;
}

function toggleFlashlight() {
  state.flashlightOn = !state.flashlightOn;
  flashlight.visible = state.flashlightOn;
  audio.click();
}

function togglePause(on) {
  if (!state.running || state.dead || state.transitioning) return;
  state.paused = on;
  pause.classList.toggle('visible', on);
  if (on) document.exitPointerLock?.();
  else if (state.inputMode === 'mouse') renderer.domElement.requestPointerLock();
  audio.ctx?.resume();
}

function canMoveTo(x, z) {
  const r = .32;
  const inCorridor = x - r >= -3.0 && x + r <= 3.0 && z - r >= -19.35 && z + r <= 19.35;
  if (inCorridor) return true;

  // An enterable room becomes a walkable region only after its actual hinged door is open.
  for (const zone of activeRoomZones) {
    if (!zone.door.open) continue;
    const minZ = zone.z - zone.width/2 + r;
    const maxZ = zone.z + zone.width/2 - r;
    const xA = zone.side > 0 ? 2.78 : zone.farX + r;
    const xB = zone.side > 0 ? zone.farX - r : -2.78;
    const minX = Math.min(xA,xB), maxX = Math.max(xA,xB);
    const inRoom = x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    const inDoorway = Math.abs(z-zone.z) <= .54 && (zone.side > 0 ? x >= 2.58 && x <= 3.90 : x <= -2.58 && x >= -3.90);
    if (inRoom || inDoorway) return true;
  }
  return false;
}

let stepAccum = 0;
let entityStepAccum = 0;
const moveForward = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const moveWish = new THREE.Vector3();
function movePlayer(dt) {
  // Keyboard and gamepad are sampled independently. Movement never depends on the last input device,
  // which fixes controller drift changing WASD direction or W becoming inconsistent.
  let forwardInput = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  let strafeInput = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const gpMagnitude = Math.hypot(state.gpMoveX || 0, state.gpMoveY || 0);
  if (gpMagnitude > .06) {
    strafeInput += state.gpMoveX;
    forwardInput += -state.gpMoveY;
  }
  const inputLength = Math.hypot(forwardInput, strafeInput);
  if (inputLength > 1) { forwardInput /= inputLength; strafeInput /= inputLength; }

  // Build basis vectors directly from the player's yaw. W is therefore always camera-forward on X/Z,
  // regardless of pitch, frame rate, prior movement, or which device was used last.
  moveForward.set(0, 0, -1).applyQuaternion(yaw.quaternion); moveForward.y = 0; moveForward.normalize();
  moveRight.set(1, 0, 0).applyQuaternion(yaw.quaternion); moveRight.y = 0; moveRight.normalize();
  moveWish.set(0,0,0).addScaledVector(moveForward, forwardInput).addScaledVector(moveRight, strafeInput);
  if (moveWish.lengthSq() > 1) moveWish.normalize();

  const wantsSprint = keys.ShiftLeft || keys.ShiftRight || state.gpSprint;
  const isMoving = moveWish.lengthSq() > .0025;
  state.sprinting = wantsSprint && forwardInput > .08 && state.stamina > .06 && isMoving;
  if (state.sprinting) state.stamina = Math.max(0, state.stamina - dt * .22);
  else state.stamina = Math.min(1, state.stamina + dt * .13);
  staminaFill.style.width = `${state.stamina * 100}%`;

  const targetSpeed = isMoving ? (state.sprinting ? 5.05 : 3.0) : 0;
  state.moveSpeed = lerp(state.moveSpeed, targetSpeed, 1 - Math.exp(-dt * 11));
  const dx = moveWish.x * state.moveSpeed * dt;
  const dz = moveWish.z * state.moveSpeed * dt;
  // Axis-separated collision preserves sliding along walls instead of randomly cancelling the full input.
  if (canMoveTo(yaw.position.x + dx, yaw.position.z)) yaw.position.x += dx;
  if (canMoveTo(yaw.position.x, yaw.position.z + dz)) yaw.position.z += dz;

  if (isMoving) {
    stepAccum += dt * (state.sprinting ? 2.05 : 1.27);
    if (stepAccum > .55) { stepAccum = 0; audio.footstep(state.sprinting); }
    state.walkPhase += dt * (state.sprinting ? 12.2 : 8.7);
  }

  // Very small cinematic camera motion: vertical step compression, lateral sway, and sub-degree roll.
  const motion = state.headBob && isMoving ? clamp(state.moveSpeed / 3, 0, 1.4) : 0;
  const vertical = Math.sin(state.walkPhase * 2) * .0140 * motion;
  const lateral = Math.cos(state.walkPhase) * .0046 * motion;
  const roll = Math.sin(state.walkPhase) * .0025 * motion;
  const smooth = 1 - Math.exp(-dt * 10);
  camera.position.y = lerp(camera.position.y, 1.68 + vertical, smooth);
  camera.position.x = lerp(camera.position.x, lateral, smooth);
  camera.rotation.z = lerp(camera.rotation.z, roll, smooth);
  const targetFov = state.sprinting ? 74.25 : 72;
  const nextFov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 5.5));
  if (Math.abs(nextFov - camera.fov) > .002) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
}

// -----------------------------------------------------------------------------
// Interaction / floor progression
// -----------------------------------------------------------------------------
function targetElevatorZ() { return state.direction < 0 ? -18.8 : 18.8; }
function nearElevator() { return Math.abs(yaw.position.z - targetElevatorZ()) < 2.05 && Math.abs(yaw.position.x) < 2.4; }

function interact() {
  if (state.transitioning || state.finaleRunning) return;
  const item = closestInteractable();
  if (item) {
    if (item.type === 'door') {
      handleDoorInteraction(item.door);
      return;
    }
    if (item.type === 'weapon') {
      collectWeapon(item);
      return;
    }
    if (item.type === 'part') {
      collectPart(item);
      return;
    }
    if (item.type === 'escape') {
      const missing = Object.keys(state.inventory).filter((k) => !state.inventory[k]);
      if (missing.length) {
        showToast(`OVERRIDE INCOMPLETE · ${missing.length} COMPONENT${missing.length>1?'S':''} MISSING`, 2300);
        audio.powerDip();
      } else {
        beginFinale(item);
      }
      return;
    }
  }
  if (!nearElevator()) return;
  if (state.floor === 0) {
    showToast('ELEVATOR OFFLINE · USE THE RED SERVICE PANEL', 2200);
    audio.powerDip();
    return;
  }
  const required = floorRequiresPart();
  if (required && !state.inventory[required]) {
    showToast(`${partMeta[required].label} REQUIRED`, 1900);
    audio.powerDip();
    return;
  }
  audio.elevator(new THREE.Vector3(0, 1.3, targetElevatorZ()));
  transitionFloor();
}

function updatePrompt() {
  const item = closestInteractable();
  state.currentInteractable = item;
  const key = state.inputMode === 'gamepad' ? '[ A ]' : '[ E ]';
  if (item) {
    if (item.type === 'door') {
      const d = item.door;
      promptEl.textContent = `${key}  ${d.unlocked ? (d.open ? 'CLOSE DOOR' : 'OPEN DOOR') : 'TRY DOOR'}`;
    } else {
      promptEl.textContent = `${key}  ${item.prompt}`;
    }
    promptEl.classList.add('prompt-show');
    crosshair.classList.add('crosshair-active');
    return;
  }
  if (nearElevator() && !state.transitioning) {
    const required = floorRequiresPart();
    if (state.floor === 0) promptEl.textContent = `${key}  ELEVATOR OFFLINE`;
    else if (required && !state.inventory[required]) promptEl.textContent = `${key}  LOCKED · ${partMeta[required].label} REQUIRED`;
    else promptEl.textContent = `${key}  CALL ELEVATOR`;
    promptEl.classList.add('prompt-show');
    crosshair.classList.add('crosshair-active');
  } else {
    promptEl.classList.remove('prompt-show');
    crosshair.classList.remove('crosshair-active');
  }
}

const floorDescriptions = {
  8: 'Reach the service elevator.',
  7: 'The building settles around you.',
  6: 'Apartment 013 is open. Search it for the service fuse.',
  5: 'The portraits are not decoration.',
  4: 'The maintenance room is unsecured. Find the key.',
  3: 'Light keeps it still.',
  2: 'Search the utility room for the override relay.',
  1: 'RUN.',
  0: 'Restore the emergency override and escape.',
};

function floorRequiresPart(floor = state.floor) {
  if (floor === 6) return 'fuse';
  if (floor === 4) return 'key';
  if (floor === 2) return 'relay';
  return null;
}

function updateObjectiveText() {
  const part = floorRequiresPart();
  if (part && !state.inventory[part]) objectiveEl.textContent = floorDescriptions[state.floor];
  else if (state.floor === 0) objectiveEl.textContent = 'Install all three override components at the red service panel.';
  else if (state.floor === 1) objectiveEl.textContent = 'RUN.';
  else objectiveEl.textContent = 'Reach the service elevator.';
}

function setElevatorSigns() {
  const txt = String(state.floor).padStart(2, '0');
  for (const el of [elevatorA, elevatorB]) {
    el.sign.material.map.dispose();
    el.sign.material.map = textTexture(txt, '#b20e17', 'rgba(0,0,0,.85)', 256, 100);
    el.sign.material.needsUpdate = true;
  }
}

function updateDoorLabels() {
  doorLabels.forEach((d, i) => {
    let text;
    if (state.floor === 0) text = '000';
    else {
      const suffix = String(i + 1).padStart(2, '0');
      text = `${state.floor}${suffix}`;
      if (state.floor === 6 && i === 7) text = '013';
    }
    d.mesh.material.map.dispose();
    d.mesh.material.map = textTexture(text);
    d.mesh.material.needsUpdate = true;
  });
}

function resetBaseProps() {
  if (baseProps.chair) {
    baseProps.chair.position.set(-2.25, 0, 8.6);
    baseProps.chair.rotation.set(0, Math.PI / 2, 0);
    baseProps.chair.visible = true;
  }
  if (baseProps.suitcase) {
    baseProps.suitcase.position.set(2.25, .03, 4.2);
    baseProps.suitcase.visible = true;
  }
  if (baseProps.trash) {
    baseProps.trash.position.set(-2.35, 0, -14.8);
    baseProps.trash.rotation.set(0, .35, 0);
    baseProps.trash.visible = true;
  }
  if (baseProps.trashbag) {
    baseProps.trashbag.position.set(-2.0, 0, -12.9);
    baseProps.trashbag.visible = true;
  }
}

function configureFloor() {
  clearInteractables();
  clearMutable();
  resetBaseProps();
  state.floorElapsed = 0;
  state.scareFlags.clear();
  state.entityMode = 'hidden';
  state.entitySpeed = 0;
  entity.visible = false;
  crawler.visible = false;
  blood.style.opacity = 0;
  floorTag.textContent = `FLOOR ${String(state.floor).padStart(2, '0')}`;
  objectiveEl.textContent = floorDescriptions[state.floor] || 'Go down.';
  setElevatorSigns();
  updateDoorLabels();
  configureDoorsAndRooms();
  scene.fog.density = .045;
  renderer.toneMappingExposure = .76;
  bloom.strength = .2;
  ceilingLights.forEach((o) => {
    o.base = 14;
    o.light.color.setHex(0xf0e5c8);
    o.light.intensity = 14;
    o.fixture.material.emissive.setHex(0xe6e0cc);
    o.fixture.material.emissiveIntensity = 1.1;
    o.fixture.visible = true;
  });
  portraits.forEach((p) => {
    p.mesh.visible = true;
    p.mesh.rotation.z = 0;
    drawPortrait(p, 0);
  });

  if (state.floor === 7) {
    addWallWriting('YOU MISSED A FLOOR', -2, -1, '#4b0a0c');
    addPolyAnomalyProp('painted_wooden_chair_02', { position: [1.9, 0, -5], rotation: [0, -1.2, 0], scale: .7, name: 'anomaly-chair' });
  }
  if (state.floor === 6) {
    addWallWriting('013', 5, 1, '#780910');
    addRedPool(5);
    addPolyAnomalyProp('vintage_suitcase', { position: [2.35, .03, 5.9], rotation: [0, -.9, 0], scale: .6, name: '013-suitcase' });
  }
  if (state.floor === 5) {
    addPolyAnomalyProp('WoodenChair_01', { position: [0, 0, state.direction < 0 ? 10 : -10], rotation: [0, Math.PI, 0], scale: .72, name: 'center-chair' });
  }
  if (state.floor === 4) {
    scene.fog.density = .06;
    addWallWriting('DON’T TURN AROUND', 0, -1, '#4f080a');
  }
  if (state.floor === 3) {
    state.entityMode = 'watcher';
    entity.visible = true;
    entity.position.set(0, 0, state.direction < 0 ? -13 : 13);
    state.entitySpeed = .95;
  }
  if (state.floor === 2) {
    state.entityMode = 'stalker';
    scene.fog.density = .072;
    entity.visible = false;
    state.entitySpeed = 2.35;
    ceilingLights.forEach((o, i) => {
      if (i % 2 === 1) {
        o.light.color.setHex(0xb30b12);
        o.fixture.material.emissive.setHex(0x8c0008);
      }
    });
  }
  if (state.floor === 1) {
    state.entityMode = 'hunter';
    scene.fog.density = .085;
    renderer.toneMappingExposure = .65;
    bloom.strength = .34;
    ceilingLights.forEach((o) => {
      o.light.color.setHex(0x8e0710);
      o.fixture.material.emissive.setHex(0x7d0009);
      o.light.intensity = 8;
      o.base = 8;
    });
    addWallWriting('FLOOR 00 IS NOT EMPTY', 0, -1, '#7e080f');
  }
  if (state.floor === 0) {
    state.endingActive = true;
    scene.fog.density = .105;
    renderer.toneMappingExposure = .55;
    bloom.strength = .28;
    addWallWriting('YOU LIVE HERE', -7, -1, '#76080d');
    addWallWriting('TENANT 013', 4, 1, '#76080d');
    addWallWriting('STOP DESCENDING', 12, -1, '#76080d');
    ceilingLights.forEach((o, i) => {
      o.base = i % 2 ? 2.3 : 5.5;
      o.light.intensity = o.base;
      o.light.color.setHex(i % 2 ? 0x7d0509 : 0x5d6265);
      o.fixture.material.emissive.setHex(i % 2 ? 0x520005 : 0x77736a);
    });
    addPolyAnomalyProp('WoodenChair_01', { position: [-1.0, 0, -2.4], rotation: [0, .3, 0], scale: .72, name: 'ending-chair-a' });
    addPolyAnomalyProp('WoodenChair_01', { position: [1.0, 0, -2.4], rotation: [0, -.3, 0], scale: .72, name: 'ending-chair-b' });
    addPolyAnomalyProp('vintage_suitcase', { position: [0, .03, 3.2], rotation: [0, .2, 0], scale: .65, name: 'ending-case' });
    const endZ = targetElevatorZ();
    makeEscapePanel([2.98, 1.35, 0]);
  }
  updateObjectiveText();
}

async function movePlayerCinematic(target, duration = 700) {
  const start = yaw.position.clone();
  const began = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      let t = clamp((now - began) / duration, 0, 1);
      t = t * t * (3 - 2 * t);
      yaw.position.lerpVectors(start, target, t);
      if (t < .999) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

function setElevatorDisplay(el, text, color = '#d61520') {
  el.sign.material.map?.dispose?.();
  el.sign.material.map = textTexture(text, color, 'rgba(0,0,0,.92)', 256, 100);
  el.sign.material.needsUpdate = true;
}

async function transitionFloor() {
  state.transitioning = true;
  document.exitPointerLock?.();
  const el = elevatorForDirection();
  el.cabinLight.intensity = 13;
  el.cabinFixture.material.emissiveIntensity = 1.8;
  el.led.material.emissiveIntensity = 4;
  await animateElevatorDoors(el, true, 720);
  await wait(260);

  const insideZ = el.z - el.facing * .88;
  await movePlayerCinematic(new THREE.Vector3(0, 0, insideZ), 720);
  await wait(160);
  audio.elevator(new THREE.Vector3(0, 1.4, el.z));
  await animateElevatorDoors(el, false, 650);
  await wait(240);

  const nextFloor = state.floor - 1;
  const rideSequence = [String(state.floor).padStart(2,'0'), '—', String(nextFloor).padStart(2,'0')];
  for (let i=0;i<rideSequence.length;i++) {
    setElevatorDisplay(el, rideSequence[i], i===1 ? '#6b0509' : '#d61520');
    el.cabinLight.intensity = i===1 ? 2 : 11 + Math.random()*4;
    camera.position.y = 1.68 + (i===1 ? -.015 : .008);
    audio.tone(39 + i*6, .12, .018, 'sine');
    await wait(i===1 ? 520 : 420);
  }

  fade.classList.add('fade-on');
  await wait(520);
  state.floor = nextFloor;
  state.direction *= -1;
  yaw.position.set(0, 0, state.direction < 0 ? 16.2 : -16.2);
  yaw.rotation.y = state.direction < 0 ? 0 : Math.PI;
  pitch = 0;
  camera.rotation.set(0,0,0);
  camera.position.set(0,1.68,0);
  configureFloor();

  const arrival = entryElevatorForDirection();
  arrival.cabinLight.intensity = 12;
  setElevatorDoorPositions(arrival, 1);
  await wait(180);
  fade.classList.remove('fade-on');
  await wait(420);
  audio.elevator(new THREE.Vector3(0, 1.3, arrival.z));
  await animateElevatorDoors(arrival, false, 680);
  arrival.cabinLight.intensity = 0;
  el.cabinLight.intensity = 0;
  await wait(180);
  writeCheckpoint();
  state.transitioning = false;
  if (state.inputMode === 'mouse') renderer.domElement.requestPointerLock();
}

// -----------------------------------------------------------------------------
// Horror director — 15 authored anomalies across the descent
// -----------------------------------------------------------------------------
function triggerOnce(id, fn) {
  if (state.scareFlags.has(id)) return false;
  state.scareFlags.add(id);
  fn?.();
  return true;
}

function cameraLooksAt(obj, maxAngle = .45) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const to = obj.position.clone().sub(camera.getWorldPosition(new THREE.Vector3())).normalize();
  return dir.angleTo(to) < maxAngle;
}
function distToEntity() { return entity.position.distanceTo(yaw.position); }
function spawnBehind(distance = 5.5) {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(yaw.quaternion);
  entity.position.copy(yaw.position).add(fwd.multiplyScalar(-distance));
  entity.position.y = 0;
  entity.visible = true;
}
function scareFlash(strength = .6) {
  flashEl.style.opacity = String(strength);
  setTimeout(() => flashEl.style.opacity = '0', 70);
  audio.stinger();
}

function updatePortraitEyes() {
  if (state.floor !== 5) return;
  portraits.forEach((p) => {
    const localZ = yaw.position.z - p.z;
    const eyeShift = clamp(localZ * .45, -10, 10);
    drawPortrait(p, eyeShift);
  });
}

function moveEntityTowardPlayer(dt, speed) {
  const to = yaw.position.clone().sub(entity.position);
  to.y = 0;
  const d = to.length();
  if (d > 1) {
    to.normalize();
    entity.position.addScaledVector(to, speed * dt);
    entityStepAccum += dt * Math.max(.4, speed);
    const stepEvery = speed > 3.2 ? 1.45 : 1.8;
    if (entityStepAccum >= stepEvery) {
      entityStepAccum = 0;
      recorded.playSpatial('step2', entity.position.clone().add(new THREE.Vector3(0,.05,0)), .48, .65, 18, .84 + Math.random()*.12);
    }
  }
  entity.lookAt(yaw.position.x, 1.5, yaw.position.z);
  animateEntity(dt, speed);
  return d;
}

function updateEntity(dt) {
  if (performance.now() < state.beastStunUntil) { animateEntity(dt, 0); return; }
  if (state.floor === 3 && entity.visible) {
    const frozen = state.flashlightOn && cameraLooksAt(entity, .36);
    if (!frozen) {
      const d = moveEntityTowardPlayer(dt, state.entitySpeed);
      if (d < 1.05) killPlayer();
    } else {
      animateEntity(dt, 0);
    }
  }
  if (state.floor === 2) {
    const crossed = state.direction < 0 ? yaw.position.z < 2 : yaw.position.z > -2;
    if (crossed) triggerOnce('entity-stalker-spawn', () => {
      spawnBehind(7);
      scareFlash(.22);
      audio.whisperAt(entity.position.clone().add(new THREE.Vector3(0, 1.8, 0)));
    });
    if (entity.visible) {
      const d = moveEntityTowardPlayer(dt, state.entitySpeed);
      if (d < 1.0) killPlayer();
    }
  }
  if (state.floor === 1) {
    if (state.floorElapsed > 2.8) triggerOnce('hunter-spawn', () => {
      spawnBehind(8.5);
      entity.visible = true;
      state.entitySpeed = 4.0;
      audio.stinger();
      objectiveEl.textContent = 'RUN.';
    });
    if (entity.visible) {
      const d = moveEntityTowardPlayer(dt, state.entitySpeed);
      blood.style.opacity = String(clamp(1 - d / 8, 0, .7));
      state.heartbeat = clamp(1 - d / 12, 0, 1);
      if (d < 1.0) killPlayer();
    }
  }
  if (state.floor === 0 && entity.visible) {
    if (state.finaleRunning && state.winReady) {
      const d = moveEntityTowardPlayer(dt, 4.15);
      blood.style.opacity = String(clamp(1 - d / 9, 0, .72));
      state.heartbeat = clamp(1 - d / 13, 0, 1);
      if (d < 1.0) killPlayer();
    } else if (!state.finaleRunning) animateEntity(dt, 0);
  }
}

function cascadeLightsOff(reverse = false, delay = 85) {
  const arr = reverse ? [...ceilingLights].reverse() : [...ceilingLights];
  arr.forEach((o, i) => setTimeout(() => {
    o.light.intensity = 0;
    o.fixture.material.emissiveIntensity = .02;
    if (i % 2 === 0) audio.tone(42 + i * 3, .08, .018, 'square');
  }, i * delay));
}

function restoreLights() {
  ceilingLights.forEach((o) => {
    o.light.intensity = o.base;
    o.fixture.material.emissiveIntensity = 1;
  });
}

function runCrawlerCrossing(z) {
  crawler.visible = true;
  crawler.position.set(-2.75, 0, z);
  crawler.rotation.set(0, -Math.PI / 2, 0);
  audio.remoteFootstep(new THREE.Vector3(-2.6, 0, z));
  const began = performance.now();
  const frame = (now) => {
    if (!crawler.visible) return;
    const t = clamp((now - began) / 920, 0, 1);
    crawler.position.x = lerp(-2.75, 2.75, t);
    animateCreature(crawler, .016, 4.4, false);
    if (t < 1) requestAnimationFrame(frame);
    else { crawler.visible = false; audio.remoteFootstep(new THREE.Vector3(2.7, 0, z)); }
  };
  requestAnimationFrame(frame);
}

function horrorDirector(dt) {
  const p = state.floorElapsed;
  const playerZ = yaw.position.z;
  const farEnd = state.direction < 0 ? -14 : 14;
  const behind = new THREE.Vector3(yaw.position.x, 1.4, yaw.position.z + (state.direction < 0 ? 5 : -5));

  // 1. Distant knocks — floor 7.
  if (state.floor === 7 && p > 1.8) triggerOnce('f7-knocks', () => audio.knockAt(new THREE.Vector3(-3, 1.5, farEnd)));

  // 2. Light cascade — floor 7.
  if (state.floor === 7 && p > 4.5) triggerOnce('f7-cascade', () => {
    cascadeLightsOff(state.direction > 0, 95);
    audio.powerDip();
    setTimeout(() => {
      state.scareFlags.delete('f7-cascade');
      restoreLights();
    }, 1450);
  });

  // 3. Chair changes orientation after the player passes it — floor 7.
  if (state.floor === 7 && Math.abs(playerZ) < 1) triggerOnce('f7-chair-turn', () => {
    const c = mutable.getObjectByName('anomaly-chair');
    if (c) {
      c.rotation.y += Math.PI;
      c.position.z = yaw.position.z + (state.direction < 0 ? 4.5 : -4.5);
    }
    audio.remoteFootstep(behind);
  });

  // 4. Apartment 013 whispers from a precise door position — floor 6.
  if (state.floor === 6 && Math.abs(playerZ - 5) < 4) triggerOnce('f6-voice013', () => audio.whisperAt(new THREE.Vector3(3.1, 1.6, 5)));

  // 5. 013 handle/latch rattles rapidly — floor 6.
  if (state.floor === 6 && Math.abs(playerZ - 5) < 2.3) triggerOnce('f6-latch013', () => {
    for (let i = 0; i < 4; i++) setTimeout(() => recorded.playSpatial('latch', new THREE.Vector3(3.1, 1.25, 5), .45, .8, 12, .9 + i * .05), i * 210);
  });

  // 6. Portrait eyes follow player — continuous floor 5.
  if (state.floor === 5) updatePortraitEyes();

  // 7. One portrait physically tilts when the player looks away — floor 5.
  if (state.floor === 5 && Math.abs(playerZ - 2) > 5 && p > 4) triggerOnce('f5-frame-tilt', () => {
    portraits[1].mesh.rotation.z = -.27;
    audio.knockAt(new THREE.Vector3(3.1, 2, 2));
  });

  // 8. The center chair is suddenly behind the player — floor 5.
  if (state.floor === 5 && (state.direction < 0 ? playerZ < 0 : playerZ > 0)) triggerOnce('f5-chair-behind', () => {
    const c = mutable.getObjectByName('center-chair');
    if (c) {
      c.position.set(yaw.position.x, 0, yaw.position.z + (state.direction < 0 ? 4.2 : -4.2));
      c.rotation.y = state.direction < 0 ? 0 : Math.PI;
    }
    audio.remoteFootstep(behind);
  });

  // 9. Footsteps approach from ahead, then continue behind — floor 4.
  if (state.floor === 4 && p > 2.5) triggerOnce('f4-steps', () => {
    const start = new THREE.Vector3(0, 0, farEnd);
    audio.remoteSteps(start, 7, 360);
    setTimeout(() => audio.remoteSteps(behind, 5, 330), 2300);
  });

  // 10. Close breathing anchors behind the player's right shoulder — floor 4.
  if (state.floor === 4 && p > 7.2) triggerOnce('f4-breath', () => audio.breathAt(new THREE.Vector3(yaw.position.x + 1.2, 1.6, yaw.position.z + (state.direction < 0 ? 1.3 : -1.3))));

  // 11. A fully rigged crawler crosses the corridor exactly once — floor 4.
  if (state.floor === 4 && Math.abs(playerZ) < 3) triggerOnce('f4-crossing-crawler', () => {
    runCrawlerCrossing(yaw.position.z + (state.direction < 0 ? -5.5 : 5.5));
  });

  // 12. Watcher advances only when it is not lit — floor 3 (entity logic).

  // 13. Door numbers become 000 for a moment — floor 2.
  if (state.floor === 2 && p > 3.3) triggerOnce('f2-door-zero', () => {
    doorLabels.forEach((d) => {
      d.mesh.material.map.dispose();
      d.mesh.material.map = textTexture('000');
      d.mesh.material.needsUpdate = true;
    });
    setTimeout(updateDoorLabels, 2200);
  });

  // 14. False elevator opens/dings behind the player — floor 2.
  if (state.floor === 2 && Math.abs(playerZ) < 4) triggerOnce('f2-false-elevator', () => audio.elevator(new THREE.Vector3(0, 1.5, state.direction < 0 ? 18 : -18)));

  // 15. Chase lighting collapses section-by-section — floor 1.
  if (state.floor === 1 && p > 4.2) triggerOnce('f1-light-collapse', () => cascadeLightsOff(state.direction > 0, 150));

  if (state.floor === 0 && !state.finaleRunning) {
    if (p > 1.8) triggerOnce('f0-first-voice', () => audio.whisperAt(new THREE.Vector3(0, 1.5, farEnd)));
    if (Math.abs(playerZ) < 6) triggerOnce('f0-blackout', () => {
      cascadeLightsOff(state.direction > 0, 130);
      setTimeout(() => {
        const one = ceilingLights[Math.floor(ceilingLights.length / 2)];
        one.light.color.setHex(0x8e0710);
        one.light.intensity = 5;
        one.fixture.material.emissive.setHex(0x790006);
        one.fixture.material.emissiveIntensity = 1.4;
        entity.position.set(0, 0, state.direction < 0 ? -13 : 13);
        entity.visible = true;
        state.entityMode = 'still';
      }, 1600);
    });
    if (entity.visible && cameraLooksAt(entity, .32)) triggerOnce('f0-entity-vanish', () => {
      setTimeout(() => {
        entity.visible = false;
        scareFlash(.12);
        audio.remoteFootstep(behind);
      }, 620);
    });
  }

  updateEntity(dt);
}

function updateLights() {
  // Do not fight authored blackout/cascade events with the normal light loop.
  if (state.floor === 0 && state.scareFlags.has('f0-blackout')) return;
  if (state.floor === 7 && state.scareFlags.has('f7-cascade')) return;

  ceilingLights.forEach((o, i) => {
    let mult = 1;
    if (state.floor === 7 && i === 5) mult = Math.sin(state.elapsed * 27 + o.phase) > .15 ? 1 : .04;
    if (state.floor === 4 && i % 3 === 0) mult = .55 + .45 * Math.max(0, Math.sin(state.elapsed * 8 + o.phase));
    if (state.floor <= 2 && state.floor > 0 && i % 2 === 0) mult = .55 + .45 * Math.max(0, Math.sin(state.elapsed * 17 + o.phase));
    if (!state.scareFlags.has('f1-light-collapse') || state.floor !== 1) {
      o.light.intensity = o.base * mult;
      o.fixture.material.emissiveIntensity = .28 + mult * .92;
    }
  });
}

function killPlayer() {
  if (state.dead || state.transitioning) return;
  state.dead = true;
  state.running = false;
  document.exitPointerLock?.();
  blood.style.opacity = '.82';
  audio.stinger();

  // Short authored death lunge: the entity fills the frame instead of cutting straight to a menu.
  if (entity.visible) {
    const start = entity.position.clone();
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(yaw.quaternion); fwd.y = 0; fwd.normalize();
    const target = yaw.position.clone().addScaledVector(fwd, .58); target.y = 0;
    const began = performance.now();
    const frame = (now) => {
      const t = clamp((now - began) / 330, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      entity.position.lerpVectors(start, target, e);
      entity.lookAt(yaw.position.x, 1.58, yaw.position.z);
      animateEntity(.016, 7);
      camera.rotation.z = Math.sin(t * 42) * .018 * (1-t);
      camera.position.x = Math.sin(t * 31) * .012 * (1-t);
      if (t < 1) requestAnimationFrame(frame);
      else { scareFlash(.65); camera.rotation.z = 0; camera.position.x = 0; }
    };
    requestAnimationFrame(frame);
  }
  setTimeout(() => death.classList.add('visible'), 430);
}

// -----------------------------------------------------------------------------
// Escape finale — restoring the override creates a real, winnable final chase
// -----------------------------------------------------------------------------
async function tweenEntityTo(target, duration = 1100) {
  const startPos = entity.position.clone();
  const started = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      entity.position.lerpVectors(startPos, target, eased);
      entity.lookAt(yaw.position.x, 1.55, yaw.position.z);
      animateEntity(.016, 6);
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

function setPanelText(panel, text, color = '#d31520') {
  panel.screen.material.map?.dispose?.();
  panel.screen.material.map = textTexture(text, color, 'rgba(0,0,0,.95)', 420, 120);
  panel.screen.material.needsUpdate = true;
}

async function beginFinale(panel) {
  if (state.finaleRunning) return;
  state.finaleRunning = true;
  state.transitioning = true;
  state.winReady = false;
  entity.visible = false;
  crawler.visible = false;
  document.exitPointerLock?.();
  promptEl.classList.remove('prompt-show');
  objectiveEl.textContent = 'INSTALLING EMERGENCY OVERRIDE…';

  const order = ['fuse','key','relay'];
  for (let i=0;i<order.length;i++) {
    const id = order[i];
    const color = partMeta[id].color;
    panel.slots[i].material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.45, roughness: .34, metalness: .56 });
    setPanelText(panel, `${i+1}/3`, '#d7d6cd');
    panel.lamp.material.emissive.setHex(color);
    audio.click();
    await wait(520);
  }
  setPanelText(panel, 'ONLINE', '#7bd18a');
  panel.lamp.material.emissive.setHex(0x1fd05d);
  panel.lamp.material.emissiveIntensity = 3.2;
  audio.powerDip();
  await wait(420);

  // Kill the corridor, then create a readable red escape path and a bright elevator target.
  cascadeLightsOff(state.direction > 0, 65);
  await wait(650);
  ceilingLights.forEach((o,i) => {
    if (i % 2 === 0) {
      o.light.color.setHex(0x9c0810); o.light.intensity = 4.6;
      o.fixture.material.emissive.setHex(0x750007); o.fixture.material.emissiveIntensity = 1.2;
    }
  });
  const el = elevatorForDirection();
  el.cabinLight.color.setHex(0xe8ece5);
  el.cabinLight.intensity = 18;
  el.cabinFixture.material.emissiveIntensity = 2.4;
  setElevatorDisplay(el, 'LB', '#e4e7dc');
  audio.elevator(new THREE.Vector3(0,1.4,el.z));
  await animateElevatorDoors(el, true, 720);

  // Spawn the stalker on the opposite side of the player so the only safe route is the open elevator.
  const targetZ = targetElevatorZ();
  const travelSign = Math.sign(targetZ - yaw.position.z) || (state.direction < 0 ? -1 : 1);
  entity.position.set(0,0,yaw.position.z - travelSign * 8.8);
  entity.visible = true;
  entity.lookAt(yaw.position.x,1.55,yaw.position.z);
  state.entityMode = 'hunter';
  recorded.playSpatial('voice', entity.position.clone().add(new THREE.Vector3(0,2,0)), .65, 1.2, 20, .8);
  scareFlash(.28);
  objectiveEl.textContent = 'GET TO THE ELEVATOR. NOW.';
  showToast('EMERGENCY OVERRIDE ONLINE · RUN', 2100);
  state.heartbeat = .45;
  state.stamina = 1;
  staminaFill.style.width = '100%';
  state.winReady = true;
  state.transitioning = false;
  if (state.inputMode === 'mouse') renderer.domElement.requestPointerLock();
}

async function completeEscape() {
  if (!state.winReady || state.transitioning) return;
  state.winReady = false;
  state.transitioning = true;
  document.exitPointerLock?.();
  const el = elevatorForDirection();
  promptEl.classList.remove('prompt-show');
  objectiveEl.textContent = '';

  const inside = new THREE.Vector3(0,0,el.z - el.facing * .92);
  const monsterTarget = new THREE.Vector3(0,0,el.z + el.facing * 1.05);
  const monsterRush = tweenEntityTo(monsterTarget, 1150);
  await movePlayerCinematic(inside, 560);
  audio.elevator(new THREE.Vector3(0,1.3,el.z));
  await wait(90);
  await animateElevatorDoors(el, false, 620);
  await monsterRush;
  scareFlash(.72);
  audio.stinger();
  entity.visible = false;
  state.heartbeat = 0;
  blood.style.opacity = 0;

  setElevatorDisplay(el, 'LB', '#e7eadf');
  el.cabinLight.intensity = 20;
  await wait(520);
  fade.classList.add('fade-on');
  await wait(780);

  cinematic.classList.add('visible');
  cinematicKicker.textContent = 'EMERGENCY OVERRIDE';
  cinematicLine.textContent = 'LOBBY';
  await wait(1250);
  cinematicKicker.textContent = 'NULL FLOOR · PROLOGUE COMPLETE';
  cinematicLine.textContent = 'YOU ESCAPED.';
  await wait(2200);
  cinematic.classList.remove('visible');

  hud.style.display = 'none';
  state.running = false;
  clearCheckpoint();
  state.transitioning = false;
  state.finaleRunning = false;
  fade.classList.remove('fade-on');
  paywall.classList.add('visible');
}

// -----------------------------------------------------------------------------
// Lightweight checkpoint persistence — every elevator arrival is a safe checkpoint.
// -----------------------------------------------------------------------------
const SAVE_KEY = 'null-floor-v2-checkpoint';

function readCheckpoint() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!Number.isInteger(save.floor) || save.floor < 0 || save.floor > 8) return null;
    return save;
  } catch { return null; }
}

function refreshContinueButton() {
  const btn = $('#continueBtn');
  if (!btn) return;
  const save = readCheckpoint();
  btn.hidden = !save;
  if (save) btn.textContent = `CONTINUE · FLOOR ${String(save.floor).padStart(2,'0')}`;
}

function writeCheckpoint() {
  if (!state.running || state.floor < 0 || state.floor > 8) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      floor: state.floor,
      inventory: { ...state.inventory },
      weapon: !!state.weapon,
      weaponDurability: state.weaponDurability || 0,
      savedAt: Date.now(),
    }));
    refreshContinueButton();
  } catch {}
}

function clearCheckpoint() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  refreshContinueButton();
}

// -----------------------------------------------------------------------------
// Menus / state
// -----------------------------------------------------------------------------
function resetGame(checkpoint = null) {
  state.floor = checkpoint?.floor ?? 8;
  state.direction = state.floor % 2 === 0 ? -1 : 1;
  state.dead = false;
  state.paused = false;
  state.transitioning = false;
  state.running = true;
  state.stamina = 1;
  state.heartbeat = 0;
  state.elapsed = 0;
  state.endingActive = false;
  state.finaleRunning = false;
  state.winReady = false;
  state.walkPhase = 0;
  state.moveSpeed = 0;
  state.gpMoveX = state.gpMoveY = 0;
  state.gpSprint = false;
  entityStepAccum = 0;
  camera.fov = 72; camera.updateProjectionMatrix();
  state.inventory = checkpoint?.inventory ? {
    fuse: !!checkpoint.inventory.fuse, key: !!checkpoint.inventory.key, relay: !!checkpoint.inventory.relay,
  } : { fuse: false, key: false, relay: false };
  state.weapon = !!checkpoint?.weapon;
  state.weaponDurability = state.weapon ? Math.max(1, checkpoint?.weaponDurability || 3) : 0;
  state.beastStunUntil = 0;
  for (const k of Object.keys(keys)) keys[k] = false;
  updateInventoryUI();
  entity.visible = false;
  crawler.visible = false;
  setElevatorDoorPositions(elevatorA, 0);
  setElevatorDoorPositions(elevatorB, 0);
  elevatorA.cabinLight.intensity = 0;
  elevatorB.cabinLight.intensity = 0;
  blood.style.opacity = 0;
  fade.classList.remove('fade-on');
  cinematic.classList.remove('visible');
  paywall.classList.remove('visible');
  death.classList.remove('visible');
  pause.classList.remove('visible');
  menu.classList.remove('visible');
  yaw.position.set(0, 0, state.direction < 0 ? 16.2 : -16.2);
  yaw.rotation.y = state.direction < 0 ? 0 : Math.PI;
  pitch = 0;
  camera.rotation.set(0,0,0);
  camera.position.set(0,1.68,0);
  flashlight.visible = state.flashlightOn = true;
  hud.style.display = 'block';
  configureFloor();
  writeCheckpoint();
  audio.init();
  if (state.inputMode === 'mouse') renderer.domElement.requestPointerLock();
}

$('#startBtn').addEventListener('click', () => { clearCheckpoint(); resetGame(); });
$('#continueBtn').addEventListener('click', () => resetGame(readCheckpoint()));
$('#settingsBtn').addEventListener('click', () => settings.classList.add('visible'));
$('[data-close="settings"]').addEventListener('click', () => settings.classList.remove('visible'));
$('#resumeBtn').addEventListener('click', () => togglePause(false));
$('#restartBtn').addEventListener('click', () => resetGame(readCheckpoint() || { floor: state.floor, inventory: state.inventory }));
$('#deathRestart').addEventListener('click', () => resetGame(readCheckpoint() || { floor: state.floor, inventory: state.inventory }));
$('#replayBtn').addEventListener('click', () => { clearCheckpoint(); resetGame(); });
$('#quitBtn').addEventListener('click', () => {
  state.running = false;
  state.paused = false;
  hud.style.display = 'none';
  pause.classList.remove('visible');
  menu.classList.add('visible');
  document.exitPointerLock?.();
});
$('#sens').addEventListener('input', (e) => state.sensitivity = Number(e.target.value));
$('#volume').addEventListener('input', (e) => {
  state.volume = Number(e.target.value);
  audio.setVolume(state.volume);
});
$('#headBob').addEventListener('change', (e) => state.headBob = e.target.checked);
$('#filmGrain').addEventListener('change', (e) => grainEl.style.display = e.target.checked ? 'block' : 'none');
$('#scale').addEventListener('change', (e) => {
  state.renderScale = Number(e.target.value);
  renderer.setPixelRatio(Math.min(devicePixelRatio * state.renderScale, 2));
  composer.setPixelRatio(renderer.getPixelRatio());
  syncFXAA();
});
$('#buyBtn').addEventListener('click', async () => {
  const note = $('#checkoutNote');
  note.textContent = 'Opening secure checkout…';
  try {
    const r = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: 'null-floor-full' }),
    });
    if (!r.ok) throw new Error('not configured');
    const data = await r.json();
    if (data.url) location.href = data.url;
    else throw new Error('no url');
  } catch {
    note.textContent = 'Checkout is not configured in this local build. Connect /api/create-checkout-session to Stripe before launch.';
  }
});

// -----------------------------------------------------------------------------
// Main loop
// -----------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), .05);
  state.elapsed += dt;
  pollGamepad(dt);
  if (state.running && !state.paused && !state.dead && !state.transitioning) {
    state.floorElapsed += dt;
    movePlayer(dt);
    updatePrompt();
    if (state.finaleRunning && state.winReady && nearElevator()) completeEscape();
    horrorDirector(dt);
    updateLights();
    audio.update(dt);
  } else if (!state.running && !state.finaleRunning) {
    updateLights();
  }
  if (entity.visible && state.entityMode === 'hidden') animateEntity(dt, 0);
  flashlight.intensity = state.flashlightOn ? 43 + Math.sin(state.elapsed * 31) * .45 : 0;
  dust.rotation.y = Math.sin(state.elapsed * .055) * .012;
  dust.position.y = Math.sin(state.elapsed * .11) * .035;
  dustMat.opacity = state.flashlightOn ? .17 : .09;
  composer.render(dt);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  syncFXAA();
});

// Initial async art pass. Failures intentionally retain procedural fallbacks.
refreshContinueButton();
configureFloor();
upgradeSurfaces();
populatePolyHavenDecor();
recorded.init();
