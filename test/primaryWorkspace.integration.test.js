import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { renderToString } from 'react-dom/server';
import { PRIMARY_SCOREBOOK_SOURCE, primaryCellKey } from '../src/utils/primaryAcademic.js';
import { scorebookDocumentId } from '../src/utils/scorebookArchive.js';

test('primary scorebook saves stable assessments, shares the transcript, retains drafts and restricts teachers', async () => {
  const directory = await mkdtemp(resolve('node_modules/.primary-workspace-test-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  const year = '2026-2027';
  const pupil = { id: 'p4', accessCode: 'TH001', fullName: 'Học sinh Tiểu học', className: '4A', schoolCode: 'NAN', schoolYear: year, previousStudentId: 'p3' };
  const prior = { ...pupil, id: 'p3', previousStudentId: '', className: '3A', schoolYear: '2025-2026' };
  const scope = { sourceFile: PRIMARY_SCOREBOOK_SOURCE, schoolCode: 'NAN', grade: '4', schoolYear: year };
  const id = scorebookDocumentId(scope);
  const documents = new Map([[id, { ...scope, edits: {} }], ['history', { ...scope, grade: '3', schoolYear: prior.schoolYear,
    edits: { [primaryCellKey(prior, 'end2', 'toan', 'level')]: 'Hoàn thành tốt' } }], ['secondary', { ...scope, grade: '6', edits: { original: 'kept' } }]]);
  const notices = [], writes = [];
  globalThis.__primaryFixture = {
    subscribe: (ref, options, next) => {
      const callback = typeof options === 'function' ? options : next;
      callback({ docs: [...documents].map(([id, data]) => ({ id, data: () => data })),
        data: () => documents.get(String(ref).split('/').at(-1)) || {}, metadata: { hasPendingWrites: false } });
      return () => {};
    },
    transaction: async (_db, callback) => callback({
      get: async ref => ({ data: () => String(ref).endsWith('settings/global') ? {} : documents.get(String(ref).split('/').at(-1)) || {} }),
      set: (ref, data) => { const key = String(ref).split('/').at(-1); writes.push(key); documents.set(key, { ...documents.get(key), ...data }); }
    })
  };
  try {
    const outfile = join(directory, 'workspace.mjs');
    await build({ entryPoints: ['src/components/PrimaryAcademicWorkspace.jsx'], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-primary', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|services\/scopedIdentity$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path === 'firebase/firestore'
          ? 'export const doc=(...a)=>a.join("/"); export const collection=doc; export const query=(ref)=>ref; export const where=(...a)=>a; export const onSnapshot=globalThis.__primaryFixture.subscribe; export const runTransaction=globalThis.__primaryFixture.transaction; export const getDocFromServer=async()=>({data:()=>({})}); export class FieldPath{}; export const deleteField=()=>null;'
          : args.path.endsWith('config/firebase') ? 'export const db={}; export const auth={}; export const appId="fixture";'
            : 'export const SCOPED_AUTH_ENABLED=false;' }));
      } }] });
    const { default: Workspace } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    let props = { grade: '4', currentSchoolYear: year, students: [pupil, prior,
      { ...pupil, id: 's6', accessCode: 'HS006', fullName: 'Học sinh THCS', className: '6A' },
      { ...pupil, id: 'other', accessCode: 'TH002', fullName: 'Khác cơ sở', className: '4B', schoolCode: 'TQK' }], user: { uid: 'admin' },
      draftDocuments: new Map(), showNotification: (...args) => notices.push(args) };
    const render = () => act(async () => root.render(React.createElement(Workspace, props)));
    const body = dom.window.document;
    const labelled = label => body.querySelector(`[aria-label="${label}"]`);
    const button = text => [...body.querySelectorAll('button')].find(item => item.textContent.trim() === text);
    const click = item => act(async () => item.click());
    const change = (item, value) => act(async () => {
      Object.getOwnPropertyDescriptor(item instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set.call(item, value);
      item.dispatchEvent(new dom.window.Event(item.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
    await render();
    assert.deepEqual([...labelled('Khối tiểu học').options].map(item => item.value), ['1', '2', '3', '4', '5']);
    assert.doesNotMatch(body.body.textContent, /Học sinh THCS|Khác cơ sở/);
    const scoreLabel = `Điểm Toán · ${pupil.fullName} · end2`;
    await change(labelled(scoreLabel), '0');
    assert.equal(labelled(scoreLabel).value, '0');
    await change(labelled(scoreLabel), '7.5');
    assert.equal(labelled(scoreLabel).value, '0');
    assert.ok(notices.some(([message]) => message.includes('số nguyên')));
    await change(labelled(`${pupil.fullName} · toan · level · end2`), 'Hoàn thành tốt');
    await click(button('Lưu'));
    assert.deepEqual(writes, [id]);
    assert.equal(documents.get(id).edits[primaryCellKey(pupil, 'end2', 'toan', 'score')], '0');
    assert.deepEqual(documents.get('secondary').edits, { original: 'kept' });
    await click(button('Học bạ'));
    assert.equal(labelled(scoreLabel).value, '0', 'the transcript shares the saved scorebook');
    assert.match(body.body.textContent, /Năm 2025-2026 · Lớp 3A/);
    assert.match(body.body.textContent, /Hoàn thành tốt/);
    await change(labelled(scoreLabel), '8');
    await change(labelled('Cơ sở tiểu học'), 'TQK');
    assert.doesNotMatch(body.body.textContent, /Học sinh Tiểu học/);
    await change(labelled('Cơ sở tiểu học'), 'NAN');
    assert.equal(labelled(scoreLabel).value, '8', 'changing campus preserves a dirty draft in its own document');
    props = { ...props, canWrite: false };
    await render();
    assert.equal(labelled(scoreLabel).disabled, true);
    assert.equal(button('Lưu').disabled, true);
    props = { ...props, canWrite: true, lockedSchool: true, allowedGrades: ['4'], allowedSubjects: ['Tiếng Việt'] };
    await render();
    assert.equal(labelled('Cơ sở tiểu học').disabled, true);
    assert.equal(labelled('Khối tiểu học').options.length, 1);
    assert.equal(labelled(scoreLabel).disabled, true);
    assert.equal(labelled(`Điểm Tiếng Việt · ${pupil.fullName} · end2`).disabled, false);
    assert.equal(labelled(`${pupil.fullName} · yeu_nuoc · quality · end2`).disabled, true);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close(); Object.assign(globalThis, previous); delete globalThis.__primaryFixture;
    await rm(directory, { recursive: true, force: true });
  }
});

test('saving and copying primary class settings preserves secondary classes and other years', async () => {
  const directory = await mkdtemp(resolve('node_modules/.primary-classes-test-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(directory, 'classes.mjs');
    await build({ entryPoints: ['src/components/SchoolClassesPanel.jsx'], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
    const { default: Classes } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root'));
    const classesByYear = { '2025-2026': { '1': ['1A', '1B'], '6': ['6OLD'] }, '2026-2027': { '1': ['1A'], '6': ['6A', '6B'], '9': ['9A'] } };
    let saved;
    await act(async () => root.render(React.createElement(Classes, { allowedGrades: ['1', '2', '3', '4', '5'], selectedSchoolYear: '2026-2027', classesByYear,
      onSaveSetting: async (_key, value) => { saved = value; } })));
    const buttons = () => [...dom.window.document.querySelectorAll('button')];
    await act(async () => buttons().find(item => item.textContent.includes('Sao chép')).click());
    await act(async () => buttons().find(item => item.textContent.includes('Lưu')).click());
    assert.deepEqual(saved['2026-2027']['1'], ['1A', '1B']);
    assert.deepEqual(saved['2026-2027']['6'], ['6A', '6B']);
    assert.deepEqual(saved['2026-2027']['9'], ['9A']);
    assert.deepEqual(saved['2025-2026'], classesByYear['2025-2026']);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close(); Object.assign(globalThis, previous);
    await rm(directory, { recursive: true, force: true });
  }
});

test('the full app renders both education modules without a runtime initialization error', async () => {
  const directory = await mkdtemp(resolve('node_modules/.education-app-test-'));
  const dom = new JSDOM('<div></div>', { url: 'http://localhost' });
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'sessionStorage'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage });
  dom.window.__firebase_config = JSON.stringify({ apiKey: 'fixture-api-key', projectId: 'education-test', appId: 'education-test' });
  try {
    const outfile = join(directory, 'app.mjs');
    await build({ entryPoints: ['src/App.jsx'], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' } });
    const { default: App } = await import(pathToFileURL(outfile));
    for (const module of ['primary', 'thcs']) {
      dom.window.localStorage.setItem('khl-admin-session-v1', JSON.stringify({ module, scope: 'full', expiresAt: Date.now() + 60000 }));
      dom.window.sessionStorage.setItem('khl-admin-server-session-v1', 'fixture');
      const html = renderToString(React.createElement(App));
      assert.ok(html.includes('Quản lý giáo dục Tiểu học'));
      assert.ok(html.includes(`value="${module}" selected=""`));
    }
  } finally {
    dom.window.close(); Object.assign(globalThis, previous);
    await rm(directory, { recursive: true, force: true });
  }
});
