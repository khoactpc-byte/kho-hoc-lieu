import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('approve-all UI saves each student once, keeps failures visible and unlocks before Sheet finishes', async () => {
  const directory = await mkdtemp(resolve('node_modules/.profile-batch-ui-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, localStorage: windowObject.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  let root, finishSync;
  const saves = [], syncs = [], notices = [];
  const syncGate = new Promise(resolve => { finishSync = resolve; });
  windowObject.batchFixture = {
    requests: [
      { id: 'new', studentId: 'an', studentName: 'An', createdAt: 20, changes: { portraitUrl: 'https://example.com/new.jpg' } },
      { id: 'old', studentId: 'an', studentName: 'An', createdAt: 10, changes: { portraitUrl: 'https://example.com/old.jpg', phone: '123' } },
      { id: 'error', studentId: 'binh', studentName: 'Bình', createdAt: 30, changes: { phone: '456' } },
      { id: 'readonly', studentId: 'chi', studentName: 'Chi', createdAt: 40, changes: { phone: '789' } }
    ],
    save: async (student, options) => {
      saves.push({ student, options });
      if (student.id === 'binh') throw new Error('Hồ sơ vừa thay đổi');
      return { ...student, sheetSync: { status: 'pending' } };
    },
    sync: async id => { syncs.push(id); await syncGate; throw new Error('Sheet tạm mất kết nối'); }
  };
  try {
    const outfile = join(directory, 'manager.mjs');
    await build({ entryPoints: [resolve('src/components/HocSinhManager.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-batch', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/"); export const doc=collection; export const query=ref=>ref; export const where=(...a)=>a; export const onSnapshot=(ref,next)=>{next({docs:ref.endsWith("student_profile_requests")?window.batchFixture.requests.map(r=>({id:r.id,data:()=>r})):[]}); return ()=>{};}; export const setDoc=async()=>{throw new Error("Unexpected direct write");}; export const deleteDoc=setDoc; export const getDocsFromServer=async()=>{throw new Error("Unexpected server read");};';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={}, appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=async()=>{throw new Error("Unexpected Sheet request");}; export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('services/jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=(...args)=>window.batchFixture.save(...args); export const retryStudentSync=(...args)=>window.batchFixture.sync(...args); export const deleteStudentRecord=async()=>{throw new Error("Unexpected deletion");}; export const retryPendingStudentSync=(...args)=>window.batchFixture.retry(...args);';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    const students = ['an', 'binh', 'chi'].map((id, index) => ({ id, fullName: id, accessCode: 'HS00' + (index + 1), className: '8A', schoolYear: '2026-2027', schoolCode: 'NAN', status: id === 'chi' ? 'dropped' : 'active' }));
    root = createRoot(windowObject.document.getElementById('root'));
    await act(async () => root.render(React.createElement(Manager, { students, currentSchoolYear: '2026-2027', initialTab: 'profileRequests', user: { uid: 'fixture' }, showNotification: (...args) => notices.push(args) })));
    const body = windowObject.document;
    const button = text => [...body.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === text || element.textContent.trim() === text);
    await act(async () => { button('Đồng ý tất cả yêu cầu').click(); button('Đồng ý tất cả yêu cầu').click(); });
    assert.equal(saves.length, 2, 'no duplicate writes and read-only student is skipped');
    const approved = saves.find(item => item.student.id === 'an');
    assert.equal(approved.student.portraitUrl, 'https://example.com/new.jpg');
    assert.equal(approved.student.phone, '123');
    assert.equal(approved.options.profileDecisions.length, 2);
    assert.deepEqual(syncs, ['an']);
    assert.equal(body.querySelectorAll('table').length, 2, 'failed requests remain available');
    assert.equal(button('Đồng ý yêu cầu này').disabled, false, 'screen unlocked while Sheet is pending');
    assert.equal(button('Đồng ý tất cả yêu cầu').disabled, true, 'cannot start another overlapping bulk run');
    assert.match(body.querySelector('[role="status"]').textContent, /Đã duyệt 2\/4 yêu cầu.*Đang đồng bộ Sheet 0\/1/);
    await act(async () => finishSync());
    assert.equal(button('Đồng ý tất cả yêu cầu').disabled, false);
    assert.match(body.querySelector('[role="status"]').textContent, /1 hồ sơ chờ đồng bộ lại Sheet/);
    assert.match(notices.at(-1)[0], /Đã duyệt 2\/4 yêu cầu/);

    // Failed Sheet jobs can be retried from this same review page, without approving again.
    let releaseRetry;
    const retryGate = new Promise(resolve => { releaseRetry = resolve; });
    let retries = 0;
    windowObject.batchFixture.retry = async (_students, _send, progress) => {
      retries++;
      progress({ completed: 1, total: 2, succeeded: 1, failed: 0 });
      await retryGate;
      return { succeeded: [{ record: students[0] }], failed: [{ record: students[1], error: new Error('Không xác thực được phiên Admin. Kiểm tra cấu hình và quyền UrlFetchApp.') }] };
    };
    const pendingStudents = students.map(student => ({ ...student, ...(student.id !== 'chi' ? { sheetSync: { status: 'failed' } } : {}) }));
    await act(async () => root.render(React.createElement(Manager, { key: 'retry', students: pendingStudents, currentSchoolYear: '2026-2027', initialTab: 'profileRequests', user: { uid: 'fixture' }, showNotification: (...args) => notices.push(args) })));
    await act(async () => button('Tiện ích').click());
    await act(async () => button('Thử lại đồng bộ (2)').click());
    assert.match(body.body.textContent, /Đang thử lại đồng bộ Sheet: 1\/2/);
    await act(async () => releaseRetry());
    assert.equal(retries, 1);
    assert.match(body.body.textContent, /Đồng bộ Sheet: 1\/2 hồ sơ thành công/);
    assert.match(body.body.textContent, /Còn 1 hồ sơ lỗi, đã giữ để thử lại/);
    assert.match(notices.at(-1)[0], /quyền UrlFetchApp/);
    assert.doesNotMatch(notices.at(-1)[0], /PDF/);
    assert.equal(saves.length, 2, 'retry does not approve or rewrite student profiles');
  } finally {
    finishSync();
    if (root) await act(async () => root.unmount());
    windowObject.close();
    Object.assign(globalThis, previous);
    await rm(directory, { recursive: true, force: true });
  }
});
