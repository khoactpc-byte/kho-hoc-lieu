import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../cloudflare/gateway.mjs';
const origin = 'https://tthtcdtrungmytay.pages.dev';
const req = (path = 'essay-work', options = {}) => new Request(`${origin}/.netlify/functions/${path}`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', origin, ...options.headers }, body: '{}', ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'headers')) });
test('static requests bypass backend; health reports the actual transitional architecture', async () => {
  const worker = createGateway(() => { throw new Error('Unexpected backend read'); });
  let count = 0; const env = { ASSETS: { fetch: () => { count++; return new Response('asset'); } } };
  assert.equal(await (await worker.fetch(new Request(origin + '/assets/a.js'), env)).text(), 'asset');
  const health = await (await worker.fetch(new Request(origin + '/.site/health'), env)).json();
  assert.equal(health.backend, 'existing-netlify-services'); assert.equal(health.dataMode, 'existing-cloud-data'); assert.equal(count, 1);
});
test('only named public endpoints accept same-origin JSON POST; never proxy internal jobs, URL arguments or cookies', async () => {
  let count = 0;
  const worker = createGateway(() => { count++; throw new Error('Unexpected network'); });
  for (const path of ['essay-ai-background', 'essay-ai-scheduled', 'lesson-sync-scheduled', 'lesson-migration', 'https://evil.test', 'data/other', 'data?url=https://evil.test']) {
    assert.equal((await worker.fetch(req(path), {})).status, 404, path);
  }
  assert.equal((await worker.fetch(req('data', { method: 'GET', body: undefined }), {})).status, 405);
  assert.equal((await worker.fetch(req('data', { headers: { origin: 'https://evil.test' } }), {})).status, 403);
  assert.equal((await worker.fetch(req('data', { headers: { 'Content-Type': 'text/plain' } }), {})).status, 415);
  assert.equal(count, 0);
});
test('forwards exact auth and body once; retains backend denial and strips caching/cookies/CORS', async () => {
  const calls = [];
  const worker = createGateway(async (url, options) => {
    calls.push({ url, options });
    return new Response('{"error":"Cần đăng nhập"}', { status: 401, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'unsafe=1', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public,max-age=900' } });
  });
  const body = JSON.stringify({ action: 'send', id: 'fake-fixture', staffSessionToken: 'fixture-token' });
  const result = await worker.fetch(req('essay-work', { body, headers: { Authorization: 'Bearer fixture', Cookie: 'private=1', 'X-Essay-Worker': 'forged', 'X-Forwarded-For': 'forged' } }), {});
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://phocaptmt.netlify.app/.netlify/functions/essay-work');
  assert.equal(new TextDecoder().decode(calls[0].options.body), body);
  assert.equal(calls[0].options.headers.get('authorization'), 'Bearer fixture');
  for (const key of ['cookie', 'x-essay-worker', 'x-forwarded-for', 'origin']) assert.equal(calls[0].options.headers.has(key), false);
  assert.equal(calls[0].options.redirect, 'manual'); assert.equal(result.status, 401);
  for (const key of ['set-cookie', 'access-control-allow-origin']) assert.equal(result.headers.has(key), false);
  assert.equal(result.headers.get('cache-control'), 'no-store'); assert.deepEqual(await result.json(), { error: 'Cần đăng nhập' });
});
test('enforces limits on declared and streamed bodies without sending any bytes upstream', async () => {
  let count = 0; const worker = createGateway(() => { count++; throw new Error('Must not send'); });
  assert.equal((await worker.fetch(req('essay-work', { body: 'a'.repeat(12001) }), {})).status, 413);
  assert.equal((await worker.fetch(req('identity', { headers: { 'Content-Length': '12001' } }), {})).status, 413);
  assert.equal(count, 0);
});
test('redirects, non-JSON, network failure and timeout fail closed without replay or secret error text', async () => {
  for (const scenario of ['redirect', 'html', 'error', 'timeout']) {
    let count = 0;
    const worker = createGateway(async (_url, options) => {
      count++;
      if (scenario === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://evil.test' } });
      if (scenario === 'html') return new Response('secret-server-error', { headers: { 'Content-Type': 'text/html' } });
      if (scenario === 'error') throw new Error('secret-server-error');
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('secret-server-error')), { once: true }));
    }, 10);
    const result = await worker.fetch(req(), {});
    assert.equal(result.status, scenario === 'timeout' ? 504 : 502); assert.equal(count, 1);
    assert.equal((await result.text()).includes('secret-server-error'), false);
  }
});
