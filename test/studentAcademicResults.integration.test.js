import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QUICK_SCORE_SUBJECTS, SCOREBOOK_SOURCE_FILE } from '../src/config/scorebookDomain.js';
import { studentEditKey } from '../src/utils/studentScoreKeys.js';

test('annual centre results update the table and profile, preserve declarations and join the normal save and Sheet sync', async () => {
  const directory = await mkdtemp(resolve('node_modules/.student-academic-results-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, localStorage: windowObject.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const old = { id: 'old', studentKey: 'one-person', accessCode: 'HS25701', fullName: 'Nguyễn Văn An',
    className: '7A', entryGrade: '7', enrollmentYear: '2025-2026', schoolYear: '2025-2026', schoolCode: 'NAN' };
  const student = { ...old, id: 'now', previousStudentId: 'old', className: '8A', schoolYear: '2026-2027',
    hocLucLop6: 'Khá', hanhKiemLop6: 'Tốt' };
  const book = (record, score) => ({ id: `book-${record.id}`, sourceFile: SCOREBOOK_SOURCE_FILE, schoolYear: record.schoolYear,
    schoolCode: record.schoolCode, grade: record.className[0], edits: Object.fromEntries(QUICK_SCORE_SUBJECTS.map(subject => [
      `custom:${studentEditKey(`hkiiScore:${subject.pageIndex}:r0:s7`, record)}`, score
    ])) });
  let books = [book(old, '8.5')], notifyBooks, saved;
  const requests = [], saves = [];
  const attendance = Array.from({ length: 20 }, (_, index) => ({ id: `day-${index}`, schoolYear: old.schoolYear, schoolCode: 'NAN',
    className: '7A', date: `2025-09-${String(index + 1).padStart(2, '0')}`, records: { old: { studentId: 'old', status: 'CP' } } }));
  const snapshot = records => ({ docs: records.map(record => ({ id: record.id, data: () => record })) });
  globalThis.__academicResultsFixture = {
    subscribe: (ref, next) => {
      if (ref.endsWith('/scorebooks')) { notifyBooks = () => next(snapshot(books)); notifyBooks(); }
      else next(snapshot(ref.endsWith('/class_attendance') ? attendance : []));
      return () => {};
    },
    save: async (input, options) => { saves.push({ input, options }); saved = { ...input, sheetSync: { jobId: 'job', status: 'pending' } }; return saved; },
    sync: async (_id, send) => send(saved),
    post: async request => { requests.push(request); return { status: 'success', result: { success: true } }; }
  };
  let root;
  try {
    const outfile = join(directory, 'academic.mjs');
    await build({ entryPoints: [resolve('src/components/HocSinhManager.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile,
      bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', plugins: [{ name: 'offline-academic-results', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/"); export const doc=collection; export const query=ref=>ref; export const where=(...a)=>a; export const onSnapshot=globalThis.__academicResultsFixture.subscribe; export const setDoc=async()=>{throw new Error("Unexpected write");}; export const deleteDoc=setDoc; export const getDocsFromServer=async()=>{throw new Error("Unexpected server read");};';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={}; export const appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=globalThis.__academicResultsFixture.post; export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('services/jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=globalThis.__academicResultsFixture.save; export const retryStudentSync=globalThis.__academicResultsFixture.sync; export const retryPendingStudentSync=async()=>({succeeded:[],failed:[]}); export const deleteStudentRecord=async()=>{throw new Error("Unexpected deletion");};';
          if (args.path === 'firebase/firestore') contents += 'export const getDocFromServer=async()=>{throw new Error("Unexpected cleanup read");}; export const runTransaction=async()=>{throw new Error("Unexpected cleanup transaction");};';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(windowObject.document.getElementById('root'));
    await act(async () => root.render(React.createElement(Manager, { students: [old, student], currentSchoolYear: '2026-2027',
      systemSchoolYear: '2026-2027', user: { uid: 'fixture' } })));
    const body = windowObject.document;
    const click = element => act(async () => element.click());
    const button = text => [...body.querySelectorAll('button')].find(element => element.textContent.trim() === text);
    await click(button('Cột'));
    for (const grade of [6, 7, 8, 9]) for (const prefix of ['Học lực', 'Hạnh kiểm']) {
      const checkbox = body.querySelector(`label[title="${prefix} lớp ${grade}"] input`);
      if (!checkbox.checked) await click(checkbox);
    }
    await click(button('Đóng'));
    const table = () => body.querySelector('table');
    const row = () => [...table().querySelectorAll('tbody tr')].find(element => element.textContent.includes(student.fullName));
    const cell = label => {
      const index = [...table().querySelectorAll('thead th')].findIndex(element => element.textContent.trim() === label);
      assert.notEqual(index, -1, `missing column ${label}`);
      return row().children[index];
    };
    assert.equal(cell('Học lực lớp 6').textContent, 'Khá');
    assert.equal(cell('Hạnh kiểm lớp 6').textContent, 'Tốt');
    assert.equal(cell('Học lực lớp 7').textContent, 'Tốt');
    assert.equal(cell('Hạnh kiểm lớp 7').textContent, 'Khá');
    assert.equal(cell('Học lực lớp 8').textContent, '-');
    assert.equal(cell('Học lực lớp 9').textContent, '-');
    assert.match(cell('Học lực lớp 7').title, /2025-2026/);
    assert.equal(saves.length, 0, 'viewing derived results must not overwrite stored records');
    books = [...books, book(student, '6.5')];
    await act(async () => notifyBooks());
    assert.equal(cell('Học lực lớp 8').textContent, 'Khá');
    assert.equal(cell('Hạnh kiểm lớp 8').textContent, 'Tốt');
    assert.equal(cell('Học lực lớp 9').textContent, '-');
    books = [book(old, '8.5')];
    await act(async () => notifyBooks());
    assert.equal(cell('Học lực lớp 8').textContent, '-', 'a removed annual result must not leave a cached classification');
    books = [...books, book(student, '6.5')];
    await act(async () => notifyBooks());

    books = [...books, { ...book(old, '6.5'), id: 'ambiguous-old-book' }];
    await act(async () => notifyBooks());
    assert.equal(cell('Học lực lớp 7').textContent, '-');
    await click(row().querySelector(`button[aria-label="Mở hồ sơ ${student.fullName}"]`));
    const oldYear = [...body.querySelectorAll('table[aria-label="Quá trình học tại trung tâm"] tbody tr')]
      .find(element => element.children[0].textContent === old.schoolYear);
    assert.equal(oldYear.children[2].textContent, '—', 'profile history must also refuse an ambiguous scorebook');
    assert.equal(oldYear.children[3].textContent, '—');
    await click(body.querySelector('button[aria-label="Đóng hồ sơ"]'));
    books = [book(old, '8.5'), book(student, '6.5')];
    await act(async () => notifyBooks());

    await click(row().querySelector('button[title="Sửa thông tin"]'));
    await click(button('Học tập & Giấy tờ'));
    const field = label => [...body.querySelectorAll('[role="dialog"] label')]
      .find(element => element.firstElementChild?.textContent.trim() === label)?.querySelector('input, select');
    assert.equal(field('Học lực lớp 6').tagName, 'SELECT');
    assert.equal(field('Học lực lớp 6').disabled, false);
    assert.equal(field('Học lực lớp 7').value, 'Tốt');
    assert.equal(field('Học lực lớp 7').readOnly, true);
    assert.equal(field('Hạnh kiểm lớp 7').value, 'Khá');
    assert.equal(field('Học lực lớp 8').value, 'Khá');
    await click(button('Lưu hồ sơ'));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].options.expected, student, 'concurrency compares the original saved record, not the derived display');
    assert.equal(saves[0].input.hocLucLop6, 'Khá');
    assert.equal(saves[0].input.hocLucLop7, 'Tốt');
    assert.equal(saves[0].input.hanhKiemLop7, 'Khá');
    assert.equal(saves[0].input.hocLucLop8, 'Khá');
    const sync = requests.find(request => request.registrationAction === 'syncStudent');
    assert.equal(sync.params.hocLucLop7, 'Tốt');
    assert.equal(sync.params.hanhKiemLop7, 'Khá');
    assert.equal(sync.params.hocLucLop8, 'Khá');
    assert.equal(body.querySelector('[role="dialog"]'), null);
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    delete globalThis.__academicResultsFixture;
    await rm(directory, { recursive: true, force: true });
  }
});
