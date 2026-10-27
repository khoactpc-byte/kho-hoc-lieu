import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import pwaPlugin from '../scripts/pwa-plugin.mjs';

test('install metadata resolves real square icons and retains the full emblem for masks', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const bytes = await readFile(`public${icon.src}`);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
  }
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test('worker protects live data, serves an offline landing page and only activates on consent', async () => {
  const handlers = {};
  const deleted = [];
  const stored = [];
  let failNetwork = false;
  let skipped = 0;
  const context = {
    URL, Promise,
    self: { location: { origin: 'https://school.example' }, addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: () => skipped++ },
    caches: {
      open: async () => ({ addAll: async files => stored.push(...files) }),
      keys: async () => ['unrelated-data', 'tmt-pwa-public-old'],
      delete: async key => deleted.push(key),
      match: async path => ({ offline: path })
    },
    fetch: async request => { if (failNetwork) throw new Error('offline'); return { network: request.url }; }
  };
  vm.runInNewContext(await readFile('scripts/pwa-worker.js', 'utf8'), context);
  let operation;
  handlers.install({ waitUntil: value => { operation = value; } });
  await operation;
  assert.ok(stored.includes('/offline.html'));
  assert.ok(stored.every(path => path === '/offline.html' || path.startsWith('/logo/')));
  assert.equal(skipped, 0);
  handlers.message({ data: { type: 'OTHER' } });
  assert.equal(skipped, 0);
  handlers.message({ data: { type: 'ACTIVATE_UPDATE' } });
  assert.equal(skipped, 1);
  handlers.activate({ waitUntil: value => { operation = value; } });
  await operation;
  assert.deepEqual(deleted, ['tmt-pwa-public-old']);
  const dispatch = async (url, method = 'GET', mode = 'navigate') => {
    let result;
    handlers.fetch({ request: { url, method, mode }, respondWith: value => { result = value; } });
    return result;
  };
  assert.equal(await dispatch('https://school.example/.netlify/functions/login'), undefined);
  assert.equal(await dispatch('https://school.example/api/students'), undefined);
  assert.equal(await dispatch('https://school.example/', 'POST'), undefined);
  assert.equal(await dispatch('https://firestore.googleapis.com/students'), undefined);
  assert.equal(await dispatch('https://school.example/private.json', 'GET', 'cors'), undefined);
  assert.equal((await dispatch('https://school.example/')).network, 'https://school.example/');
  failNetwork = true;
  assert.equal((await dispatch('https://school.example/')).offline, '/offline.html');
  assert.equal((await dispatch('https://school.example/logo/icon-192.png', 'GET', 'no-cors')).offline, '/logo/icon-192.png');
});

test('each changed application build gets a new worker revision', () => {
  const generate = code => {
    let source;
    pwaPlugin().generateBundle.call({ emitFile: file => { source = file.source; } }, {}, { 'app.js': { type: 'chunk', code } });
    return source;
  };
  assert.equal(generate('const version = 1'), generate('const version = 1'));
  assert.notEqual(generate('const version = 1'), generate('const version = 2'));
  assert.doesNotMatch(generate('const version = 1'), /__PWA_BUILD_ID__/);
});
