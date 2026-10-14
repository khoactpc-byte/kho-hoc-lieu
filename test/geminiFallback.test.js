import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, postAppsScript } from '../src/utils/helpers.js';
import { requestWithGeminiFallback } from '../src/services/geminiFallback.js';

test('client and server use supported model IDs and omit the retired 2.0 models', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../apps-script/code_hoclieu.gs', import.meta.url), 'utf8'), context);
  assert.deepEqual(new Set(GEMINI_MODELS.map(model => model.id)), new Set(context.APPKHOBAI_ALLOWED_GEMINI_MODELS));
  assert.ok(GEMINI_MODELS.some(model => model.id === DEFAULT_GEMINI_MODEL));
  assert.ok(GEMINI_MODELS.every(model => !model.id.startsWith('gemini-2.0-')));
});

test('new server exhaustion makes one request while old servers can fall back, prefer the saved model and remember the actual server model', async () => {
  const calls = [];
  await assert.rejects(requestWithGeminiFallback(async model => {
    calls.push(model); throw Object.assign(new Error('429 quota exceeded'), { aiFallbackExhausted: true });
  }), /Gemini/);
  assert.equal(calls.length, 1);
  calls.length = 0;
  let remembered;
  const result = await requestWithGeminiFallback(async model => {
    calls.push(model);
    if (calls.length === 1) throw new Error('404 model not found');
    return { text: 'Kết quả', model: 'gemini-3.8-flash' };
  }, { preferredModel: 'gemini-2.5-pro', onWorkingModel: model => { remembered = model; } });
  assert.equal(calls[0], 'gemini-2.5-pro'); assert.equal(calls[1], DEFAULT_GEMINI_MODEL);
  assert.equal(result.modelId, 'gemini-3.8-flash'); assert.equal(remembered, result.modelId);
  calls.length = 0;
  await assert.rejects(requestWithGeminiFallback(async model => { calls.push(model); throw new Error('Phiên đã hết hạn'); }, { preferredModel: 'gemini-2.0-flash' }), /hết hạn/);
  assert.deepEqual(calls, [DEFAULT_GEMINI_MODEL]);
});

test('POST client preserves the server exhaustion marker and non-AI quota errors', async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ status: 'error', message: '429 quota exceeded', aiFallbackExhausted: true }) });
    await assert.rejects(postAppsScript({ action: 'gemini' }), error => error.aiFallbackExhausted === true && /Gemini/.test(error.message));
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ status: 'error', message: 'SpreadsheetApp quota exceeded' }) });
    await assert.rejects(postAppsScript({ action: 'createSystemBackup' }), error => error.message === 'SpreadsheetApp quota exceeded');
  } finally { globalThis.fetch = previousFetch; }
});
