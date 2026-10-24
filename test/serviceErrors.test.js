import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeServiceErrorMessage, postAppsScript } from '../src/utils/helpers.js';

test('Sheet connection errors are not reported as missing PDF or Gemini permissions', () => {
  const raw = 'Không xác thực được phiên Admin với máy chủ chính. Kiểm tra cấu hình và quyền UrlFetchApp.';
  assert.equal(normalizeServiceErrorMessage(raw, 'registrationAdminAction'), raw);
  assert.equal(normalizeServiceErrorMessage('UrlFetchApp.fetch: service unavailable', 'registrationAdminAction'), 'UrlFetchApp.fetch: service unavailable');
  for (const error of ['403 Forbidden', 'SpreadsheetApp quota exceeded', '429 RESOURCE_EXHAUSTED']) {
    assert.equal(normalizeServiceErrorMessage(error, 'registrationAdminAction'), error);
  }
});

test('confirmed Google permission errors identify the service that actually failed', () => {
  const sheet = normalizeServiceErrorMessage('You do not have permission to call SpreadsheetApp.openById. Required permissions: https://www.googleapis.com/auth/spreadsheets', 'registrationAdminAction');
  assert.match(sheet, /quyền truy cập Google Sheet/);
  assert.doesNotMatch(sheet, /PDF|Gemini/);
  const fetch = normalizeServiceErrorMessage('You do not have permission to call UrlFetchApp.fetch.', 'registrationAdminAction');
  assert.match(fetch, /quyền kết nối dịch vụ bên ngoài/);
  assert.doesNotMatch(fetch, /PDF|Gemini/);
  assert.match(normalizeServiceErrorMessage('Authorization is required: DriveApp.createFile', 'createSystemBackup'), /quyền truy cập Google Drive/);
  assert.match(normalizeServiceErrorMessage('quota exceeded', 'generate'), /Gemini/);
});

test('Apps Script failures retain registration context through the POST client', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ status: 'error', message: '403 Forbidden' }) });
    await assert.rejects(postAppsScript({ action: 'registrationAdminAction', registrationAction: 'syncStudent' }), error => error.message === '403 Forbidden');
  } finally { globalThis.fetch = originalFetch; }
});

test('an older login server reports a login upgrade instead of an export error', async () => {
  const raw = 'Apps Script da nhan request nhung khong dung action hoac thieu base64. version=2026-10-24-weekly-essay-v13, action=loginAccount';
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ status: 'error', message: raw }) });
    await assert.rejects(postAppsScript({ action: 'loginAccount', username: 'fixture', password: 'fixture-only' }), error => {
      assert.match(error.message, /đăng nhập/);
      assert.match(error.message, /Code.gs.*Apps Script chính.*code_hoclieu.gs/);
      assert.doesNotMatch(error.message, /thao tác xuất|base64|fixture-only/);
      return true;
    });
    assert.match(normalizeServiceErrorMessage(raw, 'upload'), /thao tác xuất/);
  } finally { globalThis.fetch = originalFetch; }
});
