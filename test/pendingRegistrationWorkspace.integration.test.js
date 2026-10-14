import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('registration list reuses the reminder read, stays live and never refetches a loaded empty queue on opening', async () => {
  const directory = await mkdtemp(resolve('node_modules/.pending-registration-workspace-'));
  const page = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true }).window;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: page, document: page.document, localStorage: page.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  let interval, current, root;
  page.setInterval = callback => { interval = callback; return 1; };
  page.clearInterval = () => {};
  const reads = [], stored = new Map();
  const items = [
    { rowNumber: 2, fullName: 'Học sinh minh họa A', birthDate: '01/01/2010', className: '9A' },
    { rowNumber: 3, fullName: 'Học sinh minh họa B', birthDate: '02/01/2010', className: '6A' },
    { rowNumber: 4, fullName: 'Học sinh minh họa C', birthDate: '03/01/2018', className: '2A' }
  ].map(item => ({ ...item, schoolYear: '2026-2027', schoolCode: 'NAN' }));
  page.registrationWorkspace = {
    capture: value => { current = value; },
    post: (request, options) => request.registrationAction === 'listPending'
      ? new Promise((resolveRead, reject) => reads.push({ options, resolve: rows => resolveRead({ status: 'success', result: { success: true, items: rows } }), reject }))
      : Promise.resolve({ status: 'success', result: { success: true } }),
    save: async (input, options) => {
      const student = { ...input, id: options.id, accessCode: 'HS26001', sheetSync: { status: 'pending', jobId: 'fixture-job' } };
      stored.set(student.id, { student, registration: options.registration });
      return student;
    },
    sync: async (id, send, options) => {
      const { student, registration } = stored.get(id);
      await send(student);
      await options.registrationComplete(registration, student);
    }
  };
  try {
    const outfile = join(directory, 'workspace.mjs');
    await build({ stdin: { contents: `import React from 'react';
      import Manager from './src/components/HocSinhManager.jsx';
      import { usePendingRegistrationCount } from './src/hooks/usePendingRegistrationCount.js';
      export default function Workspace({open, scopeKey, level, students}) {
        const notice = usePendingRegistrationCount(true, scopeKey, level);
        window.registrationWorkspace.capture(notice);
        return React.createElement(React.Fragment, null, React.createElement('output', {'aria-label':'Hồ sơ chờ duyệt'}, notice.count),
          open && React.createElement(Manager, {key:level, students, educationLevel:level, currentSchoolYear:'2026-2027', initialTab:'registrations', user:{uid:'fixture'},
            pendingRegistrationSnapshot:notice.snapshot, onPendingRegistrationsLoaded:notice.replaceRegistrations, onRegistrationsResolved:notice.removeRegistrations}));
      }`, loader: 'js', resolveDir: resolve('.') }, absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-workspace', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/");export const doc=collection;export const query=ref=>ref;export const where=(...a)=>a;export const onSnapshot=(_ref,next)=>{next({docs:[]});return ()=>{};};export const setDoc=async()=>{throw new Error("Unexpected direct write");};export const deleteDoc=setDoc;export const getDocsFromServer=setDoc;export const getDocFromServer=setDoc;export const runTransaction=setDoc;';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={},appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=(...args)=>window.registrationWorkspace.post(...args);export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('services/jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=(...args)=>window.registrationWorkspace.save(...args);export const retryStudentSync=(...args)=>window.registrationWorkspace.sync(...args);export const deleteStudentRecord=async()=>{throw new Error("Unexpected deletion");};export const retryPendingStudentSync=deleteStudentRecord;';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Workspace } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(page.document.getElementById('root'));
    const render = (open, scopeKey = 'admin-one', level = 'thcs', students = []) => act(async () => root.render(React.createElement(Workspace, { open, scopeKey, level, students })));
    const row = name => [...page.document.querySelectorAll('tbody tr')].find(element => element.textContent.toLocaleLowerCase('vi').includes(name.toLocaleLowerCase('vi')));
    const button = label => [...page.document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
    const resolveRead = (index, rows) => act(async () => reads[index].resolve(rows));
    await render(false);
    assert.equal(reads.length, 1);
    await resolveRead(0, items);
    assert.equal(current.count, 2);
    await render(true);
    assert.ok(row(items[0].fullName));
    assert.ok(row(items[1].fullName));
    assert.equal(row(items[2].fullName), undefined);
    assert.equal(reads.length, 1, 'the two registrations display without another Google request');
    await render(false);
    await render(true);
    assert.equal(reads.length, 1, 'reopening preserves the loaded queue');
    await render(true, 'admin-one', 'primary');
    assert.ok(row(items[2].fullName));
    assert.equal(current.count, 1);
    assert.equal(reads.length, 1, 'changing education level reuses the same read');
    await render(true, 'admin-one', 'thcs', [{ ...items[0], id: 'saved', registrationId: '2', sheetSync: { status: 'failed' } }]);
    assert.match(row(items[0].fullName).textContent, /Chờ đồng bộ Sheet/);
    assert.equal([...row(items[0].fullName).querySelectorAll('button')].find(element => element.textContent.trim() === 'Đồng ý').disabled, false, 'raw Sheet rows without identity codes still match unfinished approvals');
    await render(true);

    await act(async () => interval());
    assert.equal(reads.length, 2);
    assert.ok(row(items[0].fullName), 'background refresh keeps the current rows visible');
    assert.equal(button('Duyệt tất cả (2)').disabled, false);
    await act(async () => current.removeRegistrations([items[0]]));
    assert.equal(row(items[0].fullName), undefined, 'resolved rows disappear from the list and badge together');
    assert.equal(reads[1].options.signal.aborted, true);
    await resolveRead(1, items);
    assert.equal(row(items[0].fullName), undefined, 'a stale background response cannot restore the resolved row');
    await act(async () => [...row(items[1].fullName).querySelectorAll('button')].find(element => element.textContent.trim() === 'Đồng ý').click());
    assert.equal(current.count, 0);
    assert.equal(row(items[1].fullName), undefined, 'approval updates the shared queue');
    await render(false);
    await render(true);
    assert.equal(reads.length, 2, 'a known empty queue does not trigger an extra read');

    await act(async () => button('Tiện ích').click());
    await act(async () => button('Tải lại hồ sơ đăng ký').click());
    assert.equal(reads.length, 3, 'manual reload still requests fresh data');
    await resolveRead(2, [items[0]]);
    assert.equal(current.count, 1);
    assert.ok(row(items[0].fullName));
    await act(async () => interval());
    await act(async () => reads[3].reject(new Error('Sheet tạm mất kết nối')));
    assert.ok(row(items[0].fullName), 'failed refresh preserves usable data');
    assert.match(page.document.querySelector('[role="alert"]').textContent, /Đang hiển thị danh sách đã tải/);
    await act(async () => button('Thử lại').click());
    assert.ok(row(items[0].fullName), 'retry does not blank the list');
    await resolveRead(4, []);
    assert.equal(current.count, 0);
    assert.equal(page.document.querySelector('[role="alert"]'), null);

    await render(true, 'admin-two');
    assert.equal(reads.length, 6, 'opening during the reminder read shares that single request');
    assert.match(page.document.body.textContent, /Đang tải hồ sơ đăng ký mới/);
    assert.doesNotMatch(page.document.body.textContent, /Chưa có hồ sơ đăng ký mới/);
    await act(async () => reads[5].reject(new Error('Chưa tải được Sheet')));
    assert.match(page.document.body.textContent, /Bấm Thử lại/);
    assert.doesNotMatch(page.document.body.textContent, /Chưa có hồ sơ đăng ký mới/);
    await act(async () => button('Thử lại').click());
    await resolveRead(6, items);
    assert.ok(row(items[0].fullName));
    assert.equal(current.count, 2);
  } finally {
    if (root) await act(async () => root.unmount());
    page.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
