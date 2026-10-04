import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createSystemService } from '../netlify/lib/serverSystem.mjs';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8185';
test('real Firestore emulator preserves typed records and resumes checkpointed backup/restore transactions', { skip: !enabled }, async () => {
  const store = new Firestore({ projectId: 'demo-khl-review', credentials: { client_email: 'emulator@example.test', private_key: 'emulator-only-placeholder' } }), appId = `maintenance-test-${randomUUID()}`;
  const parent = store.doc(`artifacts/${appId}`), root = `${parent.path}/public/data`, actor = { uid: 'fixture-admin', role: 'admin' };
  const service = createSystemService({ store, appId, fenceReady: true });
  try {
    const original = { content: 'Đề toán '.repeat(45000), createdAt: new Timestamp(123, 456) };
    await store.doc(root + '/settings/global').set({ schoolYear: '2026-2027' });
    await store.doc(root + '/lesson_notes/large').set(original);
    const storedTimestamp = (await store.doc(root + '/lesson_notes/large').get()).data().createdAt;
    const backup = await service.beginBackup(actor); let job;
    do { job = await service.stepBackup(actor, backup); } while (job.status !== 'complete');
    const chunks = [];
    for (let index = 0; index < job.chunkCount; index++) chunks.push(await service.readBackup(actor, { ...backup, index }));
    assert.ok(chunks.length > 1);
    await store.doc(root + '/lesson_notes/large').set({ content: 'newer' });
    await store.doc(root + '/students/phantom').set({ fullName: 'Later' });
    const readOnly = createSystemService({ store, appId, fenceReady: false });
    const summary = await readOnly.readSummary(actor);
    assert.deepEqual(summary.counts, { students: 1, scorebooks: 0, class_attendance: 0 });
    assert.equal((await store.doc(root + '/settings/global').get()).data().maintenance, undefined);
    assert.equal((await service.listJobs(actor)).jobs.length, 1, 'statistics must not create a second backup job');
    const restore = await service.beginRestore(actor, { manifest: { version: 3, scope: 'firestore-full-graph', checksums: chunks.map(part => part.checksum) } });
    for (let index = 0; index < chunks.length; index++) await service.uploadRestoreChunk(actor, { ...restore, index, json: chunks[index].json });
    do { job = await service.prepareRestore(actor, { ...restore, dryRun: true }); } while (job.status !== 'validated');
    assert.equal((await store.doc(root + '/settings/global').get()).data().maintenance, undefined);
    do { job = await service.prepareRestore(actor, { ...restore, dryRun: false }); } while (job.status !== 'restoring');
    const resumed = createSystemService({ store, appId, fenceReady: true });
    do { job = await resumed.stepRestore(actor, restore); } while (job.status !== 'complete');
    const restored = (await store.doc(root + '/lesson_notes/large').get()).data();
    assert.equal(restored.content, original.content); assert.ok(restored.createdAt.isEqual(storedTimestamp));
    assert.equal((await store.doc(root + '/students/phantom').get()).exists, false);
    assert.equal((await store.doc(root + '/settings/global').get()).data().maintenance, undefined);
    await resumed.completeBackupExport(actor, { ...backup, fileId: 'fixture-drive-file' });
    assert.equal((await resumed.listJobs(actor)).jobs.find(item => item.id === backup.jobId).exportStatus, 'saved');
  } finally {
    // Exact disposable namespace on the localhost-only demo emulator.
    await store.recursiveDelete(parent); await store.terminate();
  }
});
