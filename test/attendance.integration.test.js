import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('attendance saving preserves other students, rejects stale cells and never acknowledges a failed commit', async () => {
  const directory = await mkdtemp(resolve('node_modules/.attendance-test-'));
  let stored = { records: { a: { studentId: 'a', status: 'CP' }, b: { studentId: 'b', status: 'KP' } } };
  let rejectCommit = false;
  let settings = {};
  const backend = {
    async runTransaction(_db, callback) {
      const writes = [];
      const result = await callback({ get: async ref => ({ data: () => structuredClone(ref === 'global' ? settings : stored) }),
        set: (_ref, payload, options) => writes.push([payload, options]) });
      if (rejectCommit) { rejectCommit = false; throw new Error('connection failed'); }
      for (const [payload, { mergeFields }] of writes) {
        for (const field of mergeFields) {
          if (Array.isArray(field)) stored.records[field[1]] = payload.records[field[1]];
          else stored[field] = payload[field];
        }
      }
      return result;
    }
  };
  globalThis.__attendanceBackend = backend;
  try {
    const outfile = join(directory, 'service.mjs');
    await build({ entryPoints: ['src/services/attendance.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-attendance', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const doc=(...args)=>args.at(-1); export class FieldPath { constructor(...parts){return parts;} }; export const runTransaction=globalThis.__attendanceBackend.runTransaction;'
          : 'export const db={};export const auth={}; export const appId="offline";', loader: 'js' }));
      } }] });
    const { saveAttendanceEntry } = await import(pathToFileURL(outfile));
    const context = { documentId: 'attendance', schoolYear: '2026-2027', schoolCode: 'NAN', className: '6A', date: '2026-10-03', authorId: 'teacher' };
    const originalA = stored.records.a;
    await saveAttendanceEntry({ ...context, student: { id: 'b', fullName: 'B' }, status: '', expectedEntry: stored.records.b });
    // A stale view of another student does not send that cell back to the server.
    await saveAttendanceEntry({ ...context, student: { id: 'a', fullName: 'A' }, status: 'KP', expectedEntry: originalA });
    assert.equal(stored.records.b.status, ''); assert.equal(stored.records.a.status, 'KP');
    await assert.rejects(saveAttendanceEntry({ ...context, student: { id: 'a' }, status: '', expectedEntry: originalA }), /vừa được người khác sửa/);
    const latest = structuredClone(stored.records.a);
    rejectCommit = true;
    await assert.rejects(saveAttendanceEntry({ ...context, student: { id: 'a' }, status: '', expectedEntry: latest }), /connection/);
    assert.deepEqual(stored.records.a, latest);
    await assert.rejects(saveAttendanceEntry({ ...context, schoolCode: 'TQK', student: { id: 'a' }, status: '', expectedEntry: latest }), /cơ sở khác/);
    // FieldPath treats dots in a student's document ID literally.
    await saveAttendanceEntry({ ...context, student: { id: 'student.with.dot' }, status: 'CP' });
    assert.equal(stored.records['student.with.dot'].status, 'CP');
    settings = { inputYearLocks: { '2026-2027': true } };
    await assert.rejects(saveAttendanceEntry({ ...context, student: { id: 'new' }, status: 'CP' }), /khóa nhập liệu/);
    assert.equal(stored.records.new, undefined);
  } finally { delete globalThis.__attendanceBackend; await rm(directory, { recursive: true, force: true }); }
});
