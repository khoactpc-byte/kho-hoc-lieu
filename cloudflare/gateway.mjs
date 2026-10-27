// Transitional API bridge. Business logic, authorization and background jobs stay
// on the existing backend. Never place credentials or student records in this file.
const UPSTREAM = 'https://phocaptmt.netlify.app';
const LIMITS = Object.freeze({ identity: 12000, session: 12000, 'remember-login': 12000, quiz: 800000, data: 800000,
  system: 800000, 'lesson-sync': 1800000, 'essay-work': 12000 });
const json = (status, data, headers = {}) => new Response(JSON.stringify(data), { status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers } });

async function readBody(request, max) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max)) throw Object.assign(new Error('body_limit'), { status: 413 });
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw Object.assign(new Error('body_limit'), { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { body.set(part, offset); offset += part.byteLength; }
  return body;
}

export function createGateway(fetchImpl = fetch, timeoutMs = 55000) {
  return { async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/.site/health' && request.method === 'GET') return json(200, {
      status: 'web-ready', frontend: 'cloudflare-pages', backend: 'existing-netlify-services',
      dataMode: 'existing-cloud-data', build: '2026-10-24-live' });
    if (!url.pathname.startsWith('/.netlify/')) {
      if (url.pathname.startsWith('/.site/') || url.pathname === '/_worker.js') return json(404, { error: 'Không tìm thấy.' });
      return env.ASSETS.fetch(request);
    }
    const match = url.pathname.match(/^\/\.netlify\/functions\/([a-z-]+)$/);
    const endpoint = match?.[1];
    if (!Object.hasOwn(LIMITS, endpoint || '') || url.search) return json(404, { error: 'Không tìm thấy.' });
    if (request.method !== 'POST') return json(405, { error: 'Chỉ nhận POST.' }, { Allow: 'POST' });
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json(403, { error: 'Yêu cầu không cùng địa chỉ web.' });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return json(415, { error: 'Chỉ nhận dữ liệu JSON.' });
    let body;
    try { body = await readBody(request, LIMITS[endpoint]); }
    catch (error) { return json(error.status || 400, { error: error.status === 413 ? 'Yêu cầu quá lớn.' : 'Chưa đọc được yêu cầu.' }); }
    const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
    const authorization = request.headers.get('authorization');
    if (authorization) headers.set('Authorization', authorization);
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
    const cancel = () => abort.abort();
    request.signal.addEventListener('abort', cancel, { once: true });
    try {
      if (request.signal.aborted) abort.abort();
      // Exactly one attempt. Retrying a timed-out save can duplicate an action.
      const response = await fetchImpl(`${UPSTREAM}/.netlify/functions/${endpoint}`, {
        method: 'POST', headers, body, redirect: 'manual', signal: abort.signal,
        cf: { cacheTtl: 0, cacheEverything: false } });
      if (response.status >= 300 && response.status < 400 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel(); return json(502, { error: 'Máy chủ chưa phản hồi đúng. Giữ bản nháp để kiểm tra lại.' });
      }
      return new Response(response.body, { status: response.status, headers: {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' } });
    } catch {
      return json(abort.signal.aborted ? 504 : 502, { error: 'Chưa xác nhận được kết quả. Giữ bản nháp và kiểm tra trạng thái trước khi thử lại.' });
    } finally {
      clearTimeout(timer); request.signal.removeEventListener('abort', cancel);
    }
  } };
}
export default createGateway();
