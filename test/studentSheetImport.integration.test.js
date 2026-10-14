import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('Sheet import shows real progress, retains assigned classes and reports partial failures persistently', async () => {
  const directory = await mkdtemp(resolve('node_modules/.student-import-test-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(directory, 'manager.mjs');
    await build({ entryPoints: [resolve('src/components/HocSinhManager.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-import', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/"); export const doc=collection; export const query=ref=>ref; export const where=(...a)=>a; export const onSnapshot=(_ref,next)=>{next({docs:[]}); return ()=>{};}; export const setDoc=async()=>{throw new Error("Unexpected write");}; export const deleteDoc=setDoc; export const getDocsFromServer=async()=>({docs:window.fixture.serverStudents.map(student=>({id:student.id,data:()=>student}))});';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={}; export const appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=(...a)=>window.fixture.post(...a); export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('services/jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=(...a)=>window.fixture.save(...a); export const deleteStudentRecord=async()=>{throw new Error("Unexpected deletion");}; export const retryStudentSync=async()=>{}; export const retryPendingStudentSync=async()=>{};';
          if (args.path === 'firebase/firestore') contents += 'export const getDocFromServer=async()=>{throw new Error("Unexpected cleanup read");}; export const runTransaction=async()=>{throw new Error("Unexpected cleanup transaction");};';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    let finishRead, finishSave, reads = 0;
    const writes = [];
    const saveOptions = [];
    dom.window.confirm = () => true;
    dom.window.fixture = {
      post: () => { reads += 1; return new Promise(resolveRead => { finishRead = resolveRead; }); },
      save: (student, options) => {
        writes.push(student);
        saveOptions.push(options);
        if (student.id === 'failed') throw new Error('Lỗi lưu thử nghiệm');
        return new Promise(resolveSave => { finishSave = () => resolveSave({ ...student, id: student.id || options.id }); });
      }
    };
    const students = ['updated', 'same', 'failed'].map((id, index) => ({ id, fullName: ['An', 'Bình', 'Chi'][index], birthDate: '01/01/2010',
      accessCode: `HS2560${index + 1}`, className: '7A', grade: '7', entryGrade: '6', enrollmentYear: '2025-2026', schoolYear: '2026-2027', schoolCode: 'NAN', phone: '0900000000', hocLucLop6: 'Đạt' }));
    const restoreSource = { id: 'restore-source', fullName: 'Dũng', accessCode: 'HS25699', studentKey: 'HS25699', className: '6A', entryGrade: '6', enrollmentYear: '2025-2026', schoolYear: '2025-2026', schoolCode: 'NAN' };
    students.push(restoreSource, { ...restoreSource, id: 'restore-target', previousStudentId: restoreSource.id, schoolYear: '2026-2027',
      promotion: { sourceSchoolYear: '2025-2026', targetSchoolYear: '2026-2027', sourceClassName: '6A', targetClassName: '7A', outcome: 'promote', academicResult: 'Đạt' } });
    const document = dom.window.document;
    const button = label => [...document.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label || element.textContent.trim() === label);
    const click = element => act(async () => { assert.ok(element, 'expected button'); element.click(); });
    const openSheetUtilities = async () => {
      await click(button('Tiện ích'));
      await click([...document.querySelectorAll('[role="tablist"][aria-label="Nhóm tiện ích"] [role="tab"]')].find(tab => tab.textContent.startsWith('Web ↔ Sheet')));
    };
    const status = () => document.querySelector('[aria-label="Kết quả cập nhật từ Sheet"]');
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(Manager, { students, currentSchoolYear: '2026-2027', educationLevel: 'thcs', user: { uid: 'admin' } })));
    const start = async () => {
      await openSheetUtilities();
      await click(button('Sheet → Web: cập nhật hồ sơ'));
    };
    await start();
    assert.match(status().textContent, /Đang đọc hồ sơ từ Sheet/);
    assert.equal(reads, 1);
    await openSheetUtilities();
    assert.equal(button('Sheet → Web: cập nhật hồ sơ').disabled, true, 'a pending import cannot start twice');
    await click(button('Đóng bảng tiện ích'));
    const sheetRow = (student, patch = {}) => ({ ...student, currentClassName: '6A', className: '6A', ...patch });
    await act(async () => finishRead({ result: { success: true, items: [sheetRow(students[0], { phone: '0911111111', hocLucLop6: 'Tốt' }),
      sheetRow(students[1]), sheetRow(students[2], { phone: '0922222222' }), { fullName: 'Không khớp', birthDate: '02/01/2010', currentClassName: '6A' }] } }));
    assert.match(status().textContent, /Đang xử lý 0\/4/);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].className, '7A'); assert.equal(writes[0].grade, '7');
    assert.equal(writes[0].hocLucLop6, 'Đạt', 'Sheet cannot replace centre academic results');
    assert.equal(writes[0].entryGrade, '6');
    await act(async () => finishSave());
    assert.match(status().textContent, /Cập nhật chưa hoàn tất/);
    assert.match(status().textContent, /Đã sửa 1 · Không đổi 1 · Bỏ qua 1 · Lỗi 1 · Giữ lớp khác Sheet 3/);
    assert.match(status().textContent, /Lỗi lưu thử nghiệm/);
    assert.ok(status().querySelector('details'), 'the completion details remain after the menu closes');
    await click(button('Đóng kết quả cập nhật'));
    assert.equal(status(), null);
    await start();
    await act(async () => finishRead({ result: { success: false, message: 'Không đọc được Sheet' } }));
    assert.match(status().textContent, /Cập nhật chưa hoàn tất/);
    assert.match(status().textContent, /Không đọc được Sheet/);
    await start();
    await act(async () => finishRead({ result: { success: true, items: [] } }));
    assert.match(status().textContent, /Đã cập nhật xong/);
    assert.match(status().textContent, /không trả về hồ sơ nào/);
    await click(button('Tiện ích'));
    await click(button('Đối chiếu lớp theo kết quả năm trước'));
    const dialog = () => document.querySelector('[role="dialog"][aria-label="Đối chiếu lớp theo kết quả năm trước"]');
    assert.ok(dialog());
    assert.ok(dialog().textContent.includes('Quyết định lên lớp đã lưu'));
    await click(button('Khôi phục lớp đã lưu (1)'));
    assert.match(dialog().querySelector('[role="status"]').textContent, /Đang sửa lớp: 1\/1/);
    const restored = writes.at(-1);
    assert.equal(restored.className, '7A'); assert.equal(restored.entryGrade, '6');
    assert.deepEqual(restored.classHistory, { '2025-2026': '6A', '2026-2027': '7A' });
    await act(async () => finishSave());
    assert.match(dialog().querySelector('[role="status"]').textContent, /đã sửa 1\/1 hồ sơ trên web; đã gửi Sheet 1/);
    assert.equal(button('Khôi phục lớp đã lưu (0)').disabled, true, 'a completed restoration cannot run twice');
    await click(button('Đóng đối chiếu'));
    const active = { ...students[0], id: 'sheet-drop', accessCode: 'HS25681', fullName: 'Lan', classHistory: { '2025-2026': '6A', '2026-2027': '7A' } };
    const dropped = { ...active, id: 'legacy-drop', accessCode: 'HS25682', fullName: 'Mai', status: 'dropped' };
    const conflicting = { ...active, id: 'drop-over-graduate', accessCode: 'HS25683', fullName: 'Nam', className: 'TNTHCS', grade: '' };
    const render = records => act(async () => root.render(React.createElement(Manager, { students: records,
      currentSchoolYear: '2026-2027', educationLevel: 'thcs', user: { uid: 'admin' } })));
    await render([active, dropped, conflicting]);
    await start();
    const beforeDrops = writes.length;
    await act(async () => finishRead({ result: { success: true, items: [
      sheetRow(active, { dropoutYear: '2026-2027' }), sheetRow(dropped, { status: 'active', dropoutYear: '' }),
      sheetRow(conflicting, { currentClassName: 'TNTHCS', dropoutYear: '2026-2027' })
    ] } }));
    for (let index = 0; index < 3; index++) {
      const savedDrop = writes[beforeDrops + index];
      assert.equal(savedDrop.status, 'dropped'); assert.equal(savedDrop.className, ''); assert.equal(savedDrop.grade, '');
      assert.equal(savedDrop.dropoutYear, '2026-2027'); assert.equal(savedDrop.entryGrade, '6');
      assert.deepEqual(savedDrop.classHistory, { '2025-2026': '6A' });
      await act(async () => finishSave());
    }
    assert.match(status().textContent, /Đã sửa 3/);
    const cleanDropped = writes.slice(beforeDrops);
    await render(cleanDropped);
    await start();
    const beforeRepeat = writes.length;
    await act(async () => finishRead({ result: { success: true, items: cleanDropped.map(item => sheetRow(item, { status: 'active', dropoutYear: '' })) } }));
    assert.equal(writes.length, beforeRepeat, 'repeated imports must neither reactivate dropouts nor create redundant sync jobs');
    assert.match(status().textContent, /Không đổi 3/);
    await click(button('Đóng đối chiếu Sheet'));
    const original = { ...students[0], id: 'existing-nine', accessCode: 'HS25801', className: '9A', grade: '9' };
    const prior = { ...students[1], id: 'prior-eight', accessCode: 'HS25802', studentKey: 'stable-binh', className: '8A', grade: '8', schoolYear: '2025-2026' };
    const wrongClass = { ...students[2], id: 'wrong-class', accessCode: 'HS25803', className: '8A', grade: '8' };
    const duplicateOne = { ...students[0], id: 'duplicate-one', accessCode: 'HS25804', fullName: 'Đỗ Thị An' };
    const duplicateTwo = { ...duplicateOne, id: 'duplicate-two', accessCode: 'HS25805', fullName: 'do thi an' };
    const currentRecords = [original, prior, wrongClass, duplicateOne, duplicateTwo];
    dom.window.fixture.serverStudents = currentRecords;
    await render(currentRecords);
    await openSheetUtilities();
    await click(button('Chỉ đối chiếu Web ↔ Sheet'));
    const compare = () => document.querySelector('[role="dialog"][aria-label="Đối chiếu học sinh với Sheet"]');
    assert.match(compare().textContent, /Đang đọc và đối chiếu/);
    const beforeApply = writes.length;
    await act(async () => finishRead({ result: { success: true, items: [
      sheetRow(original, { rowNumber: 20, currentClassName: '9A' }),
      sheetRow(prior, { rowNumber: 21, currentClassName: '8A', classHistory: { '2025-2026': '8A', '2026-2027': '9A' } }),
      sheetRow(wrongClass, { rowNumber: 22, currentClassName: '9A', classHistory: { '2026-2027': '9A' } })
    ] } }));
    assert.equal(writes.length, beforeApply, 'opening the comparison is read-only');
    assert.match(compare().textContent, /Thiếu trên web/);
    assert.match(compare().textContent, /Cùng họ tên và ngày sinh/);
    await click(document.querySelector('input[aria-label="Chọn dòng Sheet 21"]'));
    await click(document.querySelector('input[aria-label="Chọn dòng Sheet 22"]'));
    await click(button('Áp dụng các hồ sơ đã chọn (2)'));
    const added = writes[beforeApply];
    assert.equal(added.className, '9A'); assert.equal(added.grade, '9'); assert.equal(added.schoolYear, '2026-2027');
    assert.equal(added.previousStudentId, prior.id); assert.equal(added.studentKey, prior.studentKey); assert.equal(added.accessCode, prior.accessCode);
    assert.equal(saveOptions[beforeApply].createOnly, true);
    assert.deepEqual(added.classHistory, { '2025-2026': '8A', '2026-2027': '9A' });
    await act(async () => finishSave());
    assert.equal(writes[beforeApply + 1].id, wrongClass.id); assert.equal(writes[beforeApply + 1].className, '9A');
    await act(async () => finishSave());
    assert.match(compare().textContent, /Hoàn tất: thêm 1, cập nhật lớp 1, lỗi 0/);
    assert.equal(button('Áp dụng các hồ sơ đã chọn (0)').disabled, true);
    const chooseDuplicate = [...compare().querySelectorAll('button')].find(element => element.textContent === 'Chọn trên danh sách');
    await click(chooseDuplicate);
    assert.equal(compare(), null);
    const selectedOnList = [...document.querySelectorAll('tbody tr')];
    assert.equal(selectedOnList.length, 1); assert.match(selectedOnList[0].textContent, /Đỗ Thị An/);
    assert.equal(writes.length, beforeApply + 2, 'choosing a suspected duplicate does not delete or overwrite any record');
    const misplaced = { ...original, id: 'wrong-year-vinh', fullName: 'Phạm Quốc Vinh', accessCode: 'HS26909', studentKey: 'stable-vinh',
      enrollmentYear: '2026-2027', entryGrade: '9', schoolYear: '2025-2026', classHistory: { '2025-2026': '9A' } };
    dom.window.fixture.serverStudents = [misplaced];
    await render([misplaced]);
    const beforeYearRead = writes.length;
    await openSheetUtilities();
    await click(button('Sheet → Web: cập nhật hồ sơ'));
    await act(async () => finishRead({ result: { success: true, items: [sheetRow(misplaced, { rowNumber: 119, schoolYear: '2026-2027', currentClassName: '9A', classHistory: { '2026-2027': '9A' } })] } }));
    assert.match(compare().textContent, /Năm nhập học \(Sheet\)/);
    assert.match(compare().textContent, /Sai năm hồ sơ web/);
    assert.match(compare().textContent, /trước năm nhập học/);
    assert.equal(writes.length, beforeYearRead, 'ordinary profile import must leave the wrong-year record untouched until its repair is selected');
    const beforeRepair = writes.length;
    await click(document.querySelector('input[aria-label="Chọn dòng Sheet 119"]'));
    await click(button('Áp dụng các hồ sơ đã chọn (1)'));
    const repaired = writes[beforeRepair];
    assert.equal(repaired.id, misplaced.id); assert.equal(repaired.schoolYear, '2026-2027'); assert.equal(repaired.enrollmentYear, '2026-2027');
    assert.equal(repaired.accessCode, misplaced.accessCode); assert.equal(repaired.previousStudentId, ''); assert.equal(repaired.studentKey, misplaced.studentKey);
    assert.deepEqual(repaired.classHistory, { '2026-2027': '9A' });
    assert.notEqual(saveOptions[beforeRepair].createOnly, true, 'repair must update the original record rather than create a duplicate');
    await act(async () => finishSave());
    assert.match(compare().textContent, /Đã sửa năm 1 hồ sơ/);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
    await rm(directory, { recursive: true, force: true });
  }
});
