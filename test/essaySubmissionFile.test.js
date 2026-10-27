import test from 'node:test';
import assert from 'node:assert/strict';
import { createEssaySubmissionFileLoader, loadEssaySubmissionFile } from '../src/services/essaySubmissionFile.js';
import { ESSAY_CHUNK_BYTES } from '../src/utils/essayAnnotations.js';
const submission={id:'essay',fileId:'original',submittedAt:123};
test('file reads send their scope and retain a quota-preview notice when revisiting a cached paper',async()=>{
  const seen=[],notices=[];const load=createEssaySubmissionFileLoader({getSessionKey:()=> 'teacher',request:async(_action,p)=>{seen.push(p);return {fileId:p.fileId,offset:0,size:1,mimeType:'image/png',base64:'AA==',readOnlyPreview:true};}});
  const paper={...submission,schoolCode:'NAN',schoolYear:'2026-2027',grade:6,subject:'Toán'};
  const blob=await load(paper,{onNotice:notice=>notices.push(notice)});
  assert.deepEqual(seen[0].scope,{schoolCode:'NAN',schoolYear:'2026-2027',grade:'6',subject:'Toán'});assert.match(notices.at(-1),/Firestore.*hạn mức/);
  notices.length=0;assert.equal(await load(paper,{onNotice:notice=>notices.push(notice)}),blob);assert.match(notices.at(-1),/Firestore/);assert.equal(seen.length,1);
});
test('file preview reconstructs exact bounded chunks and rejects source changes or missing data',async()=>{
  const bytes=Buffer.alloc(ESSAY_CHUNK_BYTES+20,42),requests=[];
  const request=async(action,payload)=>{requests.push(payload);return {fileId:'original',mimeType:'image/png',size:bytes.length,offset:payload.offset,base64:bytes.subarray(payload.offset,payload.offset+ESSAY_CHUNK_BYTES).toString('base64')};};
  const blob=await loadEssaySubmissionFile(submission,{request});
  assert.equal(blob.size,bytes.length);assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);assert.equal(requests.length,2);
  assert.ok(requests.every(p=>p.id==='essay' && p.submittedAt===123));
  await assert.rejects(loadEssaySubmissionFile(submission,{request:async()=>({fileId:'changed'})}),/thay đổi/);
  await assert.rejects(loadEssaySubmissionFile(submission,{request:async()=>({fileId:'original',offset:0,size:10,mimeType:'image/png',base64:'AA=='})}),/Chưa tải đủ/);
  const controller=new AbortController();controller.abort();await assert.rejects(loadEssaySubmissionFile(submission,{request,signal:controller.signal}),{name:'AbortError'});
});

test('parallel chunks stay in file order and revisits share only the same session and revision', async () => {
  const bytes = Buffer.alloc(ESSAY_CHUNK_BYTES * 4 + 10);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(i / ESSAY_CHUNK_BYTES) + 1;
  let calls = 0, active = 0, maximum = 0, session = 'teacher-a', clock = 1;
  const load = createEssaySubmissionFileLoader({ getSessionKey: () => session, now: () => clock, request: async (_action, p) => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, p.offset === ESSAY_CHUNK_BYTES ? 15 : 1)); active--;
    return { fileId: p.fileId, offset: p.offset, size: bytes.length, mimeType: 'image/png', base64: bytes.subarray(p.offset, p.offset + ESSAY_CHUNK_BYTES).toString('base64') };
  } });
  const progress = [];
  const [a, b] = await Promise.all([load(submission, { onProgress: n => progress.push(n) }), load(submission)]);
  assert.equal(a, b); assert.equal(calls, 5); assert.equal(maximum, 3);
  assert.deepEqual(Buffer.from(await a.arrayBuffer()), bytes);
  assert.equal(progress.at(-1), 100); assert.deepEqual([...progress].sort((a, b) => a - b), progress);
  assert.equal(await load(submission), a); assert.equal(calls, 5);
  await load({ ...submission, submittedAt: 124 }); assert.equal(calls, 10);
  session = 'teacher-b'; await load(submission); assert.equal(calls, 15);
  clock += 5 * 60 * 1000 + 1; await load(submission); assert.equal(calls, 20);
});

test('closing one shared viewer does not abort another; a failed download is never cached', async () => {
  let complete, calls = 0, underlying;
  const load = createEssaySubmissionFileLoader({ getSessionKey: () => 'same', request: async (_a, _p, options) => {
    calls++; underlying = options.signal; await new Promise(resolve => { complete = resolve; });
    return { fileId: 'original', offset: 0, size: 1, mimeType: 'image/png', base64: 'AA==' };
  } });
  const controller = new AbortController();
  const first = load(submission, { signal: controller.signal }), second = load(submission);
  controller.abort(); await assert.rejects(first, { name: 'AbortError' }); assert.equal(underlying.aborted, false);
  complete(); assert.equal((await second).size, 1); assert.equal(calls, 1);
  let attempts = 0;
  const retry = createEssaySubmissionFileLoader({ request: async () => { if (++attempts === 1) throw new Error('network'); return { fileId: 'original', offset: 0, size: 1, mimeType: 'image/png', base64: 'AA==' }; } });
  await assert.rejects(retry(submission), /network/); assert.equal((await retry(submission)).size, 1); assert.equal(attempts, 2);
});
