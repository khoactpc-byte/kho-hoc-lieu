import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('independent workspace feeds reduce active listeners and reject late callbacks after navigation', async () => {
  const directory = await mkdtemp(resolve('node_modules/.workspace-feed-test-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const opened = [], values = {}, names = ['materials', 'notes', 'quizzes', 'quizResults', 'quickResults', 'progress', 'handwritten', 'students', 'admissions', 'attendance', 'profileRequests'];
  const setters = Object.fromEntries(names.map(name => [name, value => { values[name] = value; }]));
  globalThis.__workspaceFeeds = { onSnapshot(ref, callback) { const feed = { name: ref.name, callback, closed: false }; opened.push(feed); return () => { feed.closed = true; }; } };
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    const outfile = join(directory, 'hook.mjs');
    await build({ entryPoints: ['src/hooks/useWorkspaceCollections.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      define: { 'import.meta.env.VITE_SERVER_QUIZ_ENABLED': '"true"' }, plugins: [{ name: 'feeds', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|services\/collectionSubscriptions$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const onSnapshot=globalThis.__workspaceFeeds.onSnapshot;'
          : 'export const collectionForView=(name, scope)=>({name, scope});', loader: 'js' }));
      } }] });
    const { useWorkspaceCollections } = await import(pathToFileURL(outfile));
    const notify = () => {}, scope = { user: { uid: 'admin' }, scoped: true, identity: { role: 'admin' }, role: 'admin', isAdmin: true, grade: '6', subject: 'Toán', schoolYear: '2026-2027' };
    function Harness({ current, screens = {} }) { useWorkspaceCollections(current, setters, screens, notify); return null; }
    await act(async () => root.render(React.createElement(Harness, { current: scope })));
    assert.equal(opened.filter(feed => !feed.closed).length, 6, 'admin home opens 6 feeds instead of the former 11');
    const roster = opened.find(feed => feed.name === 'students'), admissions = opened.find(feed => feed.name === 'admission_applications');
    const oldMaterial = opened.find(feed => feed.name === 'materials');
    await act(async () => root.render(React.createElement(Harness, { current: { ...scope, subject: 'Ngữ Văn' } })));
    assert.equal(roster.closed, false); assert.equal(admissions.closed, false); assert.equal(oldMaterial.closed, true);
    oldMaterial.callback({ docs: [{ id: 'stale', data: () => ({ title: 'Old subject' }) }] });
    assert.deepEqual(values.materials, []);
    await act(async () => root.render(React.createElement(Harness, { current: { ...scope, subject: 'Ngữ Văn' }, screens: { review: true } })));
    assert.equal(opened.filter(feed => !feed.closed).length, 10, 'review opens four required learning feeds');
    await act(async () => root.render(React.createElement(Harness, { current: { ...scope, user: null, identity: null } })));
    assert.equal(opened.filter(feed => !feed.closed).length, 0);
    roster.callback({ docs: [{ id: 'private-old-user', data: () => ({}) }] }); assert.deepEqual(values.students, []);
  } finally {
    await act(async () => root.unmount()); dom.window.close(); delete globalThis.__workspaceFeeds;
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    await rm(directory, { recursive: true, force: true });
  }
});
