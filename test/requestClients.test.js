import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { requestJsonp } from '../src/services/jsonpClient.js';
import { postAppsScript } from '../src/utils/helpers.js';

test('public JSONP cleans callbacks and scripts after success, timeout, cancellation and append failure', async () => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.test' });
  const { window } = dom;
  const { document } = window;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  const callbackKeys = () => Object.keys(window).filter(key => key.startsWith('__khlJsonp_'));
  try {
    const success = requestJsonp('https://example.test/addresses', { province: 'Đà Nẵng' });
    const url = new URL(document.querySelector('script').src);
    assert.equal(url.searchParams.get('province'), 'Đà Nẵng');
    window[url.searchParams.get('callback')]({ items: ['Huế'] });
    assert.deepEqual(await success, { items: ['Huế'] });
    assert.equal(document.querySelector('script'), null); assert.deepEqual(callbackKeys(), []);
    await assert.rejects(requestJsonp('https://example.test', {}, { timeoutMs: 1 }), /chưa phản hồi/);
    const controller = new AbortController();
    const cancelled = requestJsonp('https://example.test', {}, { signal: controller.signal });
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    document.body.appendChild = () => { throw new Error('cannot append'); };
    await assert.rejects(requestJsonp('https://example.test'), /cannot append/);
    assert.deepEqual(callbackKeys(), []);
  } finally { dom.window.close(); delete globalThis.window; delete globalThis.document; }
});

test('Apps Script client propagates cancellation, bounds response-body waits and rejects HTML authentication responses', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls += 1;
      return { ok: true, text: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) };
    };
    await assert.rejects(postAppsScript({ action: 'read' }, { timeoutMs: 5 }), /có thể đã được xử lý/);
    const controller = new AbortController();
    const pending = postAppsScript({ action: 'read' }, { signal: controller.signal });
    await Promise.resolve(); controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    const alreadyAborted = new AbortController(); alreadyAborted.abort();
    await assert.rejects(postAppsScript({}, { signal: alreadyAborted.signal }), { name: 'AbortError' });
    assert.equal(calls, 2, 'client never retries uncertain writes automatically');
    globalThis.fetch = async () => ({ ok: true, text: async () => '<html>Login required</html>' });
    await assert.rejects(postAppsScript({}), /Mật khẩu chưa được xác minh/);
    globalThis.fetch = async () => ({ ok: true, text: async () => '{"status":"error","message":"Denied"}' });
    await assert.rejects(postAppsScript({}), /Denied/);
  } finally { globalThis.fetch = originalFetch; }
});
