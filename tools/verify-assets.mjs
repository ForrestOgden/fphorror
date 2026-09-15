import { access, readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

const root = resolve(process.cwd());
const failures = [];
const warnings = [];

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function requireFile(rel, minBytes = 256) {
  const path = join(root, rel);
  if (!(await exists(path))) { failures.push(`missing ${rel}`); return; }
  const s = await stat(path);
  if (s.size < minBytes) failures.push(`suspiciously small ${rel} (${s.size} bytes)`);
}

for (const folder of ['concrete_wall_004', 'concrete_floor_02', 'rough_pine_door']) {
  for (const file of ['diff_2k.jpg', 'normal_2k.jpg', 'rough_2k.jpg', 'height_2k.jpg']) {
    await requireFile(`public/assets/surfaces/${folder}/${file}`, 4096);
  }
}

for (const rel of ['index.html','src/main.js','src/style.css','package.json']) await requireFile(rel, 128);

const modelsRoot = join(root, 'public/assets/polyhaven/models');
let cachedCount = 0;
if (await exists(modelsRoot)) {
  for (const id of await readdir(modelsRoot)) {
    const dir = join(modelsRoot, id);
    if (!(await stat(dir)).isDirectory()) continue;
    const gltfPath = join(dir, `${id}_1k.gltf`);
    if (!(await exists(gltfPath))) continue;
    cachedCount++;
    try {
      const gltf = JSON.parse(await readFile(gltfPath, 'utf8'));
      const deps = [
        ...(gltf.buffers || []).map((x) => x.uri),
        ...(gltf.images || []).map((x) => x.uri),
      ].filter((x) => x && !x.startsWith('data:') && !/^https?:/i.test(x));
      for (const dep of deps) {
        const depPath = resolve(dirname(gltfPath), decodeURIComponent(dep));
        if (!(await exists(depPath))) failures.push(`${id}: missing glTF dependency ${dep}`);
      }
    } catch (err) {
      failures.push(`${id}: invalid glTF JSON (${err.message})`);
    }
  }
}
if (!cachedCount) warnings.push('No locally cached Poly Haven models found. Run `npm run assets` before the commercial build.');

console.log(`NULL FLOOR asset verification\ncritical local surfaces: checked\ncached Poly Haven models: ${cachedCount}`);
for (const w of warnings) console.warn(`WARNING: ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exitCode = 1;
} else {
  console.log('PASS: no missing critical files or broken cached glTF dependencies detected.');
}
