import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './helpers/memoryStore.js';
import { createDataHandler } from '../netlify/functions/data.mjs';
import { verifyApiActor } from '../netlify/lib/apiActor.mjs';
import { issueSessionLease, revokeSessionLease } from '../netlify/lib/sessionLease.mjs';
import { SCOREBOOK_SOURCE_FILE } from '../src/config/scorebookDomain.js';

test('HTTP data API enforces live leases and current staff assignment before trusting payloads', async () => {
  const store = memoryStore(), appId = 'test', root = `artifacts/${appId}/public/data`;
  let current = { role: 'teacher', teacherId: 't1', sessionVersion: 1, schoolCode: 'NAN', subjects: ['Toán'], grades: ['6'] };
  const identity = { ...current, uid: 'teacher', appId };
  const lease = await issueSessionLease({ store, appId, uid: identity.uid, token: 'staff-token', identity, expiresAt: Date.now() + 3600000 }); identity.sessionId = lease.sessionId;
  const context = { store, appId, auth: { verifyIdToken: async token => { if (token !== 'firebase-token') throw new Error('invalid'); return identity; } } };
  const handler = createDataHandler({ context: () => context, verifyActor: (ctx, event, body) => verifyApiActor(ctx, event, body, { verifyStaff: async () => current }) });
  const event = body => ({ httpMethod: 'POST', headers: { authorization: 'Bearer firebase-token' }, body: JSON.stringify(body) });
  const metadata = { schoolYear: '2026-2027', schoolCode: 'NAN', grade: '6', sourceFile: SCOREBOOK_SOURCE_FILE };
  const id = `${metadata.schoolYear}_${metadata.sourceFile}_NAN_khoi_6`.replace(/[^\w-]+/g, '_'), key = 'custom:hkiScore:1:uHS001:s0';
  store.put(root + '/settings/global', { schoolYear: metadata.schoolYear }); store.put(root + '/students/s1', { ...metadata, className: '6A', studentKey: 'HS001' });
  store.put(root + `/scorebooks/${id}`, { ...metadata, columnWidths: { sheet: [80] } });
  const payload = { action: 'saveScores', documentId: id, metadata, patch: { [key]: { value: 0, source: { source: 'quiz' } } }, role: 'admin' };
  assert.equal((await handler(event(payload))).statusCode, 200); assert.deepEqual(store.get(root + `/scorebooks/${id}`).columnWidths, { sheet: [80] });
  assert.equal(store.get(root + `/scorebooks/${id}`).scoreSources[key].source, 'manual');
  assert.equal((await store.collection('artifacts/test/server_score_audit').get()).docs.length, 1);
  assert.equal((await handler(event({ ...payload, patch: { 'custom:hkiScore:0:uHS001:s0': { value: 7 } } }))).statusCode, 403);
  current = { ...current, sessionVersion: 2 }; assert.equal((await handler(event(payload))).statusCode, 403);
  current = { ...current, sessionVersion: 1 }; await revokeSessionLease(context, identity); assert.equal((await handler(event(payload))).statusCode, 401);
  for (const body of [null, [], 'bad']) assert.equal((await handler(event(body))).statusCode, 400);
});
