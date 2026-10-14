import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps-script/dang-ky-hoc-sinh/code_dangky.gs', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../apps-script/code_hoclieu.gs', import.meta.url), 'utf8');
const url = id => `https://drive.google.com/file/d/${id}/view`;
function fixture() {
  let locked = false;
  const files = new Map(), trashed = [];
  const row = Array(60).fill(''); row[26] = url('new-photo-id'); row[49] = 'HS001';
  const rows = [Array(60).fill(''), row];
  const checkpoint = ['an', 'stable-an', 2, 'job-2', 2, 0, '2026-2027', 'HS001'];
  const book = { getSheetByName: name => name === 'Data' ? { getDataRange: () => ({ getValues: () => rows }) }
    : name === 'STUDENT_SYNC_STATE' ? { getDataRange: () => ({ getValues: () => [[], checkpoint] }) } : null };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => book, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock: () => { locked = true; }, releaseLock: () => { locked = false; } }) },
    DriveApp: { getFileById: id => { assert.equal(locked, true); if (!files.has(id)) throw new Error('missing file'); return files.get(id); } }
  });
  vm.runInContext(source, context);
  context.requireRegistrationAdmin_ = params => { if (params.adminSessionToken !== 'admin') throw new Error('Admin required'); };
  context.jsonp_ = (_callback, value) => value;
  const file = (id, folder = '1AnglegF_ekb6d1Tvtqi8WZjKgZ4l32Xk', mime = 'image/jpeg') => {
    let deleted = false, seen = false;
    const value = { getParents: () => { seen = false; return { hasNext: () => !seen, next: () => { seen = true; return { getId: () => folder }; } }; },
      getMimeType: () => mime, isTrashed: () => deleted,
      setTrashed: value => { assert.equal(locked, true); assert.equal(value, true); trashed.push(id); deleted = value; } };
    files.set(id, value); return value;
  };
  file('new-photo-id'); file('old-photo-id');
  const params = { action: 'trashReplacedStudentFiles', adminSessionToken: 'admin', studentRecordId: 'an', studentKey: 'stable-an', accessCode: 'HS001',
    syncRevision: 2, syncJobId: 'job-2', fieldKey: 'portraitUrl', expectedValue: url('new-photo-id'), fileIds: ['old-photo-id'] };
  const call = patch => JSON.parse(JSON.stringify(context.doPost({ postData: { contents: JSON.stringify({ ...params, ...patch }) } })));
  return { context, file, rows, checkpoint, params, call, trashed, locked: () => locked };
}

test('registration cleanup authenticates, checks synchronization, locks Sheet references and trashes only once', () => {
  const { call, trashed, locked } = fixture();
  assert.equal(call({ adminSessionToken: '' }).success, false);
  assert.deepEqual(trashed, []);
  assert.equal(call().results[0].status, 'trashed');
  assert.equal(call().results[0].status, 'alreadyTrashed');
  assert.deepEqual(trashed, ['old-photo-id']); assert.equal(locked(), false);
});

test('stale revisions, mismatched new files and missing replacements never trash old files', () => {
  for (const patch of [{ syncRevision: 1 }, { syncJobId: 'old-job' }, { studentKey: 'other' }, { accessCode: 'HS999' }, { expectedValue: url('missing-photo-id') }, { fieldKey: 'phone' }]) {
    const { call, trashed } = fixture();
    assert.equal(call(patch).success, false); assert.deepEqual(trashed, []);
  }
  const f = fixture(); f.file('new-photo-id').setTrashed = () => {};
  f.file('new-photo-id', 'outside-folder');
  assert.equal(f.call().success, false); assert.deepEqual(f.trashed, []);
});

test('shared Sheet references and files outside the profile folders are retained; partial Drive failures are reported', () => {
  const f = fixture();
  const other = Array(60).fill(''); other[25] = 'https://drive.google.com/open?id=old-photo-id'; f.rows.push(other);
  assert.equal(f.call().results[0].status, 'retained'); assert.deepEqual(f.trashed, []);
  f.rows.pop(); f.file('old-photo-id', 'outside-folder');
  assert.equal(f.call().results[0].status, 'retained');
  f.file('old-photo-id', '1T28uP92Iuzec0QE6Z5ZAwhsY68_oQdEX', 'application/pdf');
  const result = f.call({ fileIds: ['old-photo-id', 'missing-file-id', 'new-photo-id'] });
  assert.deepEqual(result.results.map(item => item.status), ['trashed', 'failed', 'retained']);
  assert.deepEqual(f.trashed, ['old-photo-id']);
});

test('main proxy accepts cleanup only for an authenticated admin and forwards the action through POST', () => {
  const sent = [];
  const context = vm.createContext({ UrlFetchApp: { fetch: (_url, request) => {
    assert.equal(request.method, 'post'); sent.push(JSON.parse(request.payload));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, results: [] }) };
  } } });
  vm.runInContext(mainSource, context);
  context.requireAdminSession_ = data => { if (data.adminSessionToken !== 'admin') throw new Error('Admin required'); };
  context.getSecurityProperty_ = () => 'https://script.google.com/macros/s/fixture/exec';
  context.json_ = value => value;
  const payload = { registrationAction: 'trashReplacedStudentFiles', params: { fileIds: ['old-photo-id'] } };
  assert.throws(() => context.handleRegistrationAdminAction_(payload), /Admin required/);
  assert.equal(sent.length, 0);
  assert.equal(context.handleRegistrationAdminAction_({ ...payload, adminSessionToken: 'admin' }).status, 'success');
  assert.equal(sent[0].action, 'trashReplacedStudentFiles');
});
