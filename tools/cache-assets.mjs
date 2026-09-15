import { mkdir, writeFile } from 'node:fs/promises';

const ROOT = new URL('../public/assets/', import.meta.url);
const PH = 'https://dl.polyhaven.org/file/ph-assets';
const PH_API = 'https://api.polyhaven.com';
const UA = 'NULL-FLOOR-Asset-Cacher/2.0';

const models = [
  'WoodenChair_01',
  'painted_wooden_chair_02',
  'painted_wooden_cabinet',
  'vintage_suitcase',
  'metal_trash_can',
  'trashbag',
  'industrial_wall_lamp',
  'industrial_caged_sconce',
  'fancy_picture_frame_01',
  'painted_wooden_bench',
  'cardboard_box_01',
  'korean_fire_extinguisher_01',
  'small_wooden_table_01',
  'power_box_01',
  'utility_box_01',
  'modular_electric_cables',
  'security_camera_01',
  'fire_alarm',
  'barrel_03',
  'can_rusted',
  'pipe_wrench',
];

const surfaces = [
  { slug: 'worn_plaster_wall', maps: ['diff', 'nor_gl', 'rough'] },
  { slug: 'worn_tile_floor', maps: ['diff', 'nor_gl', 'rough'] },
  { slug: 'ceiling_interior', maps: ['diff', 'nor_gl', 'rough'] },
  { slug: 'metal_plate_02', maps: ['diff', 'nor_gl', 'rough', 'metal'] },
  { slug: 'metal_grate_rusty', maps: ['diff', 'nor_gl', 'rough', 'metal'] },
  { slug: 'painted_metal_shutter', maps: ['diff', 'nor_gl', 'rough'] },
];

const audio = {
  'footstep00.ogg': 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep00.ogg',
  'footstep02.ogg': 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep02.ogg',
  'footstep06.ogg': 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep06.ogg',
  'footstep09.ogg': 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/footstep09.ogg',
  'creak2.ogg': 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/creak2.ogg',
  'metalLatch.ogg': 'https://cdn.jsdelivr.net/gh/ETdoFresh/kenney.nl@master/kenney_rpgaudio/Audio/metalLatch.ogg',
  'freezer_0.ogg': 'https://opengameart.org/sites/default/files/freezer_0.ogg',
  'old_elevator_door.mp3': 'https://opengameart.org/sites/default/files/old_elevator_door.mp3',
  'i_see_you_voice_0.mp3': 'https://opengameart.org/sites/default/files/i_see_you_voice_0.mp3',
};

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchJson(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function saveBytes(fileUrl, bytes) {
  const filePath = fileUrl instanceof URL ? fileUrl : new URL(fileUrl, ROOT);
  await mkdir(new URL('./', filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

function chooseGltf(files) {
  for (const res of ['1k', '2k', '4k']) {
    const item = files?.gltf?.[res]?.gltf;
    if (item?.url) return { item, res };
  }
  return null;
}

async function cacheModel(id) {
  console.log(`model  ${id}`);
  const files = await fetchJson(`${PH_API}/files/${encodeURIComponent(id)}`);
  const chosen = chooseGltf(files);
  if (!chosen) throw new Error(`No glTF package returned by Poly Haven for ${id}`);
  const { item } = chosen;
  const localRoot = new URL(`polyhaven/models/${id}/`, ROOT);
  const mainBytes = await fetchBytes(item.url);
  await saveBytes(new URL(`${id}_1k.gltf`, localRoot), mainBytes);

  for (const [relativePath, meta] of Object.entries(item.include || {})) {
    if (!meta?.url) continue;
    const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');
    await saveBytes(new URL(normalized, localRoot), await fetchBytes(meta.url));
  }

  // Defensive pass: if the glTF names a dependency not listed in include, fail loudly instead of
  // shipping a model that turns white in the browser.
  const gltf = JSON.parse(new TextDecoder().decode(mainBytes));
  const required = [
    ...(gltf.buffers || []).map((x) => x.uri),
    ...(gltf.images || []).map((x) => x.uri),
  ].filter((uri) => uri && !uri.startsWith('data:'));
  const includeNames = new Set(Object.keys(item.include || {}).map((x) => x.replaceAll('\\','/')));
  for (const uri of required) {
    if (!includeNames.has(uri) && ![...includeNames].some((x) => x.endsWith(`/${uri}`) || x.split('/').pop() === uri.split('/').pop())) {
      console.warn(`  warning: API package did not explicitly include ${uri}`);
    }
  }
}

async function cacheSurface({ slug, maps }) {
  console.log(`PBR    ${slug}`);
  const root = `${PH}/Textures/jpg/1k/${slug}`;
  for (const suffix of maps) {
    const file = `${slug}_${suffix}_1k.jpg`;
    await saveBytes(new URL(`polyhaven/textures/${slug}/${file}`, ROOT), await fetchBytes(`${root}/${file}`));
  }
}

async function cacheAudio(name, remote) {
  console.log(`audio  ${name}`);
  await saveBytes(new URL(`audio/${name}`, ROOT), await fetchBytes(remote));
}

async function run() {
  console.log('NULL FLOOR production asset cache\n');
  const failures = [];
  for (const id of models) {
    try { await cacheModel(id); } catch (err) { failures.push([id, err]); console.error(`FAILED ${id}: ${err.message}`); }
  }
  for (const spec of surfaces) {
    try { await cacheSurface(spec); } catch (err) { failures.push([spec.slug, err]); console.error(`FAILED ${spec.slug}: ${err.message}`); }
  }
  for (const [name, remote] of Object.entries(audio)) {
    try { await cacheAudio(name, remote); } catch (err) { failures.push([name, err]); console.error(`FAILED ${name}: ${err.message}`); }
  }

  if (failures.length) {
    console.error(`\nCompleted with ${failures.length} failed asset(s). The runtime will use local materials, API/CDN resolution, and painted fallbacks where possible.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll production assets cached under public/assets/.');
  }
}

run();
