import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const leader = { id: 'leader', fullName: 'Nguyễn Văn An', isClassLeader: true, className: '9A', schoolCode: 'NAN', schoolYear: '2026-2027' };
const roster = [leader, { ...leader, id: 'binh', fullName: 'Trần Thị Bình', isClassLeader: false },
  { ...leader, id: 'chi', fullName: 'Lê Văn Chi', isClassLeader: false },
  { ...leader, id: 'other-campus', fullName: 'Sai cơ sở', schoolCode: 'TQK' },
  { ...leader, id: 'other-class', fullName: 'Sai lớp', className: '8A' },
  { ...leader, id: 'old-year', fullName: 'Sai năm', schoolYear: '2025-2026' },
  { ...leader, id: 'dropped', fullName: 'Đã nghỉ', status: 'dropped' }];

async function setup({ scoped = false, currentStudent = leader, loadError = false } = {}) {
  const directory = await mkdtemp(resolve('node_modules/.monitor-test-'));
  const browser = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = browser;
  globalThis.document = browser.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const subscriptions = [], writes = [], requests = [], notifications = [];
  let failLoad = loadError, root;
  const backend = {
    scoped,
    subscribe(source, next, error) {
      const subscription = { source, next, error, closed: false };
      subscriptions.push(subscription);
      if (failLoad) error(new Error('Không tải được danh sách lớp.'));
      else next({ docs: (source.name === 'students' ? roster : []).map(({ id, ...data }) => ({ id, data: () => data })) });
      return () => { subscription.closed = true; };
    },
    async request(...args) {
      requests.push(args);
      if (failLoad) throw new Error('Không tải được danh sách lớp.');
      return { students: roster, attendance: [], timetable: {} };
    },
    save(payload) { return new Promise((resolveWrite, reject) => writes.push({ payload, resolve: resolveWrite, reject })); }
  };
  globalThis.__classMonitorTest = backend;
  try {
    const outfile = join(directory, 'monitor.mjs');
    await build({ entryPoints: ['src/components/ClassOpsManager.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'monitor-fixture', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|services\/(scopedIdentity|serverQuizClient|attendance)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>({name:a.at(-1)}),doc=collection,where=(...a)=>a,limit=n=>["limit",n],query=(source,...filters)=>({...source,filters}),onSnapshot=globalThis.__classMonitorTest.subscribe;export const getDoc=async()=>({exists:()=>false});export const setDoc=async()=>{throw new Error("Unexpected direct write");};';
          else if (args.path.endsWith('config/firebase')) contents = 'export const appId="fixture",db={};';
          else if (args.path.endsWith('scopedIdentity')) contents = 'export const SCOPED_AUTH_ENABLED=globalThis.__classMonitorTest.scoped;';
          else if (args.path.endsWith('attendance')) contents = 'export const saveAttendanceEntry=globalThis.__classMonitorTest.save;';
          else contents = 'export const requestPrivateApi=globalThis.__classMonitorTest.request;';
          return { contents, loader: 'js' };
        });
      } }] });
    const Manager = (await import(pathToFileURL(outfile))).default;
    const { createRoot } = await import('react-dom/client');
    root = createRoot(browser.document.getElementById('root'));
    const render = student => act(async () => root.render(React.createElement(Manager, {
      mode: 'monitor', currentSchoolYear: '2026-2027', currentStudent: student,
      students: [student], user: { uid: 'monitor-user' }, showNotification: (...args) => notifications.push(args)
    })));
    await render(currentStudent);
    return { browser, body: browser.document, subscriptions, writes, requests, notifications, render,
      recover: () => { failLoad = false; },
      click: element => act(async () => element.click()),
      async dispose() {
        await act(async () => root.unmount());
        browser.close();
        globalThis.window = previous.window;
        globalThis.document = previous.document;
        globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
        delete globalThis.__classMonitorTest;
        await rm(directory, { recursive: true, force: true });
      } };
  } catch (error) {
    if (root) await act(async () => root.unmount());
    browser.close();
    globalThis.window = previous.window; globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    delete globalThis.__classMonitorTest;
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

test('class monitor loads their entire class separately from their own profile and saves only the chosen student/date', async () => {
  const fixture = await setup();
  try {
    const { body, subscriptions, writes, click } = fixture;
    assert.equal(body.querySelectorAll('tbody tr').length, 3, 'self-only App data must not limit the class roster');
    assert.match(body.body.textContent, /Trần Thị Bình/);
    assert.doesNotMatch(body.body.textContent, /Sai lớp|Sai cơ sở|Sai năm|Đã nghỉ/);
    assert.equal(subscriptions.length, 2);
    for (const { source } of subscriptions) assert.deepEqual(source.filters.slice(0, 3), [
      ['schoolYear', '==', '2026-2027'], ['schoolCode', '==', 'NAN'], ['className', '==', '9A']
    ]);
    const cp = () => body.querySelector('[aria-label="Vắng có phép: Trần Thị Bình"]');
    await click(cp());
    assert.equal(writes.length, 1);
    assert.equal(writes[0].payload.student.id, 'binh');
    assert.equal(writes[0].payload.className, '9A');
    assert.equal(writes[0].payload.schoolCode, 'NAN');
    assert.equal(cp().disabled, true);
    assert.equal(cp().getAttribute('aria-pressed'), 'false', 'a pending write is not acknowledged');
    await act(async () => writes[0].resolve({ studentId: 'binh', studentName: 'Trần Thị Bình', status: 'CP', updatedAt: 1 }));
    assert.equal(cp().getAttribute('aria-pressed'), 'true', 'successful saves update immediately without waiting for the poll');
    await click(cp());
    assert.equal(writes[1].payload.status, '');
    assert.equal(writes[1].payload.expectedEntry.status, 'CP');
    await act(async () => writes[1].reject(new Error('Mất kết nối')));
    assert.equal(cp().getAttribute('aria-pressed'), 'true', 'a failed write preserves the saved absence');
    assert.match(fixture.notifications.at(-1)[0], /Chưa lưu.*Mất kết nối/);
    const days = [...body.querySelectorAll('[aria-label="Chọn ngày điểm danh"] button')];
    await click(days.find(button => button.getAttribute('aria-pressed') !== 'true'));
    assert.equal(cp().getAttribute('aria-pressed'), 'false', 'a new day uses its own records');
    assert.equal(subscriptions.length, 2, 'changing day must not restart roster loading');
    await fixture.render({ ...leader, id: 'new-leader', className: '8B', schoolCode: 'TQK' });
    assert.ok(subscriptions.slice(0, 2).every(row => row.closed));
    assert.doesNotMatch(body.body.textContent, /Trần Thị Bình/);
    assert.deepEqual(subscriptions[2].source.filters.slice(0, 3), [
      ['schoolYear', '==', '2026-2027'], ['schoolCode', '==', 'TQK'], ['className', '==', '8B']
    ]);
  } finally { await fixture.dispose(); }
});

test('scoped class monitor uses the authorized server roster, without direct Firestore queries', async () => {
  const fixture = await setup({ scoped: true });
  try {
    assert.equal(fixture.subscriptions.length, 0);
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.requests[0].slice(0, 3), ['data', 'classOps', {}]);
    assert.equal(fixture.body.querySelectorAll('tbody tr').length, 3);
    const cp = fixture.body.querySelector('[aria-label="Vắng có phép: Lê Văn Chi"]');
    await fixture.click(cp);
    await act(async () => fixture.writes[0].resolve({ studentId: 'chi', status: 'CP', updatedAt: 2 }));
    assert.equal(cp.getAttribute('aria-pressed'), 'true');
  } finally { await fixture.dispose(); }
});

test('load failures are visible and retryable, and ordinary students do not load a class roster', async () => {
  const fixture = await setup({ loadError: true });
  try {
    assert.match(fixture.body.querySelector('[role="alert"]').textContent, /Không tải được/);
    assert.equal(fixture.body.querySelector('table'), null);
    fixture.recover();
    await fixture.click([...fixture.body.querySelectorAll('button')].find(button => button.textContent === 'Thử lại'));
    assert.equal(fixture.body.querySelectorAll('tbody tr').length, 3);
    const count = fixture.subscriptions.length;
    await fixture.render({ ...leader, isClassLeader: false });
    assert.equal(fixture.subscriptions.length, count);
    assert.equal(fixture.body.querySelector('table'), null);
    assert.match(fixture.body.querySelector('[role="alert"]').textContent, /Chưa có phân công lớp trưởng/);
    assert.ok(fixture.subscriptions.every(row => row.closed));
  } finally { await fixture.dispose(); }
});
