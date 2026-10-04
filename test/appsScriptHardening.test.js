import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const mainSource = readFileSync(new URL('../apps-script/code_hoclieu.gs', import.meta.url), 'utf8');
const registrationSource = readFileSync(new URL('../apps-script/dang-ky-hoc-sinh/code_dangky.gs', import.meta.url), 'utf8');
const output = value => ({ value, setMimeType() { return this; } });
function mainContext() {
  const cache = new Map();
  let counter = 0;
  const context = vm.createContext({
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: output, MimeType: { JSON: 'json' } },
    Utilities: { getUuid: () => `id${++counter}`, base64Decode: data => [...Buffer.from(data, 'base64')] },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) }
  });
  vm.runInContext(mainSource, context);
  return { context, cache };
}

test('both Apps Script sources parse, including their POST endpoints', () => {
  assert.doesNotThrow(() => new vm.Script(mainSource));
  assert.doesNotThrow(() => new vm.Script(registrationSource));
});

test('single mailbox deletion locks ID lookup and reports committed deletion even if audit fails', () => {
  const { context } = mainContext();
  let locked = false, exists = true, deletes = 0;
  context.LockService = { getScriptLock: () => ({ waitLock: () => { locked = true; }, releaseLock: () => { locked = false; } }) };
  context.getStudentMailboxSheet_ = () => ({ getRange: () => ({ getValue: () => 'Thư thử' }), deleteRow: () => { assert.equal(locked, true); exists = false; deletes++; } });
  context.findMailboxRowById_ = () => { assert.equal(locked, true); return exists ? 2 : 0; };
  context.getAuditSheet_ = () => { throw new Error('audit unavailable'); };
  const first = JSON.parse(context.handleDeleteStudentMailboxMessage_({ messageId: 'mail-1' }).value);
  assert.equal(first.status, 'success'); assert.match(first.auditWarning, /Đã xóa thư/); assert.equal(locked, false);
  assert.equal(JSON.parse(context.handleDeleteStudentMailboxMessage_({ messageId: 'mail-1' }).value).alreadyDeleted, true);
  assert.equal(deletes, 1);
  assert.throws(() => context.handleDeleteStudentMailboxMessage_({ messageId: '' }), /Thieu ma/);
});

test('bulk mailbox deletion reports committed rows on a later failure and never writes without a safety backup', () => {
  const { context } = mainContext();
  let locked = false, backup = false;
  const deleted = [];
  context.LockService = { getScriptLock: () => ({ waitLock: () => { locked = true; }, releaseLock: () => { locked = false; } }) };
  context.getStudentMailboxSheet_ = () => ({ getLastRow: () => 4, getRange: () => ({ getValues: () => [['a'], ['b'], ['c']] }),
    deleteRow: number => { assert.equal(locked && backup, true); if (number === 3) throw new Error('Sheet unavailable'); deleted.push(number); } });
  context.createMailboxSafetyBackup_ = () => { backup = true; };
  context.appendAuditLog_ = () => true;
  const result = JSON.parse(context.handleDeleteStudentMailboxMessages_({ mode: 'all' }).value);
  assert.equal(result.deletedCount, 1); assert.equal(result.remainingCount, 2);
  assert.match(result.warning, /chưa hoàn tất/); assert.deepEqual(deleted, [4]); assert.equal(locked, false);
  context.createMailboxSafetyBackup_ = () => { throw new Error('Drive unavailable'); };
  assert.throws(() => context.handleDeleteStudentMailboxMessages_({ mode: 'all' }), /Drive unavailable/);
  assert.deepEqual(deleted, [4]); assert.equal(locked, false);
});

test('mailbox resend locks the original row, filters new readers and writes all recipients in one batch', () => {
  const { context } = mainContext();
  let locked = false, writes = 0, saved;
  const original = ['m1', 1000, '2026-2027', 'all', '', 'Tất cả', 'general', 'Thông báo', 'Nội dung', '', 'HS01', 'Admin'];
  context.LockService = { getScriptLock: () => ({ waitLock: () => { locked = true; }, releaseLock: () => { locked = false; } }) };
  context.findMailboxRowById_ = () => { assert.equal(locked, true); return 2; };
  context.getStudentMailboxSheet_ = () => ({ getLastRow: () => 2, getMaxRows: () => 100,
    getRange: position => ({ getValues: () => [original], setValues: rows => { assert.equal(locked, true); assert.equal(position, 3); writes++; saved = rows; } }) });
  context.getAuditSheet_ = () => { throw new Error('audit unavailable'); };
  const result = JSON.parse(context.handleResendStudentMailboxMessage_({ messageId: 'm1', unreadCodes: [' hs01 ', 'hs02', 'HS02', 'HS03'] }).value);
  assert.equal(result.sentCount, 2); assert.equal(writes, 1); assert.equal(locked, false);
  assert.deepEqual(Array.from(saved, row => row[4]), ['HS02', 'HS03']);
  assert.match(result.auditWarning, /Đã gửi lại/);
  const empty = JSON.parse(context.handleResendStudentMailboxMessage_({ messageId: 'm1', unreadCodes: ['HS01'] }).value);
  assert.equal(empty.sentCount, 0); assert.equal(writes, 1); assert.equal(locked, false);
  context.findMailboxRowById_ = () => 0;
  assert.throws(() => context.handleResendStudentMailboxMessage_({ messageId: 'missing', unreadCodes: ['HS02'] }), /Khong tim thay/);
  assert.equal(writes, 1); assert.equal(locked, false);
});

test('student mailbox authority comes from a server session, not submitted class/code/year', () => {
  const { context, cache } = mainContext();
  const student = { accessCode: 'HS01', className: '6A', schoolYear: '2026-2027' };
  cache.set('student-session:valid', JSON.stringify(student));
  const actual = context.requireStudentSession_({ studentSessionToken: 'valid', accessCode: 'HS02', className: '9B' });
  assert.equal(actual.accessCode, 'HS01');
  assert.equal(context.studentMayReadMailboxRow_(actual, ['', '', '2026-2027', 'student', 'HS02']), false);
  assert.equal(context.studentMayReadMailboxRow_(actual, ['', '', '2026-2027', 'class', '9B']), false);
  assert.equal(context.studentMayReadMailboxRow_(actual, ['', '', '2026-2027', 'class', '6A']), true);
  assert.equal(context.studentMayReadMailboxRow_(actual, ['', '', '2025-2026', 'all', '']), false);
  assert.throws(() => context.requireStudentSession_({ studentSessionToken: 'fake', accessCode: 'HS01' }), /hết hạn/);
});

test('upload permits bind exact file, bytes and student and may only be consumed once', () => {
  const { context, cache } = mainContext();
  cache.set('student-session:student', JSON.stringify({ accessCode: 'HS01' }));
  const data = { studentSessionToken: 'student', folderId: context.APPKHOBAI_STUDENT_SUBMISSION_FOLDER_ID,
    mimeType: 'image/png', filename: 'work.png', bytes: 3, base64: Buffer.from('abc').toString('base64') };
  const permit = JSON.parse(context.createUploadPermit_(data).value).uploadPermit;
  assert.throws(() => context.consumeUploadPermit_({ ...data, filename: 'other.png', uploadPermit: permit }, data.folderId), /không hợp lệ/);
  assert.throws(() => context.consumeUploadPermit_({ ...data, base64: Buffer.from('abcd').toString('base64'), uploadPermit: permit }, data.folderId), /Dung lượng/);
  assert.doesNotThrow(() => context.consumeUploadPermit_({ ...data, uploadPermit: permit }, data.folderId));
  assert.throws(() => context.consumeUploadPermit_({ ...data, uploadPermit: permit }, data.folderId), /đã dùng/);
  assert.throws(() => context.createUploadPermit_({ ...data, mimeType: 'text/html' }), /chỉ nhận/);
  assert.throws(() => context.createUploadPermit_({ ...data, bytes: 21 * 1024 * 1024 }), /20 MB/);
});

test('locked or revised teacher accounts cannot reuse a cached staff session', () => {
  const { context, cache } = mainContext();
  const row = ['teacher1', '', '', 'NAN', '["6"]', '["Toán"]', '', '', true, '', '', 2];
  context.getTeacherAccountsSheet_ = () => ({ getLastRow: () => 2, getRange: () => ({ getValues: () => [row] }) });
  cache.set('staff-session:valid', JSON.stringify({ role: 'teacher', teacherId: 'teacher1', sessionVersion: 2, expiresAt: Date.now() + 3600000 }));
  assert.equal(context.requireStaffSession_({ staffSessionToken: 'valid' }), 'teacher');
  row[8] = false;
  assert.throws(() => context.requireStaffSession_({ staffSessionToken: 'valid' }));
  row[8] = true; row[11] = 3;
  assert.throws(() => context.requireStaffSession_({ staffSessionToken: 'valid' }));
});

test('teacher accounts accept six-character passwords, hash them and keep the existing password on an empty edit', () => {
  const { context, cache } = mainContext();
  const rows = [];
  const hashedInputs = [];
  cache.set('staff-session:admin', 'admin');
  cache.set('staff-session-version:admin', '1');
  cache.set('staff-session-expiry:admin', String(Date.now() + 3600000));
  context.getTeacherAccountsSheet_ = () => ({
    getLastRow: () => rows.length + 1,
    getRange: position => ({ getValues: () => rows, setValues: values => { rows[position - 2] = values[0]; } }),
    appendRow: row => rows.push(row)
  });
  context.hashTeacherPassword_ = (salt, password) => {
    hashedInputs.push({ salt, password });
    return 'hashed-password-' + hashedInputs.length;
  };
  context.appendAuditLog_ = () => {};
  const data = { adminSessionToken: 'admin', username: 'anh', fullName: 'Đặng Thị Ánh', password: '123456', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'] };
  assert.equal(JSON.parse(context.saveTeacherAccount_(data).value).status, 'success');
  assert.equal(rows.length, 1);
  assert.equal(hashedInputs[0].password, '123456');
  assert.equal(rows[0][7], 'hashed-password-1');
  assert.notEqual(rows[0][7], data.password);
  const accountId = rows[0][0], previousSalt = rows[0][6];
  context.saveTeacherAccount_({ ...data, id: accountId, password: '', fullName: 'Đặng Thị Ánh mới' });
  assert.equal(hashedInputs.length, 1);
  assert.equal(rows[0][6], previousSalt);
  assert.equal(rows[0][7], 'hashed-password-1');
  context.saveTeacherAccount_({ ...data, id: accountId });
  assert.equal(rows[0][7], 'hashed-password-2');
  assert.throws(() => context.saveTeacherAccount_({ ...data, username: 'khac', password: '12345' }), /ít nhất 6 ký tự/);
  assert.throws(() => context.saveTeacherAccount_({ ...data, id: accountId, password: '12345' }), /ít nhất 6 ký tự/);
  assert.throws(() => context.saveTeacherAccount_({ ...data, username: 'khac', password: '' }), /ít nhất 6 ký tự/);
  assert.throws(() => context.saveTeacherAccount_({ ...data, adminSessionToken: '' }), /admin/);
  assert.equal(rows.length, 1);
});

test('registration writes reject GET and resolve student identity instead of a stale row number', () => {
  const context = vm.createContext({ ContentService: { createTextOutput: output, MimeType: { JAVASCRIPT: 'js' } } });
  vm.runInContext(registrationSource, context);
  assert.equal(JSON.parse(context.doGet({ parameter: { action: 'deleteRegistration' } }).value).success, false);
  assert.equal(JSON.parse(context.doGet({ parameter: { action: 'listPending', adminSessionToken: 'private-token' } }).value).success, false);
  assert.equal(JSON.parse(context.doGet({ parameter: { action: 'listStudents', adminSessionToken: 'private-token' } }).value).success, false);
  context.findStudentRow_ = (_sheet, params) => params.identityCode === 'correct' ? 8 : 0;
  assert.equal(context.getRegistrationRowNumber_({ getLastRow: () => 10 }, { rowNumber: 3, identityCode: 'correct' }), 8);
  assert.equal(context.getRegistrationRowNumber_({ getLastRow: () => 10 }, { rowNumber: 3 }), 0);
});

test('mailbox restore stops before any write when the mandatory safety backup fails', () => {
  const { context } = mainContext();
  let writes = 0;
  context.getStudentMailboxSheet_ = () => ({ getLastRow: () => 2, getRange: () => ({ getValues: () => [Array(12).fill('old')],
    setValues: () => { writes += 1; }, clearContent: () => { writes += 1; } }) });
  context.createMailboxSafetyBackup_ = () => { throw new Error('Drive backup failed'); };
  assert.throws(() => context.handleRestoreMailboxFromBackup_({ mailboxRows: [] }), /Drive backup failed/);
  assert.equal(writes, 0);
});

test('registration year sync is idempotent, fenced against stale attempts and cannot change an unrelated year', () => {
  const properties = new Map([['CURRENT_SCHOOL_YEAR', '2025-2026']]);
  const context = vm.createContext({
    ContentService: { createTextOutput: output, MimeType: { JAVASCRIPT: 'js' } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key),
      setProperty: (key, value) => properties.set(key, value), setProperties: values => Object.entries(values).forEach(([key, value]) => properties.set(key, value)) }) }
  });
  vm.runInContext(registrationSource, context);
  const first = { sourceSchoolYear: '2025-2026', targetSchoolYear: '2026-2027', sequence: 1, attemptId: 'first' };
  assert.equal(JSON.parse(context.syncCurrentSchoolYear_(first).value).currentSchoolYear, '2026-2027');
  assert.doesNotThrow(() => context.syncCurrentSchoolYear_(first));
  const reverse = { sourceSchoolYear: '2026-2027', targetSchoolYear: '2025-2026', sequence: 2, attemptId: 'second' };
  context.syncCurrentSchoolYear_(reverse);
  assert.throws(() => context.syncCurrentSchoolYear_(first), /đã cũ/);
  assert.equal(properties.get('CURRENT_SCHOOL_YEAR'), '2025-2026');
  assert.throws(() => context.syncCurrentSchoolYear_({ ...reverse, attemptId: 'forged' }), /không hợp lệ/);
  assert.throws(() => context.syncCurrentSchoolYear_({ ...reverse, sourceSchoolYear: '2027-2028', targetSchoolYear: '2028-2029', sequence: 3 }), /đối chiếu/);
  assert.throws(() => context.syncCurrentSchoolYear_({ ...first, targetSchoolYear: '2026-2029', sequence: 3 }), /không hợp lệ/);
  assert.equal(JSON.parse(context.doGet({ parameter: { action: 'syncCurrentSchoolYear' } }).value).success, false);
  const denied = JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ ...first, action: 'syncCurrentSchoolYear' }) } }).value);
  assert.equal(denied.success, false);
  assert.equal(properties.get('CURRENT_SCHOOL_YEAR'), '2025-2026');
});

test('public registration locks append and metadata together and rechecks identity/year after uploading', () => {
  let locked = false;
  let rows = 1;
  let year = '2025-2026';
  let duplicateInsideLock = false;
  let switchYearWhileUploading = false;
  const sheet = { appendRow() { assert.equal(locked, true); rows += 1; }, getLastRow() { assert.equal(locked, true); return rows; } };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush: () => assert.equal(locked, true) },
    LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { locked = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => year }) },
    DriveApp: { getFolderById() { if (switchYearWhileUploading) year = '2026-2027'; return {}; } }
  });
  vm.runInContext(registrationSource, context);
  context.ensureExtraHeaders_ = () => {};
  context.hasExistingIdentity_ = () => locked && duplicateInsideLock;
  context.saveFiles_ = context.saveHocBaFiles_ = () => '';
  context.writeRegistrationSchoolMeta_ = context.writeSchoolYearClass_ = (_sheet, rowNumber) => { assert.equal(locked, true); assert.equal(rowNumber, rows); };
  const form = { coSoHoc: 'nguyen-an-ninh', tinhTrangHocSinh: '2025-2026', lopHoc: '6A', maDinhDanh: '123456789012', hoVaTen: 'An' };
  assert.equal(context.processForm(form, {}).success, true);
  assert.equal(rows, 2);
  assert.equal(locked, false);
  duplicateInsideLock = true;
  assert.match(context.processForm(form, {}).message, /hồ sơ trùng/);
  assert.equal(rows, 2);
  assert.equal(locked, false);
  duplicateInsideLock = false;
  switchYearWhileUploading = true;
  assert.match(context.processForm(form, {}).message, /Năm học vừa thay đổi/);
  assert.equal(rows, 2);
  assert.equal(locked, false);
});

test('student sync rejects older revisions/years and renaming updates the original Sheet row', () => {
  const rows = [Array(8).fill('header'), ['old', 'stable', 2, 'job-2', 8, 1, '2026-2027', 'HS001']];
  const meta = { getDataRange: () => ({ getValues: () => rows }), getLastRow: () => rows.length,
    getRange: position => ({ setValues: values => { rows[position - 1] = values[0]; } }) };
  let updates = 0, appends = 0;
  const sheet = { getParent: () => ({ getSheetByName: () => meta }), appendRow: () => appends++ };
  const context = vm.createContext({ ContentService: { createTextOutput: output, MimeType: { JAVASCRIPT: 'js' } },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) } });
  vm.runInContext(registrationSource, context);
  const params = { studentRecordId: 'old', studentKey: 'stable', syncRevision: 3, syncJobId: 'job-3', schoolYear: '2026-2027', accessCode: 'HS999' };
  assert.throws(() => context.studentSyncGuard_({ ...params, syncRevision: 1 }, sheet), /đã cũ/);
  assert.throws(() => context.studentSyncGuard_({ ...params, schoolYear: '2025-2026' }, sheet), /năm cũ/);
  context.ensureExtraHeaders_ = context.writeRegistrationSchoolMeta_ = context.writeSchoolYearHistory_ = context.writeSchoolYearClass_ = () => {};
  context.buildStudentSheetRow_ = context.buildStudentExtraSheetRow_ = () => [];
  context.findStudentRow_ = (_sheet, data) => data.accessCode === 'HS001' ? 8 : 0;
  context.updateStudentSheetRowSkippingOrigin_ = () => updates++;
  assert.equal(JSON.parse(context.syncStudentToSheet_(params).value).mode, 'updated');
  assert.equal(updates, 1); assert.equal(appends, 0);
  assert.equal(context.studentSyncGuard_(params, sheet).replayed, true);
});

test('staff expiry/revocation and student upload receipts enforce authority', () => {
  const { context, cache } = mainContext();
  const properties = new Map([['STAFF_SESSION_VERSION', '1']]);
  context.PropertiesService = { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) };
  cache.set('staff-session:admin', 'admin'); cache.set('staff-session-version:admin', '1');
  cache.set('staff-session-expiry:admin', String(Date.now() + 3600000));
  assert.equal(context.requireStaffSession_({ staffSessionToken: 'admin' }), 'admin');
  context.revokeStaffSessions_(); assert.throws(() => context.requireStaffSession_({ staffSessionToken: 'admin' }));
  cache.set('staff-session:teacher', JSON.stringify({ role: 'teacher', expiresAt: Date.now() - 1 }));
  assert.equal(context.getTeacherSessionProfile_({ staffSessionToken: 'teacher' }), null);
  cache.set('student-session:expired', JSON.stringify({ accessCode: 'HS001', expiresAt: Date.now() - 1 }));
  assert.throws(() => context.requireStudentSession_({ studentSessionToken: 'expired' }), /hết hạn/);
  context.requireIdentityBridge_ = () => {};
  cache.set('student-upload:receipt', JSON.stringify({ studentId: 'a', accessCode: 'HS001', fileId: 'file' }));
  assert.throws(() => context.verifyStudentUpload_({ uploadReceipt: 'receipt', studentId: 'b', accessCode: 'HS002', fileId: 'file' }), /không thuộc/);
  assert.equal(JSON.parse(context.verifyStudentUpload_({ uploadReceipt: 'receipt', studentId: 'a', accessCode: 'HS001', fileId: 'file' }).value).status, 'success');
});

test('retrying a completed backup export reuses the Drive file for the same job and checksums', () => {
  const { context } = mainContext(); let creates = 0, file;
  context.Utilities.formatDate = () => '20261004'; context.Session = { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' };
  context.MimeType = { PLAIN_TEXT: 'plain' }; context.appendAuditLog_ = () => {};
  context.getStudentMailboxSheet_ = () => ({ getLastRow: () => 1 });
  context.getBackupFolder_ = () => ({ getFilesByName: () => ({ hasNext: () => Boolean(file), next: () => file }), createFile: (name, json) => {
    creates++; file = { getId: () => 'drive-file', getUrl: () => 'https://drive.test/file', getBlob: () => ({ getDataAsString: () => json }) }; return file;
  } });
  const snapshot = { maintenanceJobId: 'job-one', manifest: { checksums: ['checksum'] } };
  assert.equal(JSON.parse(context.handleCreateSystemBackup_({ snapshot }).value).id, 'drive-file');
  assert.equal(JSON.parse(context.handleCreateSystemBackup_({ snapshot }).value).replayed, true); assert.equal(creates, 1);
  assert.throws(() => context.handleCreateSystemBackup_({ snapshot: { ...snapshot, manifest: { checksums: ['different'] } } }), /dữ liệu khác/);
});
