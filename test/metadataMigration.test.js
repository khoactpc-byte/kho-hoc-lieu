import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './helpers/memoryStore.js';
import { createMetadataMigrationService } from '../netlify/lib/metadataMigration.mjs';
const root = 'artifacts/test/public/data/', admin = { uid: 'admin', role: 'admin' };
test('legacy metadata preview is read only; migration freezes the score key and queues Sheet sync with CAS', async () => {
  const store = memoryStore(), service = createMetadataMigrationService({ store, appId: 'test' });
  store.put(root + 'students/a', { fullName: 'An', schoolYear: '2026/2027', schoolCode: 'NAN', className: '6A', accessCode: 'HS001' });
  store.put(root + 'students/b', { schoolYear: '2026-2027', className: '6A', accessCode: 'HS002' });
  const preview = await service.previewMetadata(admin), row = preview.results.find(item => item.id === 'a');
  assert.equal(store.commits, 0); assert.equal(preview.results.find(item => item.id === 'b').eligible, false);
  assert.equal(row.patch.studentKey, 'HS001'); assert.equal(row.patch.schoolYear, '2026-2027');
  await service.applyMetadata(admin, { id: 'a', expectedChecksum: row.checksum });
  assert.equal(store.get(root + 'students/a').studentKey, 'HS001');
  assert.equal(store.get(root + 'student_sync_jobs/' + store.get(root + 'students/a').sheetSync.jobId).status, 'pending');
  await assert.rejects(service.applyMetadata(admin, { id: 'a', expectedChecksum: row.checksum }), /vừa thay đổi/);
  await assert.rejects(service.previewMetadata({ role: 'teacher' }), /Chỉ admin/);
  store.put(root + 'students/c', { schoolYear: '2026-2027', schoolCode: 'NAN', className: '6B', accessCode: 'HS001' });
  const next = (await service.previewMetadata(admin)).results.find(item => item.id === 'c');
  await assert.rejects(service.applyMetadata(admin, { id: 'c', expectedChecksum: next.checksum }), /trùng mã/);
});

test('old material publication requires explicit content review and rejects answer fields and unknown campuses', async () => {
  const store = memoryStore(), service = createMetadataMigrationService({ store, appId: 'test' });
  const material = { schoolYear: '2026-2027', schoolCode: 'TQK', grade: '6', subject: 'Toán', lesson: '1', type: 'pdf', title: 'Đề học sinh', url: 'https://example.test/questions.pdf' };
  store.put(root + 'materials/plain', material); store.put(root + 'materials/answers', { ...material, quizData: { answer: 'SECRET' } });
  store.put(root + 'materials/unknown', { ...material, schoolCode: 'UNKNOWN' });
  const preview = await service.previewMaterials(admin); assert.equal(store.commits, 0);
  assert.equal(preview.results.find(row => row.id === 'answers').eligible, false); assert.equal(preview.results.find(row => row.id === 'unknown').eligible, false);
  const row = preview.results.find(row => row.id === 'plain'); assert.equal(row.eligible, true);
  await assert.rejects(service.applyMaterial(admin, { id: row.id, expectedChecksum: row.checksum }), /xác nhận/);
  await service.applyMaterial(admin, { id: row.id, expectedChecksum: row.checksum, reviewed: true }); assert.equal(store.get(root + 'materials/plain').studentSafe, true);
  await assert.rejects(service.applyMaterial(admin, { id: row.id, expectedChecksum: row.checksum, reviewed: true }), /vừa thay đổi/);
});
