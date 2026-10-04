import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('migration confirmation resets on navigation and a late old-document response cannot replace the new scorebook', async () => {
  const directory = await mkdtemp(resolve('node_modules/.migration-test-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const { document } = dom.window;
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  let resolveSave;
  const migrated = [];
  globalThis.__migrationBackend = {
    async runTransaction() { return new Promise(resolve => { resolveSave = resolve; }); }
  };
  try {
    const outfile = join(directory, 'notice.mjs');
    await build({ entryPoints: ['src/components/ScorebookMigrationNotice.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'fake-migration', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const doc=(...args)=>args.at(-1);export const runTransaction=globalThis.__migrationBackend.runTransaction;export const getDocFromServer=async()=>({data:()=>({})});'
          : 'export const db={};export const appId="test";export const auth={};', loader: 'js' }));
      } }] });
    const Notice = (await import(pathToFileURL(outfile))).default;
    const props = { edits: { 'custom:hkiScore:0:r0:s0': '6' }, students: [{ id: 'a', fullName: 'An', accessCode: 'HS001' }], user: { uid: 'teacher' }, onMigrated: value => migrated.push(value) };
    await act(async () => root.render(React.createElement(Notice, { ...props, docId: 'old' })));
    const clickText = async text => act(async () => [...document.querySelectorAll('button')].find(button => button.textContent.includes(text)).click());
    await clickText('Xem danh sách');
    await act(async () => document.querySelector('input[type="checkbox"]').click());
    assert.equal([...document.querySelectorAll('button')].find(button => button.textContent.includes('Gắn điểm')).disabled, false);
    await clickText('Gắn điểm');
    assert.equal(typeof resolveSave, 'function');
    await act(async () => root.render(React.createElement(Notice, { ...props, docId: 'new' })));
    await act(async () => resolveSave({ 'new-key-from-old-document': '6' }));
    assert.deepEqual(migrated, []);
    await clickText('Xem danh sách');
    assert.equal(document.querySelector('input[type="checkbox"]').checked, false);
    assert.equal([...document.querySelectorAll('button')].find(button => button.textContent.includes('Gắn điểm')).disabled, true);
  } finally {
    await act(async () => root.unmount()); dom.window.close(); delete globalThis.window; delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT; delete globalThis.__migrationBackend;
    await rm(directory, { recursive: true, force: true });
  }
});
