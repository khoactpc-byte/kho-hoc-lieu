import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { memoryStore } from './helpers/memoryStore.js';
import { createSystemService } from '../netlify/lib/serverSystem.mjs';

test('maintenance client drives real checkpoint APIs and can resume after a committed planning response is lost', async () => {
  const directory = await mkdtemp(resolve('node_modules/.system-client-test-')), oldWindow = globalThis.window;
  const store = memoryStore(), root = 'artifacts/test/public/data/', actor = { uid: 'admin', role: 'admin' }, saved = new Map();
  let index = 0, losePlanningResponse = false;
  store.put(root + 'settings/global', { schoolYear: '2026-2027' }); store.put(root + 'students/an', { fullName: 'An' });
  const service = createSystemService({ store, appId: 'test', fenceReady: true, uuid: () => `job-${++index}` });
  globalThis.window = { localStorage: { setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) } };
  globalThis.__systemClientCall = async (endpoint, action, payload) => {
    assert.equal(endpoint, 'system'); const result = await service[action](actor, payload);
    if (losePlanningResponse && action === 'prepareRestore' && result.status === 'planning') { losePlanningResponse = false; throw new Error('lost network response'); }
    return result;
  };
  try {
    const outfile = join(directory, 'client.mjs');
    await build({ entryPoints: ['src/services/serverSystemClient.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      define: { 'import.meta.env.VITE_SERVER_SYSTEM_ENABLED': '"true"' }, plugins: [{ name: 'local-system-api', setup(builder) {
        builder.onResolve({ filter: /serverQuizClient$|scopedIdentity$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path.endsWith('scopedIdentity')
          ? 'export const SCOPED_AUTH_ENABLED=true;' : 'export const requestPrivateApi=globalThis.__systemClientCall;', loader: 'js' }));
      } }] });
    const client = await import(pathToFileURL(outfile));
    const snapshot = await client.captureServerSnapshot('2026-2027');
    assert.equal(saved.get('khl-maintenance-job-v1'), snapshot.maintenanceJobId);
    const retried = await client.captureServerSnapshot('2026-2027', () => {}, snapshot.maintenanceJobId);
    assert.deepEqual(retried.manifest.checksums, snapshot.manifest.checksums); assert.equal(retried.createdAt, snapshot.createdAt);
    await client.completeBackupExport(snapshot.maintenanceJobId, 'drive-id'); assert.equal(saved.size, 0);
    const phases = [], preview = await client.prepareServerRestore(snapshot, value => phases.push(value.status));
    assert.equal(preview.valid, true); assert.ok(phases.includes('validating')); assert.equal(store.get(root + 'settings/global').maintenance, undefined);
    store.put(root + 'students/phantom', { fullName: 'Later' }); losePlanningResponse = true;
    await assert.rejects(client.executeServerRestore(preview.jobId), /lost network/);
    assert.equal(store.get(root + 'settings/global').maintenance.jobId, preview.jobId); assert.ok(store.get(root + 'students/phantom'));
    await client.continueRestorePreparation(preview.jobId); assert.equal((await client.continueMaintenance(preview.jobId)).status, 'complete');
    assert.equal(store.get(root + 'students/phantom'), undefined); assert.equal(store.get(root + 'students/an').fullName, 'An');
  } finally { globalThis.window = oldWindow; delete globalThis.__systemClientCall; await rm(directory, { recursive: true, force: true }); }
});
