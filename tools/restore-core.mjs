import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(process.cwd());
const bootstrap = join(root, '.bootstrap');

try {
  await access(bootstrap);
} catch {
  // The one-time GitHub importer removes .bootstrap after materializing the source.
  process.exit(0);
}

const chunks = (await readdir(bootstrap))
  .filter((name) => /^corechunk\.\d+$/.test(name))
  .sort();

if (!chunks.length) process.exit(0);

const encoded = (await Promise.all(chunks.map((name) => readFile(join(bootstrap, name), 'utf8')))).join('').replace(/\s+/g, '');
const archive = join(bootstrap, 'current-state.tgz');
await writeFile(archive, Buffer.from(encoded, 'base64'));

const test = spawnSync('tar', ['-tzf', archive], { cwd: root, stdio: 'ignore' });
if (test.status !== 0) throw new Error('NULL FLOOR baseline archive failed integrity validation.');

const unpack = spawnSync('tar', ['-xzf', archive, '-C', root], { cwd: root, stdio: 'inherit' });
if (unpack.status !== 0) throw new Error('Could not restore the NULL FLOOR working source.');

console.log('Restored NULL FLOOR v2.0 canonical working source.');
