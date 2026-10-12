import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { scorebookDocumentId } from '../src/utils/scorebookArchive.js';

async function buildOfflineWorkspace(outfile) {
    await build({ entryPoints: ['src/components/ScorebookWorkspace.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-firestore', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'offline' }));
        builder.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const doc=(...a)=>a.join("/"); export const collection=doc; export const getDocFromServer=async(ref)=>({data:()=>globalThis.__scorebookFixtures?.books?.find(book=>book.id===ref.split("/").at(-1))||{}}); export const onSnapshot=(ref,options,next)=>{const fixture=globalThis.__scorebookFixtures;fixture?.reads.push(ref);const books=fixture?.books||[];(typeof options==="function"?options:next)({docs:ref.endsWith("/scorebooks")?books.map(book=>({id:book.id,data:()=>book})):[],data:()=>books.find(book=>book.id===ref.split("/").at(-1))||{},metadata:{hasPendingWrites:false}});return ()=>{};}; export class FieldPath{}; export const deleteField=()=>null; export const runTransaction=()=>Promise.reject(new Error("Writes disabled in rendering fixture"));'
          : 'export const db={}; export const auth={}; export const appId="offline-test";', loader: 'js' }));
      } }] });

}

test('compact scorebook keeps page navigation, printing, transcript settings and roster groups working', async () => {
  const directory = await mkdtemp(resolve('node_modules/.scorebook-render-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = windowObject;
  globalThis.document = windowObject.document;
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(windowObject.document.getElementById('root'));
  try {
    const outfile = join(directory, 'workspace.mjs');
    await buildOfflineWorkspace(outfile);
    const { default: Workspace } = await import(pathToFileURL(outfile));
    const students = Array.from({ length: 45 }, (_, index) => ({ id: `s${index}`, accessCode: `HS${index}`,
      fullName: `Học sinh ${String(index + 1).padStart(2, '0')}`, grade: '6', className: '6A', schoolCode: 'NAN', schoolYear: '2026-2027' }));
    await act(async () => root.render(React.createElement(Workspace, { grade: '6', currentSchoolYear: '2026-2027', students, user: { uid: 'fixture' } })));
    const body = windowObject.document;
    const button = text => [...body.querySelectorAll('button')].find(item => item.textContent.trim() === text);
    const click = element => act(async () => element.click());
    const labelled = text => body.querySelector(`button[aria-label="${text}"]`);
    assert.equal(body.querySelector('.scorebook-tabs'), null, 'sheet navigation appears once');
    const group = [...body.querySelectorAll('label')].find(label => label.textContent.includes('Danh sách học sinh đang xem/in')).querySelector('select');
    assert.equal(group.options.length, 2);
    assert.ok(group.closest('.scorebook-toolbar'), 'roster grouping fits inside the toolbar');
    const printButton = button('In');
    assert.equal(button('In trang này'), undefined);
    await click(printButton);
    assert.ok(button('In trang này'));
    assert.ok(button('In tất cả'));
    await act(async () => body.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(button('In trang này'), undefined);
    assert.equal(body.activeElement, printButton, 'Escape returns focus to the print button');
    await click(printButton);
    await act(async () => body.body.dispatchEvent(new windowObject.Event('pointerdown', { bubbles: true })));
    assert.equal(printButton.getAttribute('aria-expanded'), 'false');
    await act(async () => { group.value = '1'; group.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    // The sheet selector is present in the toolbar and uses stable template names.
    const sheets = [...body.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'Diem_HKI_MonTinhDiem'));
    assert.ok(sheets, 'score sheet selector exists');
    assert.equal(labelled('Trang sổ trước').disabled, true);
    await click(labelled('Trang sổ sau'));
    assert.equal(sheets.value, 'Huong_Dan');
    await click(labelled('Trang sổ trước'));
    assert.equal(sheets.value, 'Bia');
    const scoreOption = [...sheets.options].find(option => option.value === 'Diem_HKI_MonTinhDiem');
    await act(async () => { sheets.value = scoreOption.value; sheets.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    const printed = body.querySelector('.scorebook-print-root').textContent;
    assert.ok(printed.includes('Học Sinh 41'), printed.slice(0, 200));
    assert.ok(printed.includes('Học Sinh 45'));
    assert.equal(printed.includes('Học Sinh 01'), false);
    await act(async () => { sheets.value = 'DiemTongKet_HKI'; sheets.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    assert.ok(body.querySelector('.scorebook-print-root').textContent.includes('Học Sinh 45'));

    let printedCount = 0;
    windowObject.print = () => { printedCount += 1; };
    windowObject.setTimeout = callback => { callback(); return 0; };
    await click(button('In'));
    await click(button('In trang này'));
    assert.equal(printedCount, 1, 'the compact menu still invokes printing');
    assert.equal(body.querySelectorAll('.scorebook-page-frame').length, 1, 'only the selected page is prepared');
    assert.ok(body.querySelector('.scorebook-page-frame').textContent.includes('Học Sinh 45'));
    assert.equal(button('In trang này'), undefined, 'choosing a print option closes the menu');
    await act(async () => windowObject.dispatchEvent(new windowObject.Event('afterprint')));
    assert.ok(button('Xem trước A3'), 'closing print restores the editable sheet');

    await click(button('Học bạ'));
    assert.ok(body.querySelector('.transcript-list-panel').textContent.includes('Học Sinh 01'));
    await click(labelled('Cài đặt chữ ký'));
    const teacherSignature = [...body.querySelectorAll('label')].find(label => label.textContent.includes('Hiện chữ ký giáo viên')).querySelector('input');
    assert.equal(teacherSignature.checked, true);
    await click(teacherSignature);
    assert.equal(JSON.parse(windowObject.localStorage.getItem('khl-transcript-signature-settings-v1')).teacher, false);
    await click(button('In học bạ'));
    assert.ok(button('Mở cửa sổ in'), 'transcript print options remain accessible');
    await click(button('Đóng'));
    assert.equal(button('Mở cửa sổ in'), undefined);
    await click(button('Sổ gọi tên'));
    const restoredSheets = [...body.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'Diem_HKI_MonTinhDiem'));
    assert.equal(restoredSheets.value, 'DiemTongKet_HKI', 'switching modes keeps the selected scorebook sheet');
  } finally {
    await act(async () => root.unmount());
    windowObject.close();
    Object.assign(globalThis, previous);
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    await rm(directory, { recursive: true, force: true });
  }
});

test('historical workspace discovers unassigned records and reads the original saved book without writing or borrowing another year', async () => {
  const directory = await mkdtemp(resolve('node_modules/.scorebook-archive-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = windowObject;
  globalThis.document = windowObject.document;
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(windowObject.document.getElementById('root'));
  const sourceFile = 'so diem 9pc tmt 2025-2026 MAU.xlsx';
  const oldBook = { id: 'original-book-without-campus', schoolYear: '2025-2026', grade: '9', sourceFile, updatedAt: 1780000000000,
    edits: { 'custom:cover:title': 'BẢN ĐÃ NHẬP NĂM TRƯỚC', 'custom:hkiScore:0:uHSOLD:s6': '8', 'custom:hkiScore:0:r1:s0': '6.5' } };
  globalThis.__scorebookFixtures = { books: [oldBook], reads: [] };
  const students = [
    { id: 'old-an', accessCode: 'HSOLD', fullName: 'Nguyễn An', className: '9PC', schoolYear: '2025-2026' },
    { id: 'old-bao', accessCode: 'HSBAO', fullName: 'Trần Bảo', className: '9PC', schoolYear: '2025-2026' },
    { id: 'new-year', accessCode: 'HSNEW', fullName: 'Học sinh năm mới', className: '9PC', schoolYear: '2026-2027' },
    { id: 'other-campus', accessCode: 'HSTQK', fullName: 'Học sinh cơ sở khác', className: '9B', schoolYear: '2025-2026', schoolCode: 'TQK' }
  ];
  try {
    const outfile = join(directory, 'workspace.mjs');
    await buildOfflineWorkspace(outfile);
    const { default: Workspace } = await import(pathToFileURL(outfile));
    const props = { grade: '9', currentSchoolYear: '2025-2026', initialMode: 'transcript', students, user: { uid: 'fixture' } };
    await act(async () => root.render(React.createElement(Workspace, props)));
    const body = windowObject.document;
    const button = text => [...body.querySelectorAll('button')].find(item => item.textContent.trim() === text);
    const click = element => act(async () => element.click());
    assert.ok(body.querySelector('.transcript-list-panel').textContent.includes('Chưa có học sinh'));
    assert.ok(body.body.textContent.includes('Còn 2 hồ sơ và 1 sổ đã lưu năm 2025-2026, khối 9 chưa gán cơ sở'));
    await click(button('Xem hồ sơ, sổ cũ'));
    const roster = body.querySelector('.transcript-list-panel').textContent;
    assert.ok(roster.includes('Nguyễn An'));
    assert.ok(roster.includes('Trần Bảo'));
    assert.equal(roster.includes('Học Sinh Năm Mới'), false);
    assert.equal(roster.includes('Học Sinh Cơ Sở Khác'), false);
    assert.equal(body.querySelector('[role="status"]').textContent, 'Đã lưu');
    assert.ok(globalThis.__scorebookFixtures.reads.some(ref => ref.endsWith(`/${oldBook.id}`)));
    const vietnameseScores = [...body.querySelectorAll('.scorebook-print-root tr')].find(row => row.cells[0]?.textContent === 'Ngữ văn');
    assert.equal(vietnameseScores.cells[1].textContent, '8', 'stable student marks load from the original legacy document');
    await click(button('Xem điểm cũ và đối chiếu'));
    const rawRow = body.querySelector('table[aria-label="Điểm gốc theo số dòng"] tbody tr');
    assert.equal(rawRow.cells[0].textContent, '2');
    assert.equal(rawRow.cells[1].textContent, 'Trần Bảo');
    assert.equal(rawRow.cells[2].textContent, '6.5');
    assert.equal(body.querySelector('input[type="checkbox"]').checked, false, 'preview does not confirm or migrate row marks');
    await click(button('Đóng đối chiếu'));
    await click(button('Sổ gọi tên'));
    assert.ok(body.querySelector('.scorebook-print-root').textContent.includes('BẢN ĐÃ NHẬP NĂM TRƯỚC'));
    const campus = [...body.querySelectorAll('label')].find(label => label.textContent.startsWith('Cơ sở:')).querySelector('select');
    await act(async () => { campus.value = 'NAN'; campus.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    assert.equal(body.querySelector('.scorebook-print-root').textContent.includes('BẢN ĐÃ NHẬP NĂM TRƯỚC'), false);
    const namedId = scorebookDocumentId({ schoolYear: '2025-2026', grade: '9', sourceFile, schoolCode: 'NAN' });
    assert.ok(globalThis.__scorebookFixtures.reads.some(ref => ref.endsWith(`/${namedId}`)));
    await act(async () => root.render(React.createElement(Workspace, { ...props, currentSchoolYear: '2026-2027' })));
    assert.equal(body.body.textContent.includes('Xem hồ sơ, sổ cũ'), true, 'new-year unassigned roster is still discoverable');
    assert.equal(body.body.textContent.includes('và 1 sổ đã lưu năm 2026-2027'), false, 'old book is not counted in the new year');
    assert.equal(body.querySelector('.scorebook-print-root').textContent.includes('BẢN ĐÃ NHẬP NĂM TRƯỚC'), false);
    assert.deepEqual(oldBook.edits, { 'custom:cover:title': 'BẢN ĐÃ NHẬP NĂM TRƯỚC', 'custom:hkiScore:0:uHSOLD:s6': '8', 'custom:hkiScore:0:r1:s0': '6.5' });
  } finally {
    await act(async () => root.unmount());
    windowObject.close();
    Object.assign(globalThis, previous);
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    delete globalThis.__scorebookFixtures;
    await rm(directory, { recursive: true, force: true });
  }
});
