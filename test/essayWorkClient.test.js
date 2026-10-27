import test from 'node:test';
import assert from 'node:assert/strict';
import { requestEssayWork } from '../src/services/essayWork.js';

const sessionStorage = { getItem: () => '' };
const request = (response, action = 'file') => requestEssayWork(action, { id: 'test' }, { sessionStorage, fetchImpl: async () => response });

test('essay client distinguishes an HTML fallback, missing file API, expired login and denied scope', async () => {
  await assert.rejects(request(new Response('<!doctype html><title>Vite</title>')), { code: 'invalid_api_response' });
  await assert.rejects(request(Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 })), { code: 'backend_update_required', status: 400 });
  await assert.rejects(request(Response.json({ error: 'old session' }, { status: 401 })), error => error.status === 401 && /đăng nhập lại/.test(error.message));
  await assert.rejects(request(Response.json({ error: 'Không được phân công bài tự luận này.' }, { status: 403 })), error => error.status === 403 && /phân công/.test(error.message));
  await assert.rejects(request(Response.json({ error: 'Thao tác không hợp lệ.' }, { status: 400 }), 'queue'), error => !error.code && error.message === 'Thao tác không hợp lệ.');
});

test('essay client preserves cancellation, explains network errors and keeps successful queue results', async () => {
  await assert.rejects(requestEssayWork('file', {}, { sessionStorage, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /Kiểm tra mạng/);
  const cancel = new AbortController();
  await assert.rejects(requestEssayWork('file', {}, { sessionStorage, signal: cancel.signal, fetchImpl: async (_url, options) => {
    cancel.abort(); assert.equal(options.signal.aborted, true); throw new DOMException('Aborted', 'AbortError');
  } }), { name: 'AbortError' });
  assert.deepEqual(await request(Response.json({ status: 'queued', message: 'Đã xếp hàng' }), 'queue'), { status: 'queued', message: 'Đã xếp hàng' });
});

test('only file reads use the dedicated read-only API; grading still uses essay-work',async()=>{
  const urls=[];const fetchImpl=async url=>{urls.push(url);return Response.json({status:'success'});};
  await requestEssayWork('file',{}, {sessionStorage,fetchImpl});await requestEssayWork('queue',{}, {sessionStorage,fetchImpl});
  assert.deepEqual(urls,['/.netlify/functions/essay-file','/.netlify/functions/essay-work']);
});
