import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('compact database loads images on demand, opens the matching profile and preserves selection and filters', async () => {
  const directory = await mkdtemp(resolve('node_modules/.student-database-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, localStorage: windowObject.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(directory, 'database.mjs');
    await build({ entryPoints: [resolve('src/components/HocSinhManager.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-database', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/"); export const doc=collection; export const query=ref=>ref; export const where=(...a)=>a; export const onSnapshot=(ref,next)=>{window.profileFeedNames ||= [];window.profileFeedNames.push(ref.split("/").at(-1));if(ref.endsWith("scorebooks"))window.activeScorebookFeeds=(window.activeScorebookFeeds||0)+1;if(ref.endsWith("class_attendance"))window.profileAttendanceSubscriptions=(window.profileAttendanceSubscriptions||0)+1;next({docs:ref.endsWith("class_attendance")?[{id:"day",data:()=>({schoolYear:"2026-2027",schoolCode:"NAN",date:"2026-09-01",records:{an:{studentId:"an",status:"CP"}}})}]:[]}); return ()=>{if(ref.endsWith("scorebooks"))window.activeScorebookFeeds--;};}; export const setDoc=async()=>{throw new Error("Unexpected write");}; export const deleteDoc=setDoc; export const getDocsFromServer=async()=>{throw new Error("Unexpected server read");};';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={}; export const appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=async()=>{throw new Error("Unexpected Sheet request");}; export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('services/jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=async()=>{throw new Error("Unexpected student write");}; export const deleteStudentRecord=saveStudentRecord; export const retryStudentSync=saveStudentRecord; export const retryPendingStudentSync=saveStudentRecord;';
          if (args.path === 'firebase/firestore') contents += 'export const getDocFromServer=async()=>{throw new Error("Unexpected cleanup read");}; export const runTransaction=async()=>{throw new Error("Unexpected cleanup transaction");};';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    const students = [
      { id: 'an', fullName: 'Nguyễn Văn An', birthDate: '01/01/2014', className: '6A', gender: 'Nam', birthProvince: 'Tỉnh Bến Tre', accessCode: 'HS001', enrollmentYear: '2024-2025', entryGrade: '4', classHistory: { '2024-2025': '4A', '2025-2026': '5A' }, portraitUrl: 'https://example.com/an.png', transcriptUrl: 'https://example.com/hoc-ba.png', sheetSync: { status: 'failed' } },
      { id: 'binh', fullName: 'Lê Thị Bình', birthDate: '02/01/2014', className: '6B', gender: 'Nữ', birthProvince: 'Bến tre', accessCode: 'HS002', portraitUrl: 'https://example.com/binh.png' },
      { id: 'chi', fullName: 'Trần Văn Chi', birthDate: '03/01/2013', className: '7A', gender: 'Nam', birthProvince: 'Tỉnh An Giang', accessCode: 'HS003' }
    ].map(student => ({ ...student, schoolYear: '2026-2027', schoolCode: 'NAN' }));
    root = createRoot(windowObject.document.getElementById('root'));
    await act(async () => root.render(React.createElement(Manager, { students, configuredClassOptions: ['6A', '6B', '7A', '8A'], currentSchoolYear: '2026-2027', profileRequestsSnapshot: [], user: { uid: 'fixture' } })));
    assert.equal(windowObject.profileFeedNames?.includes('scorebooks') || false, false, 'list does not open scorebooks');
    assert.equal(windowObject.profileFeedNames?.includes('student_profile_requests') || false, false, 'root snapshot is reused without a second request listener');
    const body = windowObject.document;
    const table = () => body.querySelector('table[aria-label="Database học sinh"]');
    const row = name => [...table().querySelectorAll('tbody tr')].find(item => item.textContent.includes(name));
    const namedButton = label => body.querySelector(`button[aria-label="${label}"]`);
    const buttonWithText = label => [...body.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label);
    const click = element => act(async () => element.click());
    const filterPanel = () => body.querySelector('[role="dialog"][aria-label^="Lọc "]');
    const filterCheckbox = label => [...filterPanel().querySelectorAll('label')].find(item => item.textContent.trim() === label)?.querySelector('input');
    const openFilter = async label => {
      const button = namedButton(label);
      if (button.getAttribute('aria-expanded') !== 'true') await click(button);
      return filterPanel();
    };
    const filterOptions = () => [...filterPanel().querySelectorAll('[role="group"] label')].map(item => item.textContent.trim());
    const selectFilter = async (label, values) => {
      await openFilter(label);
      const all = filterCheckbox('Chọn tất cả');
      if (!all.checked) await click(all);
      await click(all);
      for (const value of values) await click(filterCheckbox(value));
      await click(buttonWithText('Xong'));
    };
    const assertAligned = () => {
      for (const item of table().querySelectorAll('tbody tr')) {
        assert.equal(item.children.length, table().querySelectorAll('thead th').length);
      }
    };

    assertAligned();
    assert.equal(body.querySelectorAll('img, iframe').length, 0, 'the default table must not load any portrait or document images');
    assert.doesNotMatch(body.body.textContent, /Sheet năm này|Database:|Đang kiểm tra số lượng/);
    assert.ok(table().querySelector('thead').textContent.includes('Hồ sơ'));
    assert.ok(table().querySelector('thead').textContent.includes('Ảnh'));
    assert.ok(row('Nguyễn Văn An').textContent.includes('01/01/2014'));
    assert.ok(row('Nguyễn Văn An').textContent.includes('HS001'));

    const gradeSelect = namedButton('Khối');
    const classSelect = namedButton('Lớp');
    assert.equal(body.querySelector('input[type="search"]'), null, 'search stays hidden until requested');
    await openFilter('Khối');
    assert.deepEqual(filterOptions(), ['Khối 6', 'Khối 7', 'Khối 8']);
    await selectFilter('Khối', ['Khối 6']);
    assert.equal(table().querySelectorAll('tbody tr').length, 2);
    await openFilter('Lớp');
    assert.deepEqual(filterOptions(), ['6A', '6B']);
    await selectFilter('Lớp', ['6B']);
    assert.equal(table().querySelectorAll('tbody tr').length, 1);
    assert.ok(row('Lê Thị Bình'));
    await selectFilter('Khối', ['Khối 7']);
    assert.equal(classSelect.textContent.trim(), 'Tất cả', 'changing grade clears a class from the previous grade');
    await openFilter('Lớp');
    assert.deepEqual(filterOptions(), ['7A']);
    await click(buttonWithText('Xong'));
    assert.ok(row('Trần Văn Chi'));
    assert.equal(row('Lê Thị Bình'), undefined);
    await selectFilter('Khối', ['Khối 8']);
    assert.ok(table().textContent.includes('Chưa có học sinh'));
    assert.equal(table().querySelector('tbody td').colSpan, table().querySelectorAll('thead th').length);
    await click(buttonWithText('Xóa lọc'));
    assert.equal(table().querySelectorAll('tbody tr').length, 3);

    await selectFilter('Khối', ['Khối 6']);
    await selectFilter('Lớp', ['6B']);
    await openFilter('Khối');
    await click(filterCheckbox('Khối 7'));
    assert.ok(filterPanel(), 'checking a value keeps the panel open for more selections');
    assert.equal(filterCheckbox('Chọn tất cả').indeterminate, true, 'partial selection is shown on the all-values checkbox');
    assert.equal(classSelect.textContent.trim(), '6B', 'adding another grade preserves a valid selected class');
    await click(buttonWithText('Xong'));
    await openFilter('Lớp');
    assert.deepEqual(filterOptions(), ['6A', '6B', '7A']);
    await click(filterCheckbox('7A'));
    assert.equal(table().querySelectorAll('tbody tr').length, 2, 'classes combine with OR within the selected grades');
    assert.ok(row('Lê Thị Bình'));
    assert.ok(row('Trần Văn Chi'));
    await click(buttonWithText('Xong'));
    await openFilter('Khối');
    await click(filterCheckbox('Khối 6'));
    assert.equal(classSelect.textContent.trim(), '7A', 'removing a grade only removes its selected classes');
    assert.equal(table().querySelectorAll('tbody tr').length, 1);
    await click(buttonWithText('Xong'));
    await selectFilter('Khối', []);
    assert.ok(table().textContent.includes('Chưa có học sinh'), 'deselecting all means no rows, not all rows');
    assert.equal(gradeSelect.textContent.trim(), 'Chưa chọn');
    await click(buttonWithText('Xóa lọc'));
    await selectFilter('Lớp', []);
    await selectFilter('Khối', ['Khối 6']);
    assert.ok(table().textContent.includes('Chưa có học sinh'), 'changing grades preserves an intentionally empty class selection');
    await click(buttonWithText('Xóa lọc'));

    await openFilter('Khối');
    await click(filterCheckbox('Chọn tất cả'));
    const filterSearch = filterPanel().querySelector('input[type="search"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(filterSearch, 'khoi 7');
      filterSearch.dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    assert.deepEqual(filterOptions(), ['Khối 7'], 'option search accepts text without accents');
    await click(filterCheckbox('Chọn tất cả kết quả'));
    assert.ok(row('Trần Văn Chi'));
    assert.equal(table().querySelectorAll('tbody tr').length, 1);
    await click(buttonWithText('Xong'));
    await click(buttonWithText('Xóa lọc'));

    await selectFilter('Lọc Giới tính', ['Nam']);
    assert.equal(table().querySelectorAll('tbody tr').length, 2);
    await openFilter('Lọc Tỉnh nơi sinh');
    assert.deepEqual(filterOptions(), ['Tỉnh An Giang', 'Tỉnh Bến Tre'], 'legacy province spellings share one full label');
    await selectFilter('Lọc Tỉnh nơi sinh', ['Tỉnh Bến Tre']);
    assert.equal(table().querySelectorAll('tbody tr').length, 1, 'different columns combine with AND');
    assert.ok(row('Nguyễn Văn An'));
    await openFilter('Lọc Tỉnh nơi sinh');
    await click(filterCheckbox('Tỉnh An Giang'));
    assert.equal(table().querySelectorAll('tbody tr').length, 2, 'several province values can be checked');
    await click(buttonWithText('Xong'));
    await click(buttonWithText('Xóa lọc'));
    await selectFilter('Lọc Tỉnh nơi sinh', ['Tỉnh Bến Tre']);
    assert.equal(table().querySelectorAll('tbody tr').length, 2, 'province filtering preserves raw address keys and matches both legacy spellings');
    assert.equal(students[1].birthProvince, 'Bến tre');
    await click(buttonWithText('Xóa lọc'));
    await selectFilter('Lọc Link ảnh Học bạ', ['(Trống)']);
    assert.equal(table().querySelectorAll('tbody tr').length, 2);
    await openFilter('Lọc Link ảnh Học bạ');
    await click(filterCheckbox('Có'));
    assert.equal(table().querySelectorAll('tbody tr').length, 3, 'documents support both present and blank values');
    await click(buttonWithText('Xong'));

    await openFilter('Lọc Giới tính');
    await openFilter('Lọc Tỉnh nơi sinh');
    assert.equal(body.querySelectorAll('[role="dialog"][aria-label^="Lọc "]').length, 1, 'opening another filter closes the previous one');
    assert.equal(filterPanel().getAttribute('aria-label'), 'Lọc Tỉnh nơi sinh');
    await act(async () => { windowObject.innerHeight -= 220; windowObject.dispatchEvent(new windowObject.Event('resize')); });
    assert.ok(filterPanel(), 'opening a phone keyboard changes height without closing the filter');
    await act(async () => { windowObject.innerHeight += 220; windowObject.dispatchEvent(new windowObject.Event('resize')); });
    await act(async () => filterPanel().querySelector('[role="group"]').dispatchEvent(new windowObject.Event('scroll')));
    assert.ok(filterPanel(), 'scrolling option values keeps the panel open');
    await act(async () => table().parentElement.dispatchEvent(new windowObject.Event('scroll')));
    assert.equal(filterPanel(), null, 'scrolling the student table closes an anchored filter');
    await openFilter('Lọc Giới tính');
    await act(async () => body.body.dispatchEvent(new windowObject.Event('pointerdown', { bubbles: true })));
    assert.equal(filterPanel(), null, 'clicking outside closes the filter');
    await openFilter('Lọc Giới tính');
    await act(async () => body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(filterPanel(), null);
    assert.equal(body.activeElement, namedButton('Lọc Giới tính'), 'Escape restores focus to the filter button');

    const dropped = { id: 'dung', fullName: 'Phạm Thị Dung', schoolYear: '2026-2027', schoolCode: 'NAN', className: '7B', status: 'dropped' };
    await act(async () => root.render(React.createElement(Manager, { students: [...students, dropped], currentSchoolYear: '2026-2027', user: { uid: 'fixture' } })));
    assert.equal(table().querySelectorAll('tbody tr').length, 3, 'the default status stays active');
    await selectFilter('Trạng thái', ['Đang học', 'Bỏ học']);
    assert.equal(table().querySelectorAll('tbody tr').length, 4);
    await selectFilter('Trạng thái', ['Bỏ học']);
    assert.equal(table().querySelectorAll('tbody tr').length, 1);
    assert.ok(row('Phạm Thị Dung'));
    await click(buttonWithText('Xóa lọc'));
    await act(async () => root.render(React.createElement(Manager, { students, configuredClassOptions: ['6A', '6B', '7A', '8A'], currentSchoolYear: '2026-2027', user: { uid: 'fixture' } })));

    await click(buttonWithText('Tìm kiếm'));
    const searchDialog = () => body.querySelector('#student-database-search');
    const searchInput = searchDialog().querySelector('input');
    assert.equal(body.activeElement, searchInput);
    assert.ok(searchDialog().querySelector('select[aria-label="Nghề nghiệp cha"]'), 'hidden profile fields are searchable');
    assert.deepEqual([...searchDialog().querySelector('select[aria-label="Nơi sinh: tỉnh/thành"]').options].map(option => option.textContent), ['-- Tất cả --', '(Chưa có thông tin)', 'Tỉnh An Giang', 'Tỉnh Bến Tre'], 'province lists are built from real rows and merge legacy spellings');
    assert.equal(searchDialog().querySelector('[aria-label="Kết hợp điều kiện"]'), null, 'fields appear directly without a rule builder');
    await act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(searchInput, 'le thi binh');
      searchInput.dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    assert.equal(table().querySelectorAll('tbody tr').length, 3, 'draft does not change the table');
    assert.match(searchDialog().querySelector('[role="status"]').textContent, /1\/3/);
    await click(buttonWithText('Lọc'));
    assert.equal(table().querySelectorAll('tbody tr').length, 1);
    assert.ok(row('Lê Thị Bình'), 'search still accepts Vietnamese names without accents');
    await selectFilter('Khối', ['Khối 6']);
    await selectFilter('Lớp', ['6A']);
    assert.ok(table().textContent.includes('Chưa có học sinh'), 'search combines with grade and class');
    await click(buttonWithText('Tìm kiếm (1)'));
    await click(namedButton('Đóng tìm kiếm'));
    assert.equal(searchDialog(), null);
    assert.ok(table().textContent.includes('Chưa có học sinh'), 'closing preserves applied conditions');
    await click(namedButton('Bỏ điều kiện tìm kiếm'));
    assert.equal(classSelect.textContent.trim(), '6A');
    assert.ok(row('Nguyễn Văn An'), 'clearing search keeps grade and class');
    await click(buttonWithText('Tìm kiếm'));
    assert.equal(searchDialog().querySelector('input').value, '');
    await act(async () => body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(searchDialog(), null);
    assert.equal(body.activeElement, buttonWithText('Tìm kiếm'));
    await click(buttonWithText('Xóa lọc'));

    await click(buttonWithText('Tìm kiếm'));
    const setControl = async (label, value) => {
      const input = searchDialog().querySelector(`[aria-label="${label}"]`);
      await act(async () => {
        const prototype = input.tagName === 'SELECT' ? windowObject.HTMLSelectElement.prototype : windowObject.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
        input.dispatchEvent(new windowObject.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    };
    await setControl('Nghề nghiệp cha', '__SEARCH_MISSING__');
    await setControl('Năm sinh', '2014');
    assert.match(searchDialog().querySelector('[role="status"]').textContent, /2\/3/);
    await click(buttonWithText('Lọc'));
    assert.equal(table().querySelectorAll('tbody tr').length, 2, 'a hidden parent field combines with derived birth year');
    await click(buttonWithText('Tìm kiếm (2)'));
    await setControl('Năm sinh', '2013');
    await click(buttonWithText('Hủy'));
    assert.equal(table().querySelectorAll('tbody tr').length, 2, 'cancel does not apply draft edits');
    await click(buttonWithText('Xóa lọc'));
    assert.equal(table().querySelectorAll('tbody tr').length, 3, 'reset clears advanced search too');
    const statusSelect = namedButton('Trạng thái');
    await openFilter('Trạng thái');
    assert.equal(filterCheckbox('Chọn tất cả').indeterminate, true, 'opening a partly selected status shows the mixed state immediately');
    await selectFilter('Trạng thái', ['Bỏ học']);
    assert.ok(table().textContent.includes('Chưa có học sinh'));
    await click(buttonWithText('Xóa lọc'));
    assert.equal(statusSelect.textContent.trim(), 'Đang học');
    assert.equal(table().querySelectorAll('tbody tr').length, 3);

    await click(row('Nguyễn Văn An').querySelector('input[type="checkbox"]'));
    const showPortraits = body.querySelector('input[aria-label="Hiện ảnh"]');
    assert.equal(showPortraits.checked, false, 'portraits are hidden by default');
    assert.ok(showPortraits.parentElement.compareDocumentPosition(gradeSelect.parentElement) & windowObject.Node.DOCUMENT_POSITION_FOLLOWING, 'the shared portrait toggle comes before the grade filter');
    await click(showPortraits);
    assert.equal(showPortraits.checked, true);
    assert.deepEqual([...table().querySelectorAll('img')].map(image => image.getAttribute('src')).sort(), ['https://example.com/an.png', 'https://example.com/binh.png'], 'one toggle shows every available portrait without loading document images');
    assert.ok(row('Trần Văn Chi').textContent.includes('Chưa có ảnh'));
    assert.equal(row('Nguyễn Văn An').querySelector('input[type="checkbox"]').checked, true, 'showing portraits preserves student selection');
    assertAligned();
    await selectFilter('Khối', ['Khối 6']);
    await selectFilter('Lớp', ['6B']);
    assert.equal(table().querySelectorAll('tbody tr').length, 1);
    assert.equal(row('Lê Thị Bình').querySelector('img').getAttribute('src'), 'https://example.com/binh.png', 'the portrait view follows the existing grade and class filters');
    await click(showPortraits);
    assert.equal(table().querySelectorAll('img, iframe').length, 0, 'turning the shared toggle off restores the compact table');
    assert.equal(classSelect.textContent.trim(), '6B');
    await click(buttonWithText('Xóa lọc'));
    assert.equal(row('Nguyễn Văn An').querySelector('input[type="checkbox"]').checked, true);
    const avatarButton = namedButton('Xem ảnh Nguyễn Văn An');
    avatarButton.focus();
    await click(avatarButton);
    let dialog = body.querySelector('[role="dialog"]');
    assert.ok(dialog.textContent.includes('Nguyễn Văn An'));
    assert.equal(dialog.querySelector('img').getAttribute('src'), 'https://example.com/an.png');
    assert.equal(body.querySelectorAll('img').length, 1, 'only the requested portrait is loaded');
    assert.equal(table().querySelectorAll('img, iframe').length, 0);
    assert.equal(body.activeElement, namedButton('Đóng ảnh đại diện'));
    await act(async () => body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(body.querySelector('[role="dialog"]'), null);
    assert.equal(body.activeElement, avatarButton, 'closing the preview restores keyboard focus');
    assert.equal(row('Nguyễn Văn An').querySelector('input[type="checkbox"]').checked, true);

    await click(namedButton('Xem ảnh Lê Thị Bình'));
    dialog = body.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelector('img').getAttribute('src'), 'https://example.com/binh.png');
    await click(buttonWithText('Mở hồ sơ'));
    dialog = body.querySelector('[role="dialog"]');
    assert.match(dialog.textContent, /hồ sơ học sinh/i);
    assert.ok([...dialog.querySelectorAll('input')].some(input => input.value === 'Lê Thị Bình'));
    const profileInput = label => [...dialog.querySelectorAll('label')].find(item => item.firstElementChild?.textContent.trim() === label)?.querySelector('input, select');
    const typeValue = (element, value) => act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    assert.match(dialog.querySelector('h4').textContent, /Xem hồ sơ/);
    assert.equal(profileInput('Họ và tên *').readOnly, true);
    assert.equal(profileInput('Tình trạng').disabled, true);
    assert.equal(buttonWithText('Lưu hồ sơ'), undefined);
    await click(buttonWithText('Địa chỉ'));
    await click(buttonWithText('Chỉnh sửa hồ sơ'));
    assert.equal(dialog.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(), 'Địa chỉ', 'switching to edit keeps the current section');
    await click(buttonWithText('Thông tin'));
    assert.equal(profileInput('Tên cha').readOnly, false);
    assert.equal(buttonWithText('Lưu hồ sơ').disabled, false);
    assert.equal(body.querySelector('input[aria-label="Chỉnh sửa nhanh"]').checked, false, 'editing a profile does not turn on quick editing for the table');
    await click(buttonWithText('Thông tin'));
    assert.equal(profileInput('Tình trạng').disabled, false);
    assert.equal(profileInput('Họ và tên *').value, 'Lê Thị Bình', 'the same student stays open after switching modes');
    await typeValue(profileInput('Họ và tên *'), 'Lê Thị Bình Thử');
    assert.equal(profileInput('Họ và tên *').value, 'Lê Thị Bình Thử');
    await click(buttonWithText('Hủy'));
    assert.equal(body.querySelector('[role="dialog"]'), null, 'cancel closes the edit without saving');
    await click(namedButton('Mở hồ sơ Lê Thị Bình'));
    dialog = body.querySelector('[role="dialog"]');
    assert.equal(profileInput('Họ và tên *').value, 'Lê Thị Bình', 'cancel leaves the stored profile unchanged');
    assert.equal(profileInput('Họ và tên *').readOnly, true, 'a newly opened profile still starts in view mode');
    assert.equal(windowObject.activeScorebookFeeds, 1, 'profile requests academic results on demand');
    await click(namedButton('Đóng hồ sơ'));
    assert.equal(windowObject.activeScorebookFeeds, 0, 'closing profile releases the scorebook feed');
    assert.equal(table().querySelectorAll('img, iframe').length, 0);

    await click(namedButton('Xem ảnh Trần Văn Chi'));
    dialog = body.querySelector('[role="dialog"]');
    assert.ok(dialog.textContent.includes('Chưa có ảnh đại diện.'));
    assert.equal(dialog.querySelector('img, iframe'), null);
    await click(dialog.parentElement);
    assert.equal(body.querySelector('[role="dialog"]'), null, 'clicking outside closes the avatar');

    const attendanceSubscriptionsBeforeOpen = windowObject.profileAttendanceSubscriptions || 0;
    await click(row('Nguyễn Văn An').querySelector('button[title="Sửa thông tin"]'));
    dialog = body.querySelector('[role="dialog"]');
    assert.ok([...dialog.querySelectorAll('input')].some(input => input.value === 'HS001'));
    assert.equal(dialog.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(), 'Thông tin');
    assert.equal(dialog.querySelectorAll('img, iframe').length, 0, 'opening the information section does not load document previews');
    assert.doesNotMatch(dialog.textContent, /Hồ sơ cũ có thể được ước tính/);
    assert.equal(buttonWithText('Quá trình học'), undefined, 'history is part of information rather than a separate tab');
    const historyTable = dialog.querySelector('table[aria-label="Quá trình học tại trung tâm"]');
    assert.equal(historyTable.querySelectorAll('tbody tr').length, 6);
    assert.ok(historyTable.querySelectorAll('tbody tr')[0].textContent.includes('4A'));
    assert.ok(historyTable.querySelectorAll('tbody tr')[3].textContent.includes('Khối 7'));
    assert.ok(historyTable.querySelectorAll('tbody tr')[3].textContent.includes('Dự kiến'));
    assert.ok(historyTable.querySelectorAll('tbody tr')[2].textContent.includes('1 ngày'));
    await click(historyTable.querySelector('summary'));
    assert.equal(historyTable.querySelector('details').open, true);
    assert.ok(historyTable.querySelector('details').textContent.includes('01/09/2026'));
    assert.equal(windowObject.profileAttendanceSubscriptions, attendanceSubscriptionsBeforeOpen + 1, 'attendance loads with the information tab');
    await typeValue(profileInput('Tên cha'), 'Nguyễn Văn Ba');
    await click(buttonWithText('Địa chỉ'));
    assert.ok(profileInput('Tỉnh nơi sinh'));
    assert.ok(profileInput('Tỉnh / Thành hk'));
    await click(buttonWithText('Học tập & Giấy tờ'));
    assert.deepEqual([...profileInput('Học lực lớp 6').options].map(option => option.value), ['', 'Tốt', 'Khá', 'Đạt']);
    assert.ok([...dialog.querySelectorAll('img')].some(image => image.getAttribute('src') === 'https://example.com/hoc-ba.png'));
    await click(buttonWithText('Thông tin'));
    assert.equal(profileInput('Tên cha').value, 'Nguyễn Văn Ba', 'changing sections keeps unsaved edits');
    await click(buttonWithText('Thông tin'));
    assert.ok(dialog.querySelector('table[aria-label="Quá trình học tại trung tâm"]'), 'returning to information also shows history');
    assert.equal(windowObject.profileAttendanceSubscriptions, attendanceSubscriptionsBeforeOpen + 1, 'switching tabs reuses the live attendance subscription');
    assert.equal(dialog.querySelectorAll('img, iframe').length, 0, 'leaving documents unmounts their previews');
    await click(namedButton('Đóng hồ sơ'));
    await click(row('Nguyễn Văn An').querySelector('button[title^="Xem Link ảnh Học bạ"]'));
    assert.ok([...body.querySelectorAll('img')].some(img => img.getAttribute('src') === 'https://example.com/hoc-ba.png'));
    await click(body.querySelector('button[title="Đóng"]'));
    assert.equal(body.querySelectorAll('img, iframe').length, 0);

    await click(buttonWithText('Cột'));
    await click(buttonWithText('Tất cả'));
    assertAligned();
    assert.equal(table().querySelectorAll('img, iframe').length, 0, 'showing every data column still uses document buttons');
    await click(buttonWithText('Gọn'));
    assertAligned();
    await click(buttonWithText('Mặc định'));
    await click(buttonWithText('Đóng'));
    await click(buttonWithText('Tiện ích'));
    let utilities = body.querySelector('[role="dialog"][aria-label="Tiện ích học sinh"]');
    assert.ok(utilities);
    assert.equal(body.activeElement, namedButton('Đóng bảng tiện ích'));
    assert.doesNotMatch(utilities.textContent, /Dong bo nam truoc|Đồng bộ năm trước/);
    const utilityTab = label => [...body.querySelectorAll('[role="tablist"][aria-label="Nhóm tiện ích"] [role="tab"]')].find(tab => tab.textContent.startsWith(label));
    assert.equal(utilities.querySelectorAll('[role="tab"]').length, 4);
    assert.equal(utilityTab('Thường dùng').getAttribute('aria-selected'), 'true');
    assert.equal(utilities.querySelectorAll('[role="tabpanel"]').length, 1, 'only the selected group is mounted');
    assert.equal(namedButton('Kiểm tra học sinh nghi trùng'), null, 'other groups do not crowd the common actions');
    assert.ok([...utilities.querySelectorAll('[role="tab"][aria-selected="false"]')].every(tab => tab.tabIndex === -1));
    for (const action of utilities.querySelectorAll('button[aria-describedby]')) {
      assert.ok(body.getElementById(action.getAttribute('aria-describedby'))?.textContent.trim(), `${action.getAttribute('aria-label')} has a reminder`);
    }
    const utilityHelp = () => utilities.querySelector('aside[aria-label="Giải thích chức năng"]');
    await act(async () => namedButton('Quản lý mã học sinh').dispatchEvent(new windowObject.MouseEvent('mouseover', { bubbles: true })));
    assert.match(utilityHelp().textContent, /Cấp mã đăng nhập còn thiếu/);
    assert.equal(namedButton('Đóng quản lý mã học sinh'), null, 'hover explains the action without running it');
    assert.equal(namedButton('Gửi thư cho học sinh đã chọn (1)').disabled, true, 'unavailable mailbox callbacks remain disabled');
    await click(namedButton('Giải thích: Gửi thư cho học sinh đã chọn (1)'));
    assert.match(utilityHelp().textContent, /hộp thư trên web/);
    assert.ok(utilities.isConnected, 'touch help remains available even for a disabled action');
    await click(namedButton('Nhóm tiện ích tiếp theo'));
    assert.equal(utilityTab('Rà soát hồ sơ').getAttribute('aria-selected'), 'true');
    assert.ok(namedButton('Kiểm tra học sinh nghi trùng'));
    assert.ok(utilities.querySelector('select[aria-label="Lọc hồ sơ"]'));
    assert.equal(namedButton('Quản lý mã học sinh'), null);
    await act(async () => {
      utilityTab('Rà soát hồ sơ').focus();
      body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    assert.equal(body.activeElement, utilityTab('Web → Sheet'), 'arrow navigation moves focus with the selected group');
    assert.equal(utilityTab('Web → Sheet').getAttribute('aria-selected'), 'true');
    assert.ok(utilityTab('Web → Sheet').querySelector('[aria-label="1 hồ sơ chờ đồng bộ"]'));
    const originalViewport = { width: windowObject.innerWidth, height: windowObject.innerHeight };
    await act(async () => {
      windowObject.innerWidth = 390;
      windowObject.innerHeight = 844;
      windowObject.dispatchEvent(new windowObject.Event('resize'));
    });
    assert.ok(utilities.isConnected, 'resizing keeps the selected group open');
    assert.equal(utilities.style.width, '366px', 'the menu fits a phone viewport with margins');
    assert.equal(utilityTab('Web → Sheet').getAttribute('aria-selected'), 'true');
    await act(async () => {
      windowObject.innerWidth = originalViewport.width;
      windowObject.innerHeight = originalViewport.height;
      windowObject.dispatchEvent(new windowObject.Event('resize'));
    });
    assert.match(body.getElementById(namedButton('Web → Sheet: gửi toàn bộ năm').getAttribute('aria-describedby')).textContent, /toàn bộ.*năm đang xem.*ngoài bộ lọc/);
    assert.match(body.getElementById(namedButton('Nhập từ Sheet (thủ công)').getAttribute('aria-describedby')).textContent, /từ Google Sheet.*trên Web.*chọn thêm hồ sơ thiếu/);
    assert.ok(namedButton('Chỉ đối chiếu Web ↔ Sheet'));
    assert.ok(buttonWithText('Thử lại Web → Sheet (1)'), 'retry stays available after removing the summary banner');
    await click(namedButton('Nhóm tiện ích trước'));
    assert.equal(utilityTab('Rà soát hồ sơ').getAttribute('aria-selected'), 'true');
    await click(utilityTab('Sửa dữ liệu cũ'));
    assert.ok(namedButton('Sửa khối theo lớp'));
    await act(async () => {
      utilityTab('Sửa dữ liệu cũ').focus();
      body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    });
    assert.equal(body.activeElement, utilityTab('Thường dùng'));
    await click(namedButton('Nhóm tiện ích trước'));
    assert.equal(utilityTab('Sửa dữ liệu cũ').getAttribute('aria-selected'), 'true', 'navigation wraps at the first group');
    await click(namedButton('Nhóm tiện ích tiếp theo'));
    assert.equal(utilityTab('Thường dùng').getAttribute('aria-selected'), 'true');
    await click(utilityTab('Web → Sheet'));
    await click(namedButton('Nhập danh sách mới'));
    assert.equal(body.querySelector('[aria-label="Tiện ích học sinh"]'), null);
    assert.ok(body.querySelector('textarea[placeholder^="Dán dữ liệu"]'), 'the consolidated Sheet group still opens the new-student importer');
    await click(buttonWithText('Đóng'));
    await click(buttonWithText('Tiện ích'));
    await click(namedButton('Quản lý mã học sinh'));
    assert.ok(namedButton('Đóng quản lý mã học sinh'));
    assert.match(body.body.textContent, /học sinh phải dùng mã mới/);
    await click(namedButton('Đóng quản lý mã học sinh'));
    await click(buttonWithText('Tiện ích'));
    await act(async () => body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    assert.equal(body.activeElement, namedButton('Giải thích: Đối chiếu lớp theo kết quả năm trước'), 'focus wraps to the last help button in the current group');
    await act(async () => body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    assert.equal(body.activeElement, namedButton('Đóng bảng tiện ích'), 'forward Tab also stays inside the dialog');
    await act(async () => body.activeElement.dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(body.querySelector('[aria-label="Tiện ích học sinh"]'), null);
    assert.equal(body.activeElement, buttonWithText('Tiện ích'), 'closing utilities restores focus to the launcher');
    await click(buttonWithText('Tiện ích'));
    await click(namedButton('Đóng tiện ích'));
    await click(body.querySelector('button[title="Lọc học sinh đã chọn"]'));
    assert.equal(table().querySelectorAll('tbody tr').length, 1);
    assert.ok(row('Nguyễn Văn An'));
    await click(buttonWithText('Xóa lọc'));
    assert.equal(table().querySelectorAll('tbody tr').length, 3);
    assertAligned();

    await act(async () => root.unmount());
    windowObject.localStorage.setItem('khl-student-db-prefs-v1', JSON.stringify({ visibleColumns: ['fullName', 'birthCertificateUrl', 'identityCardUrl', 'transcriptUrl', 'portraitUrl'] }));
    root = createRoot(body.getElementById('root'));
    await act(async () => root.render(React.createElement(Manager, { students, currentSchoolYear: '2026-2027', user: { uid: 'fixture' } })));
    assert.equal(body.querySelectorAll('img, iframe').length, 0, 'restored column preferences must not start image downloads');
    assertAligned();
    await click(buttonWithText('Cột'));
    await click(buttonWithText('Chỉ ảnh'));
    assert.ok(table().querySelector('img'), 'the existing document gallery remains available when explicitly requested');
    assertAligned();

    const mixedStudents = [...students, { id: 'primary', fullName: 'Nguyễn Văn Tiểu', accessCode: 'TH001', className: '3A', schoolYear: '2026-2027', schoolCode: 'NAN' }];
    await act(async () => root.render(React.createElement(Manager, { key: 'primary', educationLevel: 'primary', students: mixedStudents,
      configuredClassOptions: ['1A', '3A', '6A', '7A'], currentSchoolYear: '2026-2027', user: { uid: 'fixture' } })));
    assert.ok(row('Nguyễn Văn Tiểu'));
    assert.equal(row('Nguyễn Văn An'), undefined, 'a pupil admitted in grade 4 now belongs to secondary grade 6');
    await openFilter('Khối');
    assert.deepEqual(filterOptions(), ['Khối 1', 'Khối 3']);
    await click(buttonWithText('Xong'));
    await act(async () => root.render(React.createElement(Manager, { key: 'thcs', educationLevel: 'thcs', students: mixedStudents,
      currentSchoolYear: '2026-2027', user: { uid: 'fixture' } })));
    assert.equal(row('Nguyễn Văn Tiểu'), undefined);
    assert.ok(row('Nguyễn Văn An'));
    assert.equal(table().querySelectorAll('tbody tr').length, 3);

    const gradeNine = Array.from({ length: 40 }, (_, index) => ({
      ...students[0], id: `nine-${index}`, fullName: `Học sinh mẫu ${index + 1}`, accessCode: `HS9${index + 1}`,
      className: '9A', grade: '8', entryGrade: '6', birthProvince: index < 26 ? '' : 'Tỉnh Bến Tre',
      phone: '0900000000', identityCode: `079000000${index}`, address: 'Địa chỉ mẫu',
      portraitUrl: 'https://example.com/portrait.png', birthCertificateUrl: 'https://example.com/birth.png',
      identityCardUrl: 'https://example.com/identity.png', transcriptUrl: 'https://example.com/transcript.png'
    }));
    windowObject.localStorage.setItem('khl-student-db-prefs-v1', JSON.stringify({ quickIssueFilter: 'missingInfo' }));
    await act(async () => root.render(React.createElement(Manager, { key: 'persisted-issue-filter', educationLevel: 'thcs',
      students: [...gradeNine, { ...students[0], id: 'other-grade', className: '8A' },
        { ...gradeNine[0], id: 'previous-year', schoolYear: '2025-2026' }],
      configuredClassOptions: ['8A', '9A', '9B'], initialTab: 'countStats', currentSchoolYear: '2026-2027', user: { uid: 'fixture' } })));
    const statsRow = [...body.querySelectorAll('tr')].find(item => item.cells[0]?.textContent.trim() === 'Lớp 9A');
    assert.equal(statsRow.cells[1].textContent.trim(), '40', 'class statistics count the entire current-year class');
    await click(body.querySelector('button[title="Đóng"]'));
    await selectFilter('Khối', ['Khối 9']);
    await selectFilter('Lớp', ['9A']);
    assert.equal(table().querySelectorAll('tbody tr').length, 26, 'the restored issue filter can hide 14 members of a class');
    assert.equal(body.querySelector('[aria-label="Số học sinh đang hiển thị"]').textContent.trim(), 'Hiển thị 26/40 học sinh');
    assert.equal(body.querySelector('[aria-label="Tiện ích học sinh"]'), null);
    assert.ok(namedButton('Bỏ lọc Thiếu hồ sơ'), 'the active issue filter remains visible while utilities are closed');
    await click(namedButton('Bỏ lọc Thiếu hồ sơ'));
    assert.equal(table().querySelectorAll('tbody tr').length, 40);
    assert.equal(namedButton('Khối').textContent.trim(), 'Khối 9');
    assert.equal(namedButton('Lớp').textContent.trim(), '9A', 'clearing only the issue filter preserves the selected grade and class');
    assert.equal(body.querySelector('[aria-label="Số học sinh đang hiển thị"]').textContent.trim(), '40 học sinh');
    assert.equal(namedButton('Bỏ lọc Thiếu hồ sơ'), null);
    assert.equal(JSON.parse(windowObject.localStorage.getItem('khl-student-db-prefs-v1')).quickIssueFilter, 'all');

    let profileClosed = 0;
    const renderProfileRequest = (profileOpenRequest, records = students) => act(async () => root.render(React.createElement(Manager, {
      key: 'conversation-profile', students: records, currentSchoolYear: '2026-2027', user: { uid: 'fixture' },
      profileOpenRequest, profileOverlayZIndex: 240, onProfileRequestClose: () => { profileClosed++; }
    })));
    await renderProfileRequest(null);
    await selectFilter('Lớp', ['7A']);
    assert.equal(row('Nguyễn Văn An'), undefined, 'the requested pupil is hidden by the current list filter');
    const requested = { key: 'open-from-mail', studentId: students[0].id, accessCode: students[0].accessCode, schoolCode: students[0].schoolCode || '' };
    await renderProfileRequest(requested);
    const openedProfile = () => body.querySelector('[aria-labelledby="admin-student-profile-title"]');
    assert.match(openedProfile().textContent, /Nguyễn Văn An/);
    assert.equal(openedProfile().style.zIndex, '240', 'the profile appears above the message dialog');
    assert.equal(namedButton('Lớp').textContent.trim(), '7A', 'opening from a conversation preserves list filters');
    await click(namedButton('Đóng hồ sơ'));
    assert.equal(profileClosed, 1);
    await renderProfileRequest(requested, [...students]);
    assert.equal(openedProfile(), null, 'a roster refresh must not reopen an already closed request');
    await renderProfileRequest({ ...requested, key: 'open-again' });
    assert.ok(openedProfile(), 'a fresh double click can reopen the same pupil');
    await click(buttonWithText('Chỉnh sửa hồ sơ'));
    const nameInput = [...openedProfile().querySelectorAll('label')].find(label => label.textContent.startsWith('Họ và tên')).querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(nameInput, 'Bản đang sửa');
      nameInput.dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    await renderProfileRequest({ ...requested, key: 'same-pupil-again' });
    assert.equal(nameInput.value, 'Bản đang sửa', 'reopening the same pupil cannot reset an unfinished profile edit');
    await click(namedButton('Đóng hồ sơ'));

    const learningRequests = [], sentResults = [];
    const requestLearning = value => learningRequests.push(value);
    const sendResult = async student => { sentResults.push(student.id); };
    const renderLearningMail = ready => act(async () => root.render(React.createElement(Manager, { key: 'lazy-learning-mail', students,
      currentSchoolYear: '2026-2027', user: { uid: 'fixture' }, onSendTestResults: sendResult,
      onLearningDataNeeded: requestLearning, learningDataReady: ready })));
    await renderLearningMail(false);
    await click(row('Nguyễn Văn An').querySelector('button[title="Gửi kết quả kiểm tra vào hộp thư học sinh"]'));
    assert.equal(learningRequests.at(-1), true, 'composer asks for results only when needed');
    assert.equal(buttonWithText('Gửi 1 thư').disabled, true, 'unloaded data cannot produce a false no-results message');
    assert.deepEqual(sentResults, []);
    await renderLearningMail(true);
    await click(buttonWithText('Gửi 1 thư'));
    assert.deepEqual(sentResults, ['an']);
    assert.equal(learningRequests.at(-1), false, 'closing composer releases its result feeds');

    // A phone uses the same filtered/selected records in a readable list.
    await act(async () => { windowObject.innerWidth = 390; windowObject.dispatchEvent(new windowObject.Event('resize')); });
    const mobileList = () => body.querySelector('.student-mobile-list');
    assert.equal(body.querySelector('[aria-label="Database học sinh"]'), null);
    assert.equal(mobileList().querySelectorAll('li').length, 3);
    assert.equal(body.querySelector('[aria-label="Tìm nhanh học sinh"]'), null, 'mobile filters start collapsed');
    await click(namedButton('Tìm và lọc học sinh'));
    const selectMobile = async (label, value) => act(async () => {
      const select = body.querySelector(`[aria-label="${label}"]`); select.value = value;
      select.dispatchEvent(new windowObject.Event('change', { bubbles: true }));
    });
    await selectMobile('Lọc khối học sinh', '6');
    assert.equal(mobileList().querySelectorAll('li').length, 2);
    await selectMobile('Lọc lớp học sinh', '6B');
    assert.equal(mobileList().querySelectorAll('li').length, 1);
    await selectMobile('Lọc khối học sinh', '7');
    assert.equal(body.querySelector('[aria-label="Lọc lớp học sinh"]').value, '', 'a new grade clears an incompatible class');
    assert.match(mobileList().textContent, /Trần Văn Chi/);
    await selectMobile('Lọc khối học sinh', '');
    assert.equal(mobileList().querySelectorAll('li').length, 3);
    const quickSearch = body.querySelector('[aria-label="Tìm nhanh học sinh"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(quickSearch, 'le thi binh');
      quickSearch.dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    assert.equal(mobileList().querySelectorAll('li').length, 1);
    assert.match(mobileList().textContent, /Lê Thị Bình/);
    await click(namedButton('Tìm và lọc học sinh'));
    assert.equal(body.querySelector('[aria-label="Tìm nhanh học sinh"]'), null);
    assert.equal(mobileList().querySelectorAll('li').length, 1, 'collapsing search retains the current results');
    await click(namedButton('Tìm và lọc học sinh'));
    await click(body.querySelector('[aria-label="Chọn Lê Thị Bình"]'));
    await click(namedButton('Mở hồ sơ Lê Thị Bình'));
    assert.match(openedProfile().textContent, /Lê Thị Bình/);
    await click(namedButton('Đóng hồ sơ'));
    await click(buttonWithText('Hiển thị'));
    await click(buttonWithText('Tìm kiếm'));
    const mobileSearch = body.querySelector('#student-database-search');
    assert.equal(mobileSearch.querySelector('.student-search-grid').children.length, 4, 'phone search starts with name, code, grade and class');
    assert.ok([...mobileSearch.querySelectorAll('summary')].some(item => item.textContent.includes('Ngày sinh')));
    assert.equal([...mobileSearch.querySelectorAll('summary')].find(item => item.textContent === 'Nơi sinh và địa chỉ').parentElement.open, false);
    await click(namedButton('Đóng tìm kiếm'));
    const detailedTable = [...body.querySelectorAll('label')].find(label => label.textContent.trim() === 'Bảng chi tiết').querySelector('input');
    await click(detailedTable);
    assert.ok(table()); assert.equal(table().querySelectorAll('tbody tr').length, 1);
    assert.equal(table().querySelector('[aria-label="Chọn Lê Thị Bình"]').checked, true, 'switching list/table retains selection and search');
    await act(async () => { windowObject.innerWidth = 1024; windowObject.dispatchEvent(new windowObject.Event('resize')); });
    assert.ok(table()); assert.equal(body.querySelector('[aria-label="Tìm nhanh học sinh"]'), null);
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
