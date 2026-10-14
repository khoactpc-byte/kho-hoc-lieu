import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';

test('profile sections preserve edits, respect read-only access and keep review actions attached to the correct field', async () => {
  const directory = await mkdtemp(resolve('node_modules/.profile-layout-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, localStorage: windowObject.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(directory, 'profile.mjs');
    await build({ stdin: { contents: "export { default as Profile } from './src/components/StudentProfileModal.jsx'; export { default as Changes } from './src/components/ProfileChangeTable.jsx';", resolveDir: resolve('.'), loader: 'js' }, absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
    const { Profile, Changes } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    const submitted = [], approved = [], rejected = [];
    function Harness({ readOnly = false, pending = false }) {
      const [draft, setDraft] = useState({ fullName: 'Nguyễn Văn An', birthProvince: 'TP. Hồ Chí Minh', fatherName: 'Nguyễn Văn Ba', phone: '0900000000', hocLucLop6: 'Khá' });
      const view = {
        activeStudentProfile: { id: 'an', fullName: 'Nguyễn Văn An', accessCode: 'HS001', className: '7A', schoolYear: '2026-2027', portraitUrl: 'https://example.com/an.png' },
        activeStudentIsReadOnly: readOnly, activeStudentReadOnlyReason: 'Hồ sơ chỉ xem', currentSchoolYear: '2026-2027',
        activeStudentPendingProfileRequests: pending ? [{ id: 'request', changes: { phone: '0900000000' } }] : [],
        activeStudentPendingProfileChanges: {}, activeStudentPendingProfileFieldKeys: new Set(['phone']), activeStudentPendingProfileFieldLabels: ['Số điện thoại'],
        derivedProvinceOptions: ['TP. Hồ Chí Minh'], currentWardOptions: [], householdWardOptions: [],
        studentProfileDraft: draft, studentProfileEditableFields: [{ key: 'fullName', label: 'Họ và tên' }, { key: 'phone', label: 'Số điện thoại' }, { key: 'birthProvince', label: 'Tỉnh nơi sinh' }, { key: 'fatherName', label: 'Tên cha' }, { key: 'hocLucLop6', label: 'Học lực lớp 6', type: 'select', options: ['Tốt', 'Khá', 'Đạt'] }],
        handleStudentProfileFieldChange: (key, value) => setDraft(current => ({ ...current, [key]: value })),
        STUDENT_PROFILE_IMAGE_FIELDS: [{ key: 'portraitUrl', label: 'Ảnh thẻ' }], studentProfileDocumentOverrides: {}, studentProfileImagePreviews: {}, studentProfileImages: {}, studentProfileImageAppendModes: {},
        getStudentProfileImageUrl: value => value, getStudentProfileEmbedUrl: () => '', isSubmittingProfileRequest: false,
        submitStudentProfileRequest: () => submitted.push(draft), setShowStudentProfileModal: () => {}
      };
      return React.createElement(Profile, { view });
    }
    root = createRoot(windowObject.document.getElementById('root'));
    await act(async () => root.render(React.createElement(Harness)));
    const body = windowObject.document;
    const click = element => act(async () => element.click());
    const tab = label => [...body.querySelectorAll('[role="tab"]')].find(element => element.textContent.trim() === label);
    const input = label => [...body.querySelectorAll('label')].find(element => element.firstElementChild?.textContent.startsWith(label))?.querySelector('input, select');
    const typeValue = (element, value) => act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    assert.equal(body.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(), 'Thông tin');
    assert.equal(body.querySelectorAll('img, iframe').length, 0);
    assert.ok(input('Số điện thoại').parentElement.textContent.includes('Chờ duyệt'));
    await typeValue(input('Họ và tên'), 'Nguyễn Văn An mới');
    assert.deepEqual([...body.querySelectorAll('[role="tab"]')].map(element => element.textContent.trim()), ['Thông tin', 'Địa chỉ & Gia đình', 'Học tập & Giấy tờ']);
    assert.equal(body.querySelector('[role="tabpanel"][aria-labelledby$="-tab-identity"] table[aria-label="Quá trình học tại trung tâm"]').querySelectorAll('tbody tr').length, 6);
    await click(tab('Địa chỉ & Gia đình'));
    await typeValue(input('Tên cha'), 'Nguyễn Văn Bốn');
    assert.equal(input('Tỉnh nơi sinh').value, 'TP. Hồ Chí Minh');
    await click(tab('Học tập & Giấy tờ'));
    assert.equal(input('Học lực lớp 6').value, 'Khá');
    assert.equal(body.querySelector('img').getAttribute('src'), 'https://example.com/an.png');
    await click(tab('Thông tin'));
    assert.equal(input('Họ và tên').value, 'Nguyễn Văn An mới');
    assert.equal(body.querySelectorAll('img, iframe').length, 0);
    await act(async () => tab('Thông tin').dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    assert.equal(body.activeElement, tab('Địa chỉ & Gia đình'));
    assert.equal(tab('Địa chỉ & Gia đình').getAttribute('aria-selected'), 'true');
    assert.equal(body.querySelector('table[aria-label="Quá trình học tại trung tâm"]'), null, 'history only appears in the information section');
    await click([...body.querySelectorAll('button')].find(element => element.textContent.trim() === 'Gửi yêu cầu sửa'));
    assert.equal(submitted[0].fullName, 'Nguyễn Văn An mới');
    assert.equal(submitted[0].fatherName, 'Nguyễn Văn Bốn');

    await act(async () => root.render(React.createElement(Harness, { key: 'pending', pending: true })));
    assert.match(body.body.textContent, /đang chờ quản trị viên duyệt/);
    assert.doesNotMatch(body.body.textContent, /có thể sửa lại hoặc bổ sung|Cập nhật yêu cầu chờ duyệt/);
    assert.equal(input('Họ và tên').disabled, true);
    const pendingButton = [...body.querySelectorAll('button')].find(element => element.textContent.trim() === 'Đang chờ duyệt');
    assert.equal(pendingButton.disabled, true);
    await click(pendingButton);
    assert.equal(submitted.length, 1);
    await click(tab('Học tập & Giấy tờ'));
    assert.equal(body.querySelector('input[type="file"]').disabled, true);

    await act(async () => root.render(React.createElement(Harness, { key: 'read-only', readOnly: true })));
    assert.equal(input('Họ và tên').disabled, true);
    assert.equal([...body.querySelectorAll('button')].find(element => element.textContent.trim() === 'Chỉ xem hồ sơ').disabled, true);
    await click(tab('Học tập & Giấy tờ'));
    assert.equal(body.querySelector('input[type="file"]').disabled, true);

    const rows = [
      { key: 'phone', label: 'Số điện thoại', currentValue: '0900000001', nextValue: '0900000002' },
      { key: 'portraitUrl', label: 'Ảnh thẻ', currentValue: 'https://drive.google.com/file/d/old-photo-id/view', nextValue: 'https://drive.google.com/file/d/new-photo-id/view,https://drive.google.com/file/d/another-page-id/view', isDocument: true }
    ];
    const renderChanges = disabled => act(async () => root.render(React.createElement(Changes, { rows, disabled, onApprove: key => approved.push(key), onReject: key => rejected.push(key) })));
    await renderChanges(false);
    assert.equal(body.querySelectorAll('tbody tr').length, 2);
    assert.ok(body.querySelector('tbody tr').textContent.includes('0900000001'));
    assert.ok(body.querySelector('tbody tr').textContent.includes('0900000002'));
    assert.equal(body.querySelectorAll('tbody tr:last-child a').length, 3, 'both existing and new document pages remain accessible');
    await click(body.querySelector('button[aria-label="Duyệt Số điện thoại"]'));
    await click(body.querySelector('button[aria-label="Từ chối Ảnh thẻ"]'));
    assert.deepEqual(approved, ['phone']);
    assert.deepEqual(rejected, ['portraitUrl']);
    assert.equal(body.querySelectorAll('button').length, 4, 'each field has one approval and one rejection action');
    assert.doesNotMatch(body.querySelector('tbody tr').textContent, /Tự dọn file cũ/);
    assert.match(body.querySelector('tbody tr:last-child').textContent, /Tự dọn file cũ/);
    assert.match(body.querySelector('button[aria-label="Duyệt Ảnh thẻ"]').title, /tự dọn file cũ sau khi đồng bộ/);
    await click(body.querySelector('button[aria-label="Duyệt Ảnh thẻ"]'));
    assert.deepEqual(approved, ['phone', 'portraitUrl']);
    await renderChanges(true);
    await click(body.querySelector('button[aria-label="Duyệt Số điện thoại"]'));
    await click(body.querySelector('button[aria-label="Duyệt Ảnh thẻ"]'));
    assert.deepEqual(approved, ['phone', 'portraitUrl'], 'review and automatic cleanup remain disabled while a save is in progress');
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
