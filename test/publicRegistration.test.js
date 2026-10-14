import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { emptyRegistration, hasNoIdentity, previousGrades, registrationPayload, validateFiles, validateStep } from '../src/features/registration/registrationModel.js';

const config = { currentSchoolYear: '2026-2027', schools: [{ key: 'nguyen-an-ninh', name: 'THCS Nguyễn An Ninh', code: 'NAN', suffix: 'A' }] };
const form = () => ({ ...emptyRegistration(), coSoHoc: 'nguyen-an-ninh', lopHoc: '6A', hoVaTen: 'Nguyễn Văn An', ngaySinh: '2014-01-20', gioiTinh: 'Nam', maDinhDanh: 'học sinh chưa có', soDienThoai: '0900000000',
  birthProvince: 'Tỉnh A', birthDistrict: 'Huyện A', birthWard: 'Xã A', birthRegistrationProvince: 'Tỉnh A', birthRegistrationDistrict: 'Huyện A', birthRegistrationWard: 'Xã A',
  hometownProvince: 'Tỉnh A', hometownDistrict: 'Huyện A', hometownWard: 'Xã A', tinhThanh: 'Tỉnh A', xaPhuong: 'Xã A', tinhThanhHK: 'Tỉnh A', xaPhuongHK: 'Xã A', tinhTrangTamTru: 'Chuẩn bị làm tạm trú', diXe: 'Không' });
const file = { name: 'anh.jpg', type: 'image/jpeg', bytes: 'YWJj' };
const files = () => ({ anhKhaiSinh: [{ ...file }], anhChanDung: [{ ...file }], anhHocBa: [{ ...file }] });
const requestId = 'dk-12345678-1234-4123-8123-123456789012';

test('registration uses the configured year, clears obsolete academic results and validates the chosen campus', () => {
  const values = { ...form(), hocLucLop6: 'Khá', hanhKiemLop6: 'Tốt', hocLucLop8: 'Tốt', tinhTrangHocSinh: '1999-2000' };
  const payload = registrationPayload(values, config);
  assert.equal(payload.tinhTrangHocSinh, '2026-2027');
  assert.equal(payload.hoVaTen, 'NGUYỄN VĂN AN');
  assert.equal(payload.hocLucLop6, undefined);
  assert.deepEqual(previousGrades('9B'), [6, 7, 8]);
  assert.equal(hasNoIdentity(' BÉ CHƯA CÓ '), true);
  assert.equal(hasNoIdentity(' HỌC SINH   CHƯA CÓ '), true);
  assert.equal(registrationPayload({ ...values, maDinhDanh: 'bé chưa có' }, config).maDinhDanh, 'học sinh chưa có');
  assert.deepEqual(validateStep(0, form(), {}, config), {});
  assert.ok(validateStep(0, { ...form(), lopHoc: '6B' }, {}, config).lopHoc);
  assert.ok(validateStep(0, { ...form(), soDienThoai: '12' }, {}, config).soDienThoai);
  assert.ok(validateStep(0, { ...form(), lopHoc: '7A' }, {}, config).hocLucLop6);
  const valid = Object.fromEntries(Object.entries(files()).map(([key, list]) => [key, list.map(item => ({ ...item, size: 3 }))]));
  assert.deepEqual(validateFiles(valid, form()), {});
  assert.ok(validateFiles(valid, { ...form(), maDinhDanh: '123456789012' }).anhCanCuoc);
  assert.ok(validateFiles({ ...valid, anhHocBa: [{ size: 3, type: 'text/html' }] }, form()).anhHocBa);
});

test('secondary entry requires both academic and conduct results for exactly the prior grades at the class selection step', () => {
  for (const [grade, expected] of [[1, []], [5, []], [6, []], [7, [6]], [8, [6, 7]], [9, [6, 7, 8]], [10, []]]) {
    assert.deepEqual(previousGrades(`${grade}A`), expected);
    const input = { ...form(), lopHoc: `${grade}A` };
    const academicErrors = Object.keys(validateStep(0, input, {}, config)).filter(key => /^(hocLucLop|hanhKiemLop)/.test(key));
    assert.deepEqual(academicErrors.sort(), expected.flatMap(previous => [`hocLucLop${previous}`, `hanhKiemLop${previous}`]).sort());
    expected.forEach(previous => { input[`hocLucLop${previous}`] = 'Khá'; input[`hanhKiemLop${previous}`] = 'Tốt'; });
    assert.equal(Object.keys(validateStep(0, input, {}, config)).some(key => /^(hocLucLop|hanhKiemLop)/.test(key)), false);
  }
  assert.match(validateStep(0, { ...form(), lopHoc: '7A', hocLucLop6: 'không hợp lệ', hanhKiemLop6: 'Tốt' }, {}, config).hocLucLop6, /lớp 6/);
});

function server() {
  const rows = [Array.from({ length: 57 }, (_, index) => index === 56 ? '2026-2027' : `C${index}`)];
  let year = '2026-2027', locked = false, uploads = 0, changeDuringUpload = false;
  const sheet = {
    getLastRow: () => rows.length, getLastColumn: () => Math.max(...rows.map(row => row.length)),
    getRange(row, column, height = 1, width = 1) {
      return {
        getValues: () => Array.from({ length: height }, (_, offset) => Array.from({ length: width }, (_, col) => rows[row + offset - 1]?.[column + col - 1] ?? '')),
        getValue: () => rows[row - 1]?.[column - 1] ?? '',
        setValue(value) { assert.equal(locked, true); rows[row - 1][column - 1] = value; }
      };
    },
    appendRow(row) { assert.equal(locked, true); rows.push(row); }
  };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'CURRENT_SCHOOL_YEAR' ? year : '' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ value, setMimeType() { return this; } }) },
    Utilities: { getUuid: randomUUID, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_kind, text) => [...createHash('sha256').update(text).digest()],
      base64Decode: text => [...Buffer.from(text, 'base64')], newBlob: (_bytes, mime) => ({ getContentType: () => mime }) },
    LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { locked = false; } }) },
    DriveApp: { getFolderById: () => ({}) }
  });
  vm.runInContext(readFileSync(new URL('../apps-script/dang-ky-hoc-sinh/code_dangky.gs', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../apps-script/dang-ky-hoc-sinh/PublicRegistration.gs', import.meta.url), 'utf8'), context);
  context.getBirthPlaceProvince = () => ({ success: true, districts: ['Huyện A'], communesByDistrict: { 'Tỉnh A|||Huyện A': ['Xã A'] } });
  context.getRegistrationCommunes = () => ({ success: true, items: ['Xã A'] });
  context.getProvinces = () => ['Tỉnh A'];
  context.validateRegistrationBirthPlace_ = input => ({ success: true, location: { birthProvince: input.birthProvince, birthDistrict: input.birthDistrict, birthWard: input.birthWard } });
  context.ensureExtraHeaders_ = context.writeRegistrationSchoolMeta_ = context.writeSchoolYearClass_ = () => {};
  context.getSchoolYearHistoryColumn_ = () => 57;
  context.hasExistingIdentity_ = () => false;
  const realUploads = { saveFiles_: context.saveFiles_, saveHocBaFiles_: context.saveHocBaFiles_ };
  context.saveFiles_ = context.saveHocBaFiles_ = () => { uploads++; if (changeDuringUpload) year = '2027-2028'; return 'https://drive.google.com/file/d/fixture/view'; };
  return { context, rows, sheet, realUploads, setYear: value => { year = value; }, changeDuringUpload: () => { changeDuringUpload = true; }, uploads: () => uploads, locked: () => locked };
}
const post = (subject, input) => JSON.parse(subject.context.doPost({ postData: { contents: JSON.stringify(input) } }).value);

test('HTML-service entry applies the public validations, normalizes legacy dates and reuses the receipt on retry', () => {
  const subject = server();
  const legacy = { ...form(), ngaySinh: '20/01/2014', tinhTrangHocSinh: '2026-2027' };
  for (const [input, attached] of [
    [{ ...legacy, soNha: '=IMPORTDATA("https://example.test")' }, files()],
    [legacy, { ...files(), anhChanDung: [] }],
    [{ ...legacy, ngaySinh: '31/02/2014' }, files()],
    [legacy, { ...files(), anhHocBa: [{ ...file, type: 'text/html' }] }]
  ]) assert.equal(subject.context.processForm(input, attached, requestId).success, false);
  assert.equal(subject.uploads(), 0);
  const first = subject.context.processForm(legacy, files(), requestId);
  assert.equal(first.success, true, first.message);
  const uploads = subject.uploads();
  subject.setYear('2027-2028');
  const retry = subject.context.processForm(legacy, files(), requestId);
  assert.equal(retry.replayed, true); assert.equal(retry.receipt, first.receipt);
  assert.equal(subject.uploads(), uploads); assert.equal(subject.rows.length, 2);
  assert.equal(subject.rows[1][2], '2014-01-20');
  assert.equal(subject.context.processForm({ ...legacy, hoVaTen: 'Người khác' }, files(), requestId).success, false);
});

test('malformed public payloads are rejected before hashing or reading Google services', () => {
  const subject = server();
  subject.context.Utilities.computeDigest = () => { throw new Error('unexpected hashing'); };
  for (const bad of [
    { form: { ...form(), nested: { enormous: [] } }, files: files() },
    { form: form(), files: { ...files(), anhHocBa: Array(21).fill(file) } },
    { form: form(), files: { ...files(), anhChanDung: [{ ...file, bytes: 'YW=J' }] } }
  ]) {
    const result = post(subject, { action: 'submitRegistration', requestId, ...bad });
    assert.equal(result.success, false); assert.doesNotMatch(result.message, /unexpected hashing/);
  }
  assert.equal(subject.rows.length, 1);
});

function actualUploads(subject, onCreate = () => {}) {
  const created = [];
  Object.assign(subject.context, subject.realUploads);
  subject.context.DriveApp = { getFolderById: () => ({ createFile: () => {
    const saved = { trashed: false, getId: () => `file-${created.length}`, getUrl: () => `https://drive.google.com/file/d/file-${created.length}/view`,
      setName() { return this; }, setTrashed(value) { this.trashed = value; } };
    created.push(saved); onCreate(saved, created.length); return saved;
  } }) };
  return created;
}

test('failed or superseded registration uploads trash only newly created files, while uncertain Sheet writes preserve their files', () => {
  const input = { action: 'submitRegistration', requestId, form: form(), files: files() };
  for (const mode of ['name-error', 'changed-year', 'uncertain-append', 'committed']) {
    const subject = server();
    const created = actualUploads(subject, (saved, index) => {
      if (mode === 'name-error' && index === 2) saved.setName = () => { throw new Error('Drive naming error'); };
      if (mode === 'changed-year') subject.setYear('2027-2028');
    });
    if (mode === 'uncertain-append') subject.sheet.appendRow = row => { subject.rows.push(row); throw new Error('response lost after append'); };
    const result = post(subject, input);
    assert.equal(result.success, mode === 'committed', mode);
    assert.ok(created.length > 0);
    assert.ok(created.every(saved => saved.trashed === ['name-error', 'changed-year'].includes(mode)), mode);
    assert.equal(subject.locked(), false);
  }
  const subject = server();
  assert.equal(post(subject, input).success, true);
  const winner = subject.rows.pop();
  const created = actualUploads(subject, (_saved, index) => { if (index === 1) subject.rows.push(winner); });
  const replay = post(subject, input);
  assert.equal(replay.replayed, true); assert.equal(subject.rows.length, 2);
  assert.ok(created.every(saved => saved.trashed), 'the losing upload leaves no duplicate files');
  assert.equal(subject.rows[1][26], winner[26], 'the committed receipt still refers to its original files');
});

test('server rejects a grade 8 registration missing either prior result and saves both prior grades in the existing Sheet columns', () => {
  const subject = server();
  const input = { ...form(), lopHoc: '8A', hocLucLop6: 'Khá', hanhKiemLop6: 'Tốt', hocLucLop7: 'Tốt', hanhKiemLop7: 'Khá' };
  for (const key of ['hocLucLop6', 'hanhKiemLop6', 'hocLucLop7', 'hanhKiemLop7']) {
    const incomplete = { ...input }; delete incomplete[key];
    const result = post(subject, { action: 'submitRegistration', form: incomplete, files: files(), requestId });
    assert.equal(result.success, false, key); assert.match(result.message, /kết quả học tập và rèn luyện/);
  }
  assert.equal(subject.uploads(), 0); assert.equal(subject.rows.length, 1);
  assert.equal(post(subject, { action: 'submitRegistration', form: input, files: files(), requestId }).success, true);
  assert.deepEqual(Array.from(subject.rows[1].slice(28, 32)), ['Khá', 'Tốt', 'Tốt', 'Khá']);
});

test('public POST auto-saves the admin year and commits retry identity with the original Sheet columns', () => {
  const subject = server();
  const payload = { action: 'submitRegistration', form: form(), files: files(), requestId };
  const first = post(subject, payload);
  assert.equal(first.success, true); assert.equal(first.schoolYear, '2026-2027');
  assert.equal(subject.rows.length, 2);
  assert.equal(subject.rows[1][7], '2026-2027');
  assert.equal(subject.rows[1][4], 'học sinh chưa có');
  assert.equal(subject.rows[1][52], '2026-2027');
  assert.equal(subject.rows[1][56], '6A');
  assert.equal(subject.rows[1][57], requestId);
  const uploads = subject.uploads();
  subject.setYear('2027-2028');
  const replay = post(subject, payload);
  assert.equal(replay.success, true); assert.equal(replay.replayed, true); assert.equal(replay.schoolYear, '2026-2027');
  assert.equal(subject.uploads(), uploads); assert.equal(subject.rows.length, 2);
  const mismatch = post(subject, { ...payload, form: { ...payload.form, hoVaTen: 'Học sinh khác' } });
  assert.equal(mismatch.success, false); assert.match(mismatch.message, /hồ sơ khác/);
  assert.equal(subject.locked(), false);
});

test('public registration requires CCCD images for a numeric identity and accepts the new no-identity wording', () => {
  const subject = server();
  const payload = { action: 'submitRegistration', form: { ...form(), maDinhDanh: '123456789012' }, files: files(), requestId };
  assert.equal(post(subject, payload).success, false, 'numeric identity without CCCD files is rejected');
  assert.equal(subject.uploads(), 0);
  assert.equal(subject.rows.length, 1);
  const accepted = post(subject, { ...payload, files: { ...files(), anhCanCuoc: [{ ...file }] } });
  assert.equal(accepted.success, true);
  assert.equal(subject.rows.length, 2);
  assert.equal(subject.context.normalizeIdentityInput_(' HỌC SINH CHƯA CÓ '), 'học sinh chưa có');
  assert.equal(subject.context.normalizeIdentityInput_('bé chưa có'), 'học sinh chưa có', 'legacy inputs remain compatible without being emitted by new forms');
});

test('public POST rejects malformed files, wrong addresses, stale years and admin actions before adding a row', () => {
  const subject = server();
  const payload = { action: 'submitRegistration', form: form(), files: files(), requestId };
  for (const bad of [
    { ...payload, requestId: 'invalid' },
    { ...payload, form: { ...form(), lopHoc: '6B' } },
    { ...payload, form: { ...form(), birthWard: 'Xã khác' } },
    { ...payload, form: { ...form(), tinhTrangHocSinh: '2025-2026' } },
    { ...payload, files: { ...files(), anhHocBa: [{ ...file, type: 'text/html' }] } },
    { ...payload, files: { ...files(), anhHocBa: [{ ...file, bytes: 'YW=J' }] } },
    { ...payload, files: { ...files(), anhChanDung: [] } },
    { action: 'deleteRegistration', params: {} }
  ]) assert.equal(post(subject, bad).success, false);
  assert.equal(subject.uploads(), 0); assert.equal(subject.rows.length, 1);
  subject.changeDuringUpload();
  const stale = post(subject, payload);
  assert.equal(stale.success, false); assert.match(stale.message, /Năm học vừa thay đổi/);
  assert.equal(subject.rows.length, 1); assert.equal(subject.locked(), false);
});
