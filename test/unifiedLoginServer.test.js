import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { normalizeLoginUsername, isStudentUsername } from '../src/utils/loginAccount.js';

function server() {
  const cache = new Map(), props = new Map([['APP_TEACHER_PASSWORD_PEPPER', 'fixture-pepper'], ['APP_ADMIN_PASSWORD', 'fixture-admin'], ['APP_THD_PASSWORD', 'fixture-thd']]);
  const accounts = [], audit = [];
  let uuid = 0, admin = false, locks = 0;
  const sheet = { getLastRow: () => accounts.length, appendRow: row => accounts.push([...row]), getRange: (row, col, count = 1, width = 1) => ({
    getValues: () => accounts.slice(row - 1, row - 1 + count).map(value => value.slice(col - 1, col - 1 + width)),
    setValues: values => values.forEach((value, index) => { accounts[row - 1 + index] = [...value]; })
  }) };
  const context = vm.createContext({
    ContentService: { createTextOutput: value => ({ value, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) || '', setProperty: (key, value) => props.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { locks++; }, releaseLock: () => { locks--; } }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => name === 'Student_Accounts' && accounts.length ? sheet : null, insertSheet: () => sheet }), flush() {} },
    Utilities: { getUuid: () => `fixture-${++uuid}`, Charset: { UTF_8: 'utf8' }, newBlob: value => ({ getBytes: () => Buffer.from(value) }),
      computeHmacSha256Signature: (value, key) => [...createHmac('sha256', Buffer.from(key)).update(Buffer.from(value)).digest()] }
  });
  vm.runInContext(readFileSync('apps-script/code_hoclieu.gs', 'utf8'), context);
  context.requireAdminSession_ = () => { if (!admin) throw new Error('admin required'); };
  context.appendAuditLog_ = (...args) => audit.push(args);
  return { s: context, accounts, audit, cache, admin: value => { admin = value; }, locks: () => locks };
}

test('one username namespace preserves HS codes, numeric student input and staff routing', () => {
  assert.equal(normalizeLoginUsername(' hs00123 '), 'HS00123');
  assert.equal(normalizeLoginUsername('00123'), 'HS00123');
  assert.equal(normalizeLoginUsername(' Khoa '), 'khoa');
  assert.equal(isStudentUsername('HS01'), false);
  const { s } = server();
  s.createTeacherAccountSession_ = data => ({ teacher: data.username });
  assert.equal(s.handleAccountLogin_({ username: 'khoa', password: 'fixture-teacher', role: 'admin' }).teacher, 'khoa');
  assert.equal(JSON.parse(s.handleAccountLogin_({ username: 'addmin', password: 'fixture-admin' }).value).role, 'admin');
  assert.equal(JSON.parse(s.handleAccountLogin_({ username: 'THD', password: 'fixture-thd' }).value).role, 'thd');
  assert.throws(() => s.handleAccountLogin_({ username: 'addmin', password: 'wrong' }), /khong chinh xac/);
});

test('students require the default password at the server, with rate limiting and no worksheet writes', () => {
  const { s, accounts } = server();
  assert.throws(() => s.verifyStudentAccountPassword_('HS00123'), /không đúng/);
  assert.throws(() => s.verifyStudentAccountPassword_('HS00123', 'wrong'), /không đúng/);
  assert.equal(s.verifyStudentAccountPassword_('HS00123', '111111'), 0);
  assert.equal(accounts.length, 0);
  for (let index = 0; index < 7; index++) assert.throws(() => s.verifyStudentAccountPassword_('HS00123', 'wrong'), /không đúng/);
  assert.throws(() => s.verifyStudentAccountPassword_('HS00123', '111111'), /quá nhiều lần/);
});

test('only admin can reset a password; hashes persist, sessions are invalidated and audit omits secrets', () => {
  const { s, accounts, audit, cache, admin, locks } = server();
  assert.throws(() => s.setStudentAccountPassword_({ accessCode: 'HS00123', newPassword: 'fixture-new' }), /admin required/);
  assert.equal(accounts.length, 0);
  admin(true);
  assert.throws(() => s.setStudentAccountPassword_({ accessCode: 'HS00123', newPassword: '123' }), /6 đến 256/);
  assert.equal(s.verifyStudentAccountPassword_('HS00123', '111111'), 0);
  cache.set('student-session:old', JSON.stringify({ accessCode: 'HS00123', expiresAt: Date.now() + 60000 }));
  s.setStudentAccountPassword_({ accessCode: 'HS00123', newPassword: 'fixture-new', adminSessionToken: 'fixture-session' });
  assert.equal(accounts.length, 2);
  assert.equal(accounts[1][3], 1);
  assert.notEqual(accounts[1][2], 'fixture-new');
  assert.throws(() => s.verifyStudentAccountPassword_('HS00123', '111111'), /không đúng/);
  assert.equal(s.verifyStudentAccountPassword_('HS00123', 'fixture-new'), 1);
  assert.throws(() => s.requireStudentSession_({ studentSessionToken: 'old' }), /Mật khẩu đã/);
  const result = s.storeStudentSession_({ accessCode: 'HS00123', accountVersion: 1 });
  const token = JSON.parse(result.value).studentSessionToken;
  assert.equal(s.requireStudentSession_({ studentSessionToken: token }).accountVersion, 1);
  s.setStudentAccountPassword_({ accessCode: 'HS00123', newPassword: 'fixture-next' });
  assert.equal(accounts[1][3], 2);
  assert.equal(accounts.length, 2);
  assert.throws(() => s.requireStudentSession_({ studentSessionToken: token }), /Mật khẩu đã/);
  assert.equal(JSON.stringify(audit).includes('fixture-new'), false);
  assert.equal(JSON.stringify(audit).includes(accounts[1][2]), false);
  assert.equal(locks(), 0);
});

test('both legacy and scoped student session creation reject a missing or incorrect password', () => {
  const { s } = server();
  s.requireIdentityBridge_ = () => {};
  assert.throws(() => s.createStudentSession_({ accessCode: 'HS00123' }), /không đúng/);
  assert.throws(() => s.createVerifiedStudentSession_({ student: { id: 'fixture', accessCode: 'HS00123' }, password: 'wrong' }), /không đúng/);
  const session = JSON.parse(s.createVerifiedStudentSession_({ student: { id: 'fixture', accessCode: 'HS00123' }, password: '111111' }).value);
  assert.equal(session.studentProfile.accountVersion, 0);
});

test('the application routes only verified server roles and does not probe each password against multiple roles', async () => {
  const source = readFileSync('src/App.jsx', 'utf8');
  const start = source.indexOf('  const handleLogin = async () => {');
  const expression = source.slice(start, source.indexOf('\n  const handleLogout', start)).trim().replace(/^const handleLogin = /, '').replace(/;$/, '');
  for (const role of ['admin', 'thd', 'teacher', 'invalid']) {
    const state = {}, requests = [];
    const values = new Map();
    const context = { modalMode: 'unified', passwordInput: 'fixture-only', teacherUsername: ' Khoa ',
      normalizeLoginUsername, isStudentUsername, loginSequenceRef: { current: 0 }, activeLoginRequestRef: { current: null }, loginAbortRef: { current: null },
      SCOPED_AUTH_ENABLED: false, ADMIN_SERVER_SESSION_STORAGE_KEY: 'admin', STAFF_SERVER_SESSION_STORAGE_KEY: 'staff', TEACHER_PROFILE_STORAGE_KEY: 'profile',
      window: { sessionStorage: { setItem: (key, value) => values.set(key, value) }, location: { pathname: '/', search: '' }, history: { replaceState() {} } },
      postAppsScript: async payload => { requests.push(payload); return { status: 'success', role, adminSessionToken: 'fixture-admin', staffSessionToken: 'fixture-staff', teacherProfile: { fullName: 'Mẫu', grades: ['7'] } }; },
      setDoc: async () => {}, doc: () => ({}), db: {}, appId: 'fixture', deleteField: () => ({}),
      writeStoredAdminSession() {}, openNoticeHome() {}, showNotification() {},
      setRole: value => { state.role = value; }, setAdminAccessScope: value => { state.scope = value; }, setErrorMsg: value => { state.error = value; }
    };
    for (const name of ['setIsLoggingIn', 'setAdminSessionToken', 'setAdminModule', 'setIsAdmin', 'setLoginRole', 'setAdminSettingsInitialPanel', 'setShowAdminSettingsWorkspace', 'setShowPasswordModal', 'setTeacherProfile', 'setIsTextbookExpanded', 'setSelectedGrade', 'setSelectedSubject', 'setSelectedLesson', 'setPasswordInput']) context[name] = value => { state[name] = value; };
    const login = Function(...Object.keys(context), `return (${expression});`)(...Object.values(context));
    await login();
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { action: 'loginAccount', username: 'khoa', password: 'fixture-only' });
    if (role === 'invalid') { assert.equal(state.role, undefined); assert.match(state.error, /máy chủ/i); }
    else {
      assert.equal(state.role, role === 'teacher' ? 'teacher' : 'admin');
      if (role === 'thd') assert.equal(state.scope, 'thd');
      assert.equal(state.setShowPasswordModal, false);
    }
    assert.equal(context.activeLoginRequestRef.current, null);
  }
});

test('legacy-mode student login forwards the password and refuses an older passwordless server before loading a profile', async () => {
  const source = readFileSync('src/App.jsx', 'utf8');
  const start = source.indexOf('  const handleStudentCodeLogin = async');
  const expression = source.slice(start, source.indexOf('\n  const applyStudentProfileImageFile', start)).trim().replace(/^const handleStudentCodeLogin = /, '').replace(/;$/, '');
  for (const upgraded of [false, true]) {
    const state = {}, requests = [];
    const context = { normalizeLoginUsername, isStudentUsername, loginSequenceRef: { current: 0 }, activeLoginRequestRef: { current: null }, loginAbortRef: { current: null },
      SCOPED_AUTH_ENABLED: false, STUDENT_SESSION_KEY: 'fixture-student', passwordInput: 'fixture-only', currentSchoolYear: '2026-2027',
      window: { sessionStorage: { setItem: () => { state.stored = true; } } },
      postAppsScript: async payload => { requests.push(payload); return { studentSessionToken: 'fixture-session', studentProfile: { schoolYear: '2026-2027', ...(upgraded ? { accountVersion: 0 } : {}) } }; },
      getDocsFromServer: async () => { state.loaded = true; return { docs: [{ id: 'fixture', data: () => ({ accessCode: 'HS00123', schoolYear: '2026-2027' }) }] }; },
      db: {}, appId: 'fixture', query: () => ({}), collection: () => ({}), where: () => ({}),
      setIsLoggingIn() {}, setErrorMsg: value => { state.error = value; }, showNotification() {}, setPasswordInput() {}, openStudentArea: value => { state.student = value; } };
    const login = Function(...Object.keys(context), `return (${expression});`)(...Object.values(context));
    await login({ username: '00123', password: 'fixture-only' });
    assert.equal(requests[0].accessCode, 'HS00123'); assert.equal(requests[0].password, 'fixture-only');
    if (upgraded) { assert.equal(state.student.id, 'fixture'); assert.equal(state.stored, true); }
    else { assert.match(state.error, /chưa bật mật khẩu/); assert.equal(state.loaded, undefined); assert.equal(state.stored, undefined); }
  }
});
