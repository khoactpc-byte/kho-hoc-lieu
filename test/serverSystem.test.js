import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './helpers/memoryStore.js';
import { createSystemService } from '../netlify/lib/serverSystem.mjs';
import { createGenerationService } from '../netlify/lib/generationMaintenance.mjs';
import { encodeBackupValue, decodeBackupValue } from '../netlify/lib/backupCodec.mjs';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
const prefix = 'artifacts/test/', root = prefix + 'public/data/', actor = { uid: 'admin', role: 'admin' };
function fixture() { const store = memoryStore(); let index = 0; store.put(root + 'settings/global', { schoolYear: '2026-2027', principal: 'Saved' }); return { store, service: createSystemService({ store, appId: 'test', fenceReady: true, uuid: () => `job-${++index}`, now: () => 1000 }) }; }
async function backup(service) {
  const { jobId } = await service.beginBackup(actor); let job;
  do { job = await service.stepBackup(actor, { jobId }); } while (job.status !== 'complete');
  const chunks = []; for (let index = 0; index < job.chunkCount; index++) chunks.push(await service.readBackup(actor, { jobId, index }));
  return { job, chunks, manifest: { version: 3, scope: 'firestore-full-graph', checksums: chunks.map(part => part.checksum) } };
}
async function prepare(service, payload) {
  let result;
  do { result = await service.prepareRestore(actor, payload); }
  while (payload.dryRun ? result.status !== 'validated' : result.status !== 'restoring');
  return result;
}
async function upload(service, snapshot) { const { jobId } = await service.beginRestore(actor, { manifest: snapshot.manifest }); for (let index = 0; index < snapshot.chunks.length; index++) await service.uploadRestoreChunk(actor, { jobId, index, json: snapshot.chunks[index].json }); return jobId; }

test('system statistics aggregate only this app and never create jobs or maintenance locks', async () => {
  const store = memoryStore();
  store.put(root + 'students/a', { fullName: 'An' }); store.put(root + 'students/b', { fullName: 'Bình' });
  store.put(root + 'scorebooks/book', {}); store.put('artifacts/other/public/data/students/c', {});
  const before = store.dump();
  const service = createSystemService({ store, appId: 'test', now: () => 1234 });
  assert.deepEqual(await service.readSummary(actor), { counts: { students: 2, scorebooks: 1, class_attendance: 0 }, readAt: 1234 });
  assert.deepEqual(store.dump(), before);
  await assert.rejects(service.readSummary({ role: 'teacher' }), error => error.status === 403);
  await assert.rejects(service.readSummary({ role: 'student' }), error => error.status === 403);
});

test('large single records restore and roll back atomically across fragmented transport', async () => {
  const { store, service } = fixture();
  const path = root + 'lesson_notes/large'; store.put(path, { content: 'Đề toán 🧮 '.repeat(55000) });
  const saved = await backup(service); assert.ok(saved.chunks.length > 2); assert.ok(saved.chunks.every(part => Buffer.byteLength(part.json) <= 450000));
  const previous = { content: 'Bản mới '.repeat(100000) }; store.put(path, previous);
  const id = await upload(service, saved); await prepare(service, { jobId: id, dryRun: false });
  await service.stepRestore(actor, { jobId: id }); assert.equal(store.get(path).content, 'Đề toán 🧮 '.repeat(55000));
  const result = await service.stepRestore(actor, { jobId: id, rollback: true }); assert.equal(result.status, 'rolledBack'); assert.deepEqual(store.get(path), previous);
});
test('backup codec preserves Firestore types and escapes user maps containing the reserved tag', () => {
  const { store } = fixture();
  const original = { time: new Timestamp(123, 456), point: new GeoPoint(10, 106), bytes: Buffer.from('abc'), zero: 0, nil: null, nan: NaN,
    nested: { __khlBackupType: 'timestamp', seconds: 'ordinary text' } };
  const result = decodeBackupValue(JSON.parse(JSON.stringify(encodeBackupValue(original))), store);
  assert.ok(result.time.isEqual(original.time)); assert.ok(result.point.isEqual(original.point)); assert.deepEqual(result.bytes, original.bytes);
  assert.deepEqual(result.nested, original.nested); assert.ok(Number.isNaN(result.nan)); assert.equal(result.zero, 0);
});
test('mailbox restoration has durable state and retry does not repeat data restoration', async () => {
  const { store, service } = fixture(); const saved = await backup(service);
  const rows = [Array(12).fill('mail')], json = JSON.stringify(rows), checksum = createHash('sha256').update(json).digest('hex');
  const { jobId } = await service.beginRestore(actor, { manifest: saved.manifest, mailboxChecksums: [checksum] });
  for (let index = 0; index < saved.chunks.length; index++) await service.uploadRestoreChunk(actor, { jobId, index, json: saved.chunks[index].json });
  await assert.rejects(prepare(service, { jobId, dryRun: false }), /Thiếu mảnh hộp thư/);
  await service.uploadMailboxChunk(actor, { jobId, index: 0, json }); await prepare(service, { jobId, dryRun: false });
  let job; do { job = await service.stepRestore(actor, { jobId }); } while (job.status !== 'complete');
  let calls = 0;
  const failing = createSystemService({ store, appId: 'test', fenceReady: true, now: () => 1000, restoreMailbox: async () => { calls++; throw new Error('network'); } });
  await assert.rejects(failing.applyMailbox(actor, { jobId }), /network/); assert.equal(store.get(prefix + `server_maintenance_jobs/${jobId}`).mailboxStatus, 'failed');
  const next = createSystemService({ store, appId: 'test', fenceReady: true, now: () => 1000, restoreMailbox: async payload => { calls++; assert.deepEqual(payload.mailboxRows, rows); } });
  await next.applyMailbox(actor, { jobId }); await next.applyMailbox(actor, { jobId }); assert.equal(calls, 2);
  assert.equal(store.get(root + 'settings/global').maintenance, undefined);
});
test('full graph backup and resume restore exceed browser bounds; fence/checkpoint/credentials survive failure', async () => {
  const { store, service } = fixture();
  for (let index = 0; index < 400; index++) store.put(root + `students/student-${String(index).padStart(4, '0')}`, { fullName: `Child ${index}`, note: 'x'.repeat(21000) });
  store.put(root + 'settings/thdTeachingAssignments', { generation: 'g1', chunkCount: 1 });
  store.put(root + 'settings/thdTeachingAssignments/generations/g1/chunks/0', { text: '{}', index: 0, generation: 'g1' });
  store.put(prefix + 'server_quizzes/q1', { serverVersion: 'v1' });
  store.put(prefix + 'server_quiz_attempts/a1', { quizId: 'q1' });
  store.put(prefix + 'server_quiz_slots/slot1', { attemptId: 'a1' });
  store.put(prefix + 'server_sessions/session1', { active: false });
  const saved = await backup(service); assert.ok(saved.job.documentCount > 400); assert.ok(saved.chunks.reduce((sum, p) => sum + Buffer.byteLength(p.json), 0) > 7 * 1024 * 1024);
  const json = saved.chunks.map(p => p.json).join(''); assert.equal(json.includes('server_sessions'), false); assert.ok(json.includes('generations/g1/chunks/0'));
  store.put(root + 'students/phantom', { unwanted: true }); store.put(root + 'settings/global', { schoolYear: '2027-2028', adminPass: 'retained-fixture' });
  const id = await upload(service, saved); const preview = await prepare(service, { jobId: id, dryRun: true }); assert.equal(preview.valid, true); assert.equal(store.get(root + 'settings/global').maintenance, undefined);
  await prepare(service, { jobId: id, dryRun: false }); assert.equal(store.get(root + 'settings/global').maintenance.jobId, id);
  await assert.rejects(service.beginBackup(actor), /bảo trì/);
  store.failCommit = true; await assert.rejects(service.stepRestore(actor, { jobId: id }), /commit failure/); store.failCommit = false;
  assert.equal(store.get(prefix + `server_maintenance_jobs/${id}`).cursor, 0);
  let job; do { job = await service.stepRestore(actor, { jobId: id }); } while (job.status !== 'complete');
  assert.equal(store.get(root + 'students/phantom'), undefined); assert.equal(store.get(root + 'settings/global').principal, 'Saved'); assert.equal(store.get(root + 'settings/global').adminPass, 'retained-fixture'); assert.equal(store.get(root + 'settings/global').maintenance, undefined);
  assert.equal(store.get(prefix + 'server_sessions/session1').active, false);
});
test('partial restoration can roll back; malformed and missing chunks never change live data', async () => {
  const { store, service } = fixture();
  for (let i = 0; i < 80; i++) store.put(root + `students/s${i}`, { fullName: `old-${i}` });
  const saved = await backup(service); store.put(root + 'students/s0', { fullName: 'latest' });
  const id = await upload(service, saved); await prepare(service, { jobId: id, dryRun: false });
  await service.stepRestore(actor, { jobId: id }); assert.equal(store.get(root + 'students/s0').fullName, 'old-0');
  const rolled = await service.stepRestore(actor, { jobId: id, rollback: true }); assert.equal(rolled.status, 'rolledBack'); assert.equal(store.get(root + 'students/s0').fullName, 'latest');
  assert.equal(store.get(root + 'settings/global').maintenance, undefined);
  const { jobId } = await service.beginRestore(actor, { manifest: saved.manifest });
  await assert.rejects(prepare(service, { jobId, dryRun: false }), /Thiếu chặng/);
  await assert.rejects(service.uploadRestoreChunk(actor, { jobId, index: 0, json: '[{"path":"server_sessions/evil","data":{}}]' }), /phạm vi/);
});
test('generation cleanup protects active, young and unknown legacy generations and checks the pointer on every chunk', async () => {
  const store = memoryStore(), parent = root + 'settings/thdTeachingAssignments'; store.put(root + 'settings/global', {}); store.put(parent, { generation: 'active' });
  for (const id of ['active', 'old', 'young']) { store.put(parent + `/generations/${id}`, { createdAt: id === 'young' ? 4000000000 : 1, status: 'published' }); store.put(parent + `/generations/${id}/chunks/0`, { text: '{}' }); }
  store.put(parent + '/generations/unknown/chunks/0', { text: '{}' });
  const service = createGenerationService({ store, appId: 'test', now: () => 4000000100 }); const preview = await service.previewGenerations(actor);
  assert.deepEqual(preview.generations.filter(g => g.eligible).map(g => g.id), ['old']);
  await assert.rejects(service.cleanGeneration(actor, { generation: 'active', expectedActiveGeneration: 'active', dryRun: false }), /đang dùng/);
  await assert.rejects(service.cleanGeneration(actor, { generation: 'old', expectedActiveGeneration: 'stale', dryRun: false }), /vừa thay đổi/);
  const result = await service.cleanGeneration(actor, { generation: 'old', expectedActiveGeneration: 'active', dryRun: false }); assert.equal(result.complete, true); assert.equal(store.get(parent + '/generations/old/chunks/0'), undefined);
});

test('restore validation and planning resume from bounded checkpoints across new service instances', async () => {
  const { store, service } = fixture();
  for (let index = 0; index < 35; index++) store.put(root + `students/s${index}`, { fullName: `saved-${index}` });
  const saved = await backup(service), id = await upload(service, saved);
  assert.equal((await service.prepareRestore(actor, { jobId: id })).status, 'validating');
  await service.prepareRestore(actor, { jobId: id });
  const resumed = createSystemService({ store, appId: 'test', fenceReady: true, now: () => 1000 });
  const preview = await prepare(resumed, { jobId: id, dryRun: true }); assert.equal(preview.documentCount, 36);
  assert.equal(preview.previewUpdateCount, 36); assert.equal(preview.previewCreateCount, 0); assert.equal(preview.previewDeleteCount, 0);
  assert.equal(store.get(root + 'settings/global').maintenance, undefined);
  store.put(root + 'students/extra', { fullName: 'new' });
  store.put(root + 'settings/thdTeachingAssignments/generations/new-orphan/chunks/0', { text: '{}' });
  assert.equal((await resumed.prepareRestore(actor, { jobId: id, dryRun: false })).status, 'planning');
  await resumed.prepareRestore(actor, { jobId: id, dryRun: false });
  store.failCommit = true; const before = store.get(prefix + `server_maintenance_jobs/${id}`);
  await assert.rejects(resumed.prepareRestore(actor, { jobId: id, dryRun: false }), /commit failure/); store.failCommit = false;
  assert.deepEqual(store.get(prefix + `server_maintenance_jobs/${id}`), before);
  const final = await prepare(createSystemService({ store, appId: 'test', fenceReady: true }), { jobId: id, dryRun: false });
  assert.equal(final.deleteCount, 2); assert.equal(store.get(root + 'students/extra').fullName, 'new');
  await service.cancelJob(actor, { jobId: id }); assert.equal(store.get(root + 'settings/global').maintenance, undefined);
  assert.equal((await service.listJobs(actor)).jobs.some(job => Object.hasOwn(job, 'manifest') || Object.hasOwn(job, 'targets')), false);
  await service.completeBackupExport(actor, { jobId: saved.job.jobId, fileId: 'drive-file' });
  assert.equal(store.get(prefix + `server_maintenance_jobs/${saved.job.jobId}`).exportStatus, 'saved');
});

test('malformed fragmented maps, duplicate paths and broken graph links fail before live writes', async () => {
  const { store, service } = fixture(), untouched = store.get(root + 'settings/global');
  for (const rows of [
    [{ path: 'public/data/settings/global', fragment: { encoding: 'base64', index: 0, total: 1, text: Buffer.from('[{"path":"public/data/settings/global","data":[]} ]').toString('base64') } }],
    [{ path: 'public/data/settings/global', data: {} }, { path: 'public/data/settings/global', data: {} }],
    [{ path: 'public/data/settings/global', data: {} }, { path: 'server_quiz_slots/slot', data: { attemptId: 'missing' } }]
  ]) {
    const json = JSON.stringify(rows), checksum = createHash('sha256').update(json).digest('hex');
    const { jobId } = await service.beginRestore(actor, { manifest: { version: 3, scope: 'firestore-full-graph', checksums: [checksum] } });
    await service.uploadRestoreChunk(actor, { jobId, index: 0, json });
    await assert.rejects(prepare(service, { jobId, dryRun: false }), /map dữ liệu|bị lặp|thiếu lượt/);
    assert.deepEqual(store.get(root + 'settings/global'), untouched); await service.cancelJob(actor, { jobId });
  }
});
