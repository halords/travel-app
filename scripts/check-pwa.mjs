import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
const index = await readFile(path.join(root, 'index.html'), 'utf8');
const worker = await readFile(path.join(root, 'sw.js'), 'utf8');

assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert(index.includes('manifest.webmanifest'), 'The page must link to its PWA manifest.');
assert(worker.includes('index.html'), 'The app shell must be available offline.');
assert(
  worker.includes('denylist') && worker.includes('api'),
  'API routes must bypass offline navigation fallback.',
);

for (const icon of manifest.icons) {
  const bytes = await readFile(path.join(root, icon.src.replace(/^\//, '')));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
}
assert(manifest.icons.some((icon) => icon.sizes === '192x192'));
assert(manifest.icons.some((icon) => icon.sizes === '512x512'));
assert(manifest.icons.some((icon) => icon.purpose === 'maskable'));

const assets = await readdir(path.join(root, 'assets'));
for (const file of assets.filter((name) => /\.(js|css|woff2)$/.test(name))) {
  assert(worker.includes(file), `The offline cache is missing ${file}.`);
  if (file.endsWith('.js')) {
    const content = await readFile(path.join(root, 'assets', file), 'utf8');
    assert(
      !/TURSO_AUTH_TOKEN|TURSO_DATABASE_URL|password_hash|token_hash/.test(content),
      'Server credentials or auth implementation appeared in a browser bundle.',
    );
  }
}
console.log(
  'PWA checks passed: manifest, install icons, offline assets, API exclusions, and client/server separation.',
);
