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

async function setup({ scoped = false, currentStudent = leader, loadError = false, mode = 'monitor', students = roster } = {}) {
  const directory = await mkdtemp(resolve('node_modules/.monitor-test-'));
  const browser = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = browser;
  globalThis.document = browser.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const subscriptions = [], writes = [], requests = [], notifications = [], copied = [];
  Object.defineProperty(browser.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied.push(text); } } });
  let failLoad = loadError, root;
  const backend = {
    scoped,
    subscribe(source, next, error) {
      const subscription = { source, next, error, closed: false };
      subscriptions.push(subscription);
      if (failLoad) error(new Error('Không tải được danh sách lớp.'));
      else next({ docs: (source.name === 'students' ? students : []).map(({ id, ...data }) => ({ id, data: () => data })) });
      return () => { subscription.closed = true; };
    },
    async request(...args) {
      requests.push(args);
      if (failLoad) throw new Error('Không tải được danh sách lớp.');
      return { students, attendance: [], timetable: {} };
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
    const render = (student, schoolYear = '2026-2027') => act(async () => root.render(React.createElement(Manager, {
      mode, currentSchoolYear: schoolYear, currentStudent: student,
      students: mode === 'admin' ? students : [student], user: { uid: 'monitor-user' }, showNotification: (...args) => notifications.push(args)
    })));
    await render(currentStudent);
    return { browser, body: browser.document, subscriptions, writes, requests, notifications, copied, render,
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
    assert.equal(cp().disabled, false, 'another choice can be queued while saving');
    assert.equal(cp().getAttribute('aria-pressed'), 'true', 'the selected status responds before the network');
    assert.equal(cp().getAttribute('aria-busy'), 'true', 'pending selections are visibly distinguished from committed data');
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

test('rapid monitor choices stay responsive, serialize writes and roll back a failed queued change', async () => {
  const fixture = await setup();
  try {
    const { body, click, writes, subscriptions } = fixture;
    const cp = () => body.querySelector('[aria-label="Vắng có phép: Trần Thị Bình"]');
    const kp = () => body.querySelector('[aria-label="Vắng không phép: Trần Thị Bình"]');
    await click(cp());
    await click(kp());
    assert.equal(kp().getAttribute('aria-pressed'), 'true');
    assert.equal(writes.length, 1, 'only one request per cell may be in flight');
    assert.equal(body.querySelector('[data-copy-state]').disabled, true);
    const leaving = new fixture.browser.Event('beforeunload', { cancelable: true });
    fixture.browser.dispatchEvent(leaving);
    assert.equal(leaving.defaultPrevented, true, 'leaving while a save is pending requires the browser warning');
    await act(async () => subscriptions.find(row => row.source.name === 'class_attendance').next({ docs: [] }));
    assert.equal(kp().getAttribute('aria-pressed'), 'true', 'a stale subscription cannot hide the latest click');
    const committed = { studentId: 'binh', studentName: 'Trần Thị Bình', status: 'CP', updatedAt: 10 };
    await act(async () => writes[0].resolve(committed));
    assert.equal(writes.length, 2);
    assert.equal(writes[1].payload.status, 'KP');
    assert.deepEqual(writes[1].payload.expectedEntry, committed);
    assert.equal(kp().getAttribute('aria-pressed'), 'true');
    await act(async () => subscriptions.find(row => row.source.name === 'class_attendance').next({ docs: [] }));
    await act(async () => writes[1].reject(new Error('Máy chủ mất kết nối')));
    assert.equal(cp().getAttribute('aria-pressed'), 'true', 'failure restores the last confirmed state');
    assert.equal(cp().getAttribute('aria-busy'), 'false');
    const leavingAfterSave = new fixture.browser.Event('beforeunload', { cancelable: true });
    fixture.browser.dispatchEvent(leavingAfterSave);
    assert.equal(leavingAfterSave.defaultPrevented, false);
    assert.match(body.querySelector('[role="alert"]').textContent, /Máy chủ mất kết nối/);
    await click(body.querySelector('[data-copy-state]'));
    assert.match(fixture.copied[0], /CP: Trần Thị Bình/);
    assert.match(fixture.copied[0], /KP: Không có/);
  } finally { await fixture.dispose(); }
});

test('copy feedback is visible without a toast, resets on another day and reports clipboard failures', async () => {
  const fixture = await setup();
  try {
    const { body, browser, click } = fixture;
    const button = () => body.querySelector('[data-copy-state]');
    await click(button());
    assert.equal(button().getAttribute('data-copy-state'), 'copied');
    assert.match(button().textContent, /Đã sao chép/);
    assert.match(fixture.copied[0], /LỚP 9A/);
    assert.match(fixture.copied[0], /Năm học 2026-2027/);
    const nextDay = [...body.querySelectorAll('[aria-label="Chọn ngày điểm danh"] button')].find(day => day.getAttribute('aria-pressed') !== 'true');
    await click(nextDay);
    assert.equal(button().getAttribute('data-copy-state'), 'idle');
    browser.navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
    body.execCommand = () => false;
    await click(button());
    assert.equal(button().getAttribute('data-copy-state'), 'error');
    assert.match(body.querySelector('[role="alert"]').textContent, /Chưa sao chép được/);
    body.execCommand = () => true;
    await click(button());
    assert.equal(button().getAttribute('data-copy-state'), 'copied', 'mobile selection fallback also confirms success');
    assert.equal(body.querySelector('[role="alert"]'), null);
  } finally { await fixture.dispose(); }
});

test('late copy completion cannot claim success for a different day', async () => {
  const fixture = await setup();
  try {
    let finish;
    fixture.browser.navigator.clipboard.writeText = () => new Promise(resolve => { finish = resolve; });
    const button = () => fixture.body.querySelector('[data-copy-state]');
    await fixture.click(button());
    assert.equal(button().getAttribute('data-copy-state'), 'copying');
    await fixture.click([...fixture.body.querySelectorAll('[aria-label="Chọn ngày điểm danh"] button')].find(day => day.getAttribute('aria-pressed') !== 'true'));
    await act(async () => finish());
    assert.equal(button().getAttribute('data-copy-state'), 'idle');
  } finally { await fixture.dispose(); }
});

test('admin cells update before saving, accept rapid cycling, and copy only the chosen day and filtered classes', async () => {
  const fixture = await setup({ mode: 'admin', students: roster.slice(0, 3).concat(roster[4]) });
  try {
    const { body, browser, click, writes, copied } = fixture;
    const select = body.querySelector('[aria-label="Thời gian điểm danh"]');
    await act(async () => { select.value = '2026-10'; select.dispatchEvent(new browser.Event('change', { bubbles: true })); });
    const cell = () => body.querySelector('[aria-label^="Nguyễn Văn An, 01/10/2026:"]');
    const copy = () => body.querySelector('[data-copy-state]');
    assert.ok(copy(), 'Admin also has the Zalo copy action');
    await click(cell());
    assert.equal(cell().textContent, 'CP');
    assert.equal(cell().getAttribute('aria-busy'), 'true');
    await click(cell());
    assert.equal(cell().textContent, 'KP');
    assert.equal(writes.length, 1);
    assert.equal(copy().disabled, true);
    await act(async () => writes[0].resolve({ studentId: 'leader', studentName: leader.fullName, status: 'CP', updatedAt: 1 }));
    assert.equal(writes[1].payload.status, 'KP');
    await act(async () => writes[1].resolve({ studentId: 'leader', studentName: leader.fullName, status: 'KP', updatedAt: 2 }));
    assert.equal(cell().textContent, 'KP');
    assert.equal(cell().getAttribute('aria-busy'), 'false');
    assert.equal(body.querySelector('[aria-label="Ngày báo cáo Zalo"]').value, '2026-10-01');
    await click([...body.querySelectorAll('button')].find(button => button.textContent === 'Khối 9'));
    await click(copy());
    assert.match(copied[0], /01\/10\/2026/);
    assert.match(copied[0], /KP: Nguyễn Văn An/);
    assert.match(copied[0], /Có mặt: 2\/3/);
    assert.doesNotMatch(copied[0], /LỚP 8A|Sai lớp/);
    assert.match(copy().textContent, /Đã sao chép/);
    await click(cell());
    assert.equal(cell().textContent, '-');
    await act(async () => writes[2].reject(new Error('Không thể lưu')));
    assert.equal(cell().textContent, 'KP');
    assert.match(body.querySelector('[role="alert"]').textContent, /Không thể lưu/);
  } finally { await fixture.dispose(); }
});

test('queued changes keep their original year when the admin changes scope before completion', async () => {
  const fixture = await setup({ mode: 'admin', students: [leader] });
  try {
    const { body, click, writes } = fixture;
    const cell = body.querySelector('.attendance-day-button');
    await click(cell);
    await click(cell);
    const originalDate = writes[0].payload.date;
    await fixture.render(leader, '2027-2028');
    await act(async () => writes[0].resolve({ studentId: 'leader', status: 'CP', updatedAt: 1 }));
    assert.equal(writes.length, 2);
    assert.equal(writes[1].payload.schoolYear, '2026-2027');
    assert.equal(writes[1].payload.date, originalDate);
    await act(async () => writes[1].resolve({ studentId: 'leader', status: 'KP', updatedAt: 2 }));
    assert.match(body.body.textContent, /2027-2028/);
    assert.equal(body.querySelector('.attendance-day-button'), null, 'late saves do not populate the new year');
  } finally { await fixture.dispose(); }
});
