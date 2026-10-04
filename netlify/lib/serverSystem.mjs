import { createHash, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { BACKUP_COLLECTIONS } from '../../src/utils/backupManifest.js';
import { documentId, fail } from './dataPolicy.mjs';
import { encodeBackupValue, decodeBackupValue } from './backupCodec.mjs';
import { createRestorePlanner } from './restorePlanner.mjs';

export const PRIVATE_BACKUP_COLLECTIONS = ['server_quizzes', 'server_quiz_attempts', 'server_quiz_slots', 'server_essay_slots', 'server_score_audit'];
export const PUBLIC_BACKUP_COLLECTIONS = [...new Set([...BACKUP_COLLECTIONS, 'student_code_counters', 'student_sync_jobs', 'student_archives', 'settings'])];
const digest = value => createHash('sha256').update(value).digest('hex');
const forbiddenSettings = ['adminPass', 'teacherPass', 'thdAdminPass', 'maintenance'];
const chunkSize = 450000;
const encode = rows => JSON.stringify(rows.map(row => ({ ...row, data: row.data === null ? null : encodeBackupValue(row.data) })));
const progressFields = ['kind', 'status', 'createdAt', 'updatedAt', 'cursor', 'chunkCount', 'documentCount', 'planCount', 'privateCount', 'mailboxStatus', 'exportStatus',
  'validatePhase', 'validateCursor', 'scanCursor', 'planPhase', 'createCount', 'updateCount', 'deleteCount', 'valid', 'writesBlockedDuringRestore',
  'previewCreateCount', 'previewUpdateCount', 'previewDeleteCount', 'previewOnly'];
const progress = (job, id) => ({ jobId: id, ...Object.fromEntries(progressFields.filter(key => Object.hasOwn(job, key)).map(key => [key, job[key]])) });
export function validateBackupPath(path) {
  fail(typeof path === 'string' && path.length <= 1800 && !path.split('/').some(value => !value || ['.', '..', '__proto__', 'constructor', 'prototype'].includes(value)), 400, 'Đường dẫn phục hồi không hợp lệ.');
  const parts = path.split('/');
  const direct = parts.length === 2 && PRIVATE_BACKUP_COLLECTIONS.includes(parts[0]);
  const publicDoc = parts[0] === 'public' && parts[1] === 'data' && PUBLIC_BACKUP_COLLECTIONS.includes(parts[2])
    && (parts.length === 4 || parts[2] === 'settings' && parts[3] === 'thdTeachingAssignments' && (parts.length === 6 && parts[4] === 'chunks' || parts.length === 6 && parts[4] === 'generations' || parts.length === 8 && parts[4] === 'generations' && parts[6] === 'chunks'));
  fail(direct || publicDoc, 400, 'Dữ liệu phục hồi nằm ngoài phạm vi cho phép.');
  return path;
}
export function createSystemService({ store, appId, now = Date.now, uuid = randomUUID, fenceReady = false, restoreMailbox }) {
  const prefix = `artifacts/${appId}/`, settingsRef = store.doc(`${prefix}public/data/settings/global`);
  const jobRef = id => store.doc(`${prefix}server_maintenance_jobs/${documentId(id)}`);
  const partRef = (id, name, index) => store.doc(`${jobRef(id).path}/${name}/${String(index).padStart(8, '0')}`);
  const admin = actor => { fail(actor.role === 'admin', 403, 'Chỉ admin được bảo trì dữ liệu.'); fail(fenceReady, 503, 'Cần triển khai và kiểm chứng Rules khóa ghi trước khi bật bảo trì máy chủ.'); };
  async function readSummary(actor) {
    fail(actor.role === 'admin', 403, 'Chỉ admin được đọc thống kê dữ liệu.');
    const names = ['students', 'scorebooks', 'class_attendance'];
    const counts = await Promise.all(names.map(async name => [name, (await store.collection(`${prefix}public/data/${name}`).count().get()).data().count]));
    return { counts: Object.fromEntries(counts), readAt: now() };
  }
  const checked = (actor, job) => { fail(job && job.owner === actor.uid, 403, 'Công việc không thuộc phiên admin này.'); return job; };
  const fence = (settings, id) => fail(settings?.maintenance?.active && settings.maintenance.jobId === id, 409, 'Khóa bảo trì đã thay đổi. Chưa ghi dữ liệu.');
  const decodeRows = json => JSON.parse(json).map(row => ({ ...row, data: row.data === null ? null : decodeBackupValue(row.data, store) }));
  // Fragment transport strings, not Firestore records. A large document is still restored atomically.
  function transport(rows) {
    const result = [];
    for (const row of rows) {
      const json = encode([row]);
      if (Buffer.byteLength(json) < chunkSize) result.push(row);
      else {
        const pieces = splitText(json);
        pieces.forEach((text, index) => result.push({ path: row.path, fragment: { index, total: pieces.length, encoding: 'base64', text: Buffer.from(text).toString('base64') } }));
      }
    }
    return result;
  }
  function splitText(json) {
    const pieces = []; let piece = '', bytes = 0;
    for (const char of json) { const size = Buffer.byteLength(char); if (bytes + size > 150000) { pieces.push(piece); piece = ''; bytes = 0; } piece += char; bytes += size; }
    if (piece) pieces.push(piece); return pieces;
  }
  const encodeTransport = rows => JSON.stringify(rows.map(row => row.fragment ? row : { ...row, data: encodeBackupValue(row.data) }));
  function splitTransport(rows) {
    const groups = []; let group = [];
    for (const row of transport(rows)) {
      if (group.length >= 70 || Buffer.byteLength(encodeTransport([...group, row])) > chunkSize) { groups.push(group); group = []; }
      group.push(row);
    }
    if (group.length) groups.push(group); return groups;
  }
  async function savePlanPart(id, name, index, rows, tx, metadata = {}) {
    const json = encode(rows), ref = partRef(id, name, index);
    if (Buffer.byteLength(json) <= chunkSize) { if (tx) tx.set(ref, { ...metadata, json, checksum: digest(json) }); else await ref.set({ ...metadata, json, checksum: digest(json) }); return; }
    const pieces = splitText(json);
    fail(pieces.length <= 64, 413, 'Chặng dữ liệu vượt giới hạn giao dịch phục hồi.');
    for (let part = 0; part < pieces.length; part++) {
      const child = ref.collection('pieces').doc(String(part));
      if (tx) tx.set(child, { text: pieces[part] }); else await child.set({ text: pieces[part] });
    }
    if (tx) tx.set(ref, { ...metadata, pieceCount: pieces.length, checksum: digest(json) }); else await ref.set({ ...metadata, pieceCount: pieces.length, checksum: digest(json) });
  }
  async function readPlanPart(id, name, index) {
    const ref = partRef(id, name, index), part = (await ref.get()).data(); if (!part) return null;
    if (part.json !== undefined) return part;
    fail(Number.isInteger(part.pieceCount) && part.pieceCount <= 64, 409, 'Mảnh kế hoạch không hợp lệ.');
    const pieces = [];
    for (let i = 0; i < part.pieceCount; i++) { const piece = (await ref.collection('pieces').doc(String(i)).get()).data(); fail(typeof piece?.text === 'string', 409, 'Thiếu mảnh kế hoạch.'); pieces.push(piece.text); }
    return { json: pieces.join(''), checksum: part.checksum };
  }
  async function targets() {
    const result = [...PUBLIC_BACKUP_COLLECTIONS.map(name => `public/data/${name}`), ...PRIVATE_BACKUP_COLLECTIONS];
    const parent = store.doc(`${prefix}public/data/settings/thdTeachingAssignments`);
    result.push('public/data/settings/thdTeachingAssignments/chunks', 'public/data/settings/thdTeachingAssignments/generations');
    const generations = await parent.collection('generations').listDocuments();
    generations.forEach(ref => result.push(`public/data/settings/thdTeachingAssignments/generations/${ref.id}/chunks`));
    return result;
  }
  async function beginBackup(actor) {
    admin(actor); const id = uuid();
    await store.runTransaction(async tx => {
      const settings = (await tx.get(settingsRef)).data() || {};
      fail(!settings.maintenance?.active, 423, 'Đang có công việc bảo trì. Tiếp tục hoặc hủy công việc đó trước.');
      tx.set(settingsRef, { ...settings, maintenance: { active: true, jobId: id, kind: 'backup', createdAt: now() } });
      tx.set(jobRef(id), { kind: 'backup', owner: actor.uid, status: 'scanning', exportStatus: 'pending', createdAt: now(), cursor: 0, lastId: '', chunkCount: 0, documentCount: 0 });
    });
    try {
      const paths = await targets();
      await jobRef(id).update({ targets: paths });
    } catch (error) { error.jobId = id; throw error; }
    return { jobId: id };
  }
  async function stepBackup(actor, { jobId: id }) {
    admin(actor); let job = checked(actor, (await jobRef(id).get()).data());
    if (job.status === 'complete') return progress(job, id);
    fail(job.status === 'scanning', 409, 'Công việc không ở bước sao lưu.');
    if (!job.targets) { await jobRef(id).update({ targets: await targets() }); job = (await jobRef(id).get()).data(); }
    const path = job.targets[job.cursor];
    let query = store.collection(prefix + path).orderBy(FieldPath.documentId()).limit(70);
    if (job.lastId) query = query.startAfter(job.lastId);
    const page = await query.get();
    const rows = []; let bytes = 0;
    for (const item of page.docs) {
      const data = item.data();
      if (item.ref.path === settingsRef.path) forbiddenSettings.forEach(key => delete data[key]);
      const row = { path: item.ref.path.slice(prefix.length), data }, cost = Buffer.byteLength(encode([row]));
      if (rows.length && bytes + cost > 1500000) break;
      rows.push(row); bytes += cost;
    }
    const groups = splitTransport(rows);
    return store.runTransaction(async tx => {
      const current = checked(actor, (await tx.get(jobRef(id))).data());
      const settings = (await tx.get(settingsRef)).data(); fence(settings, id);
      fail(current.cursor === job.cursor && current.lastId === job.lastId && current.chunkCount === job.chunkCount, 409, 'Có lượt sao lưu khác vừa tiến hành. Thử lại.');
      fail(job.chunkCount + groups.length <= 10000, 413, 'Sao lưu vượt 10.000 mảnh. Hủy công việc và chia phạm vi trước khi xuất.');
      groups.forEach((group, offset) => { const json = encodeTransport(group); tx.set(partRef(id, 'chunks', job.chunkCount + offset), { json, checksum: digest(json) }); });
      const donePage = page.docs.length < 70 && rows.length === page.docs.length, cursor = job.cursor + Number(donePage);
      const complete = cursor >= job.targets.length;
      const next = { ...job, cursor, lastId: donePage ? '' : rows.at(-1).path.split('/').at(-1), chunkCount: job.chunkCount + groups.length,
        documentCount: job.documentCount + rows.length, status: complete ? 'complete' : 'scanning', updatedAt: now() };
      tx.set(jobRef(id), next);
      if (complete) { const nextSettings = { ...settings }; delete nextSettings.maintenance; tx.set(settingsRef, nextSettings); }
      return progress(next, id);
    });
  }
  async function readBackup(actor, { jobId: id, index }) {
    admin(actor); const job = checked(actor, (await jobRef(id).get()).data());
    fail(job.status === 'complete' && job.kind === 'backup' && Number.isInteger(index) && index >= 0 && index < job.chunkCount, 400, 'Chặng sao lưu không hợp lệ.');
    return (await partRef(id, 'chunks', index).get()).data();
  }
  async function beginRestore(actor, { manifest, mailboxChecksums = null }) {
    admin(actor); fail(manifest?.version === 3 && manifest.scope === 'firestore-full-graph' && Array.isArray(manifest.checksums) && manifest.checksums.length > 0 && manifest.checksums.length <= 10000
      && manifest.checksums.every(value => /^[a-f0-9]{64}$/.test(value)), 400, 'Danh mục phục hồi không hợp lệ.');
    fail(mailboxChecksums === null || Array.isArray(mailboxChecksums) && mailboxChecksums.length <= 1000 && mailboxChecksums.every(value => /^[a-f0-9]{64}$/.test(value)), 400, 'Danh mục hộp thư không hợp lệ.');
    const id = uuid();
    // Store only known manifest fields: an arbitrary client manifest cannot fill a job document.
    await jobRef(id).set({ owner: actor.uid, kind: 'restore', status: 'uploading', createdAt: now(), manifest: { version: 3, scope: manifest.scope, checksums: manifest.checksums },
      mailboxChecksums, mailboxStatus: mailboxChecksums === null ? 'notIncluded' : 'pending', cursor: 0, planCount: 0 });
    return { jobId: id };
  }
  async function uploadMailboxChunk(actor, { jobId: id, index, json }) {
    admin(actor); fail(typeof json === 'string' && Buffer.byteLength(json) <= chunkSize && Number.isInteger(index), 413, 'Mảnh hộp thư không hợp lệ.');
    let rows; try { rows = JSON.parse(json); } catch { fail(false, 400, 'JSON hộp thư không hợp lệ.'); }
    fail(Array.isArray(rows) && rows.length <= 70 && rows.every(row => Array.isArray(row) && row.length === 12 && row.every(value => ['string', 'number', 'boolean'].includes(typeof value) || value === null)), 400, 'Dòng hộp thư không hợp lệ.');
    return store.runTransaction(async tx => {
      const job = checked(actor, (await tx.get(jobRef(id))).data());
      fail(['uploading', 'validating'].includes(job.status) && index >= 0 && index < job.mailboxChecksums?.length && digest(json) === job.mailboxChecksums[index], 409, 'Checksum hộp thư không khớp.');
      tx.set(partRef(id, 'mailbox', index), { json, checksum: digest(json) }); return { uploaded: index };
    });
  }
  async function mailboxRows(job, id) {
    const rows = [];
    for (let start = 0; start < (job.mailboxChecksums?.length || 0); start += 8) {
      const parts = await Promise.all(Array.from({ length: Math.min(8, job.mailboxChecksums.length - start) }, (_, offset) => partRef(id, 'mailbox', start + offset).get()));
      for (let offset = 0; offset < parts.length; offset++) {
        const part = parts[offset].data();
        fail(part && digest(part.json) === job.mailboxChecksums[start + offset], 409, 'Thiếu mảnh hộp thư. Chưa phục hồi dữ liệu chính.'); rows.push(...JSON.parse(part.json));
      }
      fail(Buffer.byteLength(JSON.stringify(rows)) <= 7 * 1024 * 1024, 413, 'Hộp thư vượt giới hạn chuyển an toàn sang Apps Script.');
    }
    fail(Buffer.byteLength(JSON.stringify(rows)) <= 7 * 1024 * 1024, 413, 'Hộp thư vượt giới hạn chuyển an toàn sang Apps Script.');
    return rows;
  }
  async function applyMailbox(actor, payload) {
    admin(actor); const id = payload.jobId, job = checked(actor, (await jobRef(id).get()).data());
    fail(job.kind === 'restore' && job.status === 'complete', 409, 'Dữ liệu chính chưa phục hồi xong.');
    if (['complete', 'notIncluded'].includes(job.mailboxStatus)) return { jobId: id, mailboxStatus: job.mailboxStatus, replayed: true };
    fail(typeof restoreMailbox === 'function', 503, 'Chưa cấu hình phục hồi hộp thư.');
    const rows = await mailboxRows(job, id), checksum = digest(JSON.stringify(rows));
    const claimId = uuid();
    const claim = await store.runTransaction(async tx => {
      const current = checked(actor, (await tx.get(jobRef(id))).data());
      if (current.mailboxStatus === 'complete') return false;
      fail(!current.mailboxLeaseUntil || current.mailboxLeaseUntil <= now(), 409, 'Hộp thư đang được phục hồi. Thử lại sau một phút.');
      tx.set(jobRef(id), { ...current, mailboxClaim: claimId, mailboxLeaseUntil: now() + 60000, mailboxStatus: 'running' }); return true;
    });
    if (!claim) return { jobId: id, mailboxStatus: 'complete', replayed: true };
    const finish = status => store.runTransaction(async tx => {
      const current = checked(actor, (await tx.get(jobRef(id))).data());
      if (current.mailboxClaim === claimId) tx.set(jobRef(id), { ...current, mailboxStatus: status, mailboxLeaseUntil: 0, ...(status === 'complete' ? { mailboxFinishedAt: now() } : {}) });
      return current.mailboxClaim === claimId ? status : current.mailboxStatus;
    });
    try {
      await restoreMailbox({ ...payload, mailboxRows: rows, restoreJobId: id, restoreChecksum: checksum });
      const status = await finish('complete');
      fail(status === 'complete', 409, 'Hộp thư đang được đối soát ở lượt khác. Tải lại tiến độ.');
      return { jobId: id, mailboxStatus: status };
    } catch (error) {
      await finish('failed'); throw error;
    }
  }
  async function uploadRestoreChunk(actor, { jobId: id, index, json }) {
    admin(actor); fail(typeof json === 'string' && Buffer.byteLength(json) <= chunkSize && Number.isInteger(index), 413, 'Chặng phục hồi quá lớn hoặc sai số thứ tự.');
    let rows; try { rows = JSON.parse(json); } catch { fail(false, 400, 'JSON phục hồi không hợp lệ.'); }
    fail(Array.isArray(rows) && rows.length <= 70 && rows.every(row => row && (row.data && typeof row.data === 'object' && !Array.isArray(row.data) || row.fragment && Number.isInteger(row.fragment.index) && Number.isInteger(row.fragment.total) && row.fragment.total > 0 && row.fragment.total <= 64 && row.fragment.index >= 0 && row.fragment.index < row.fragment.total && typeof row.fragment.text === 'string')), 400, 'Chặng dữ liệu không hợp lệ.');
    rows.forEach(row => validateBackupPath(row.path));
    return store.runTransaction(async tx => {
      const job = checked(actor, (await tx.get(jobRef(id))).data());
      fail(['uploading', 'validating'].includes(job.status) && index >= 0 && index < job.manifest.checksums.length && digest(json) === job.manifest.checksums[index], 409, 'Checksum hoặc trạng thái tải lên không khớp.');
      tx.set(partRef(id, 'chunks', index), { json, checksum: digest(json) }); return { uploaded: index };
    });
  }
  const planner = createRestorePlanner({ store, prefix, jobRef, partRef, settingsRef, checked, fence, targets,
    readPlanPart, savePlanPart, decodeRows, encode, validateBackupPath, now, chunkSize });
  async function prepareRestore(actor, { jobId: id, dryRun = true }) {
    admin(actor); return progress(await planner.prepare(actor, id, dryRun), id);
  }
  async function stepRestore(actor, { jobId: id, rollback = false }) {
    admin(actor); const job = checked(actor, (await jobRef(id).get()).data());
    if (['complete', 'rolledBack'].includes(job.status)) return progress(job, id);
    fail(['restoring', 'rollingBack'].includes(job.status), 409, 'Chưa có kế hoạch phục hồi.');
    fail(job.status !== 'rollingBack' || rollback, 409, 'Công việc đang hoàn tác.');
    const index = rollback ? job.cursor - 1 : job.cursor;
    const part = index < 0 ? { json: '[]', checksum: digest('[]') } : await readPlanPart(id, rollback ? 'rollback' : 'plan', index);
    fail(part && digest(part.json) === part.checksum, 409, 'Chặng dữ liệu bị thiếu hoặc thay đổi.');
    const rows = decodeRows(part.json);
    return store.runTransaction(async tx => {
      const current = checked(actor, (await tx.get(jobRef(id))).data());
      const settings = (await tx.get(settingsRef)).data(); fence(settings, id);
      fail(current.cursor === job.cursor && current.status === job.status, 409, 'Công việc vừa được tiếp tục ở phiên khác.');
      const observed = []; for (const row of rows) observed.push(await tx.get(store.doc(prefix + row.path)));
      const before = rows.map((row, index) => ({ path: row.path, data: observed[index].exists ? observed[index].data() : null }));
      const cursor = rollback ? Math.max(0, index) : index + 1, complete = rollback ? cursor === 0 : cursor >= job.planCount;
      for (const row of rows) {
        const ref = store.doc(prefix + row.path);
        if (row.path === 'public/data/settings/global') {
          const data = { ...(row.data || {}) }; forbiddenSettings.forEach(key => delete data[key]);
          ['adminPass', 'teacherPass', 'thdAdminPass'].forEach(key => { if (Object.hasOwn(settings, key)) data[key] = settings[key]; });
          if (!complete) data.maintenance = settings.maintenance; tx.set(ref, data);
        } else if (row.data === null) tx.delete(ref); else tx.set(ref, row.data);
      }
      if (!rollback) await savePlanPart(id, 'rollback', index, before, tx);
      if (complete && !rows.some(row => row.path === 'public/data/settings/global')) { const data = { ...settings }; delete data.maintenance; tx.set(settingsRef, data); }
      const next = { ...current, cursor, status: complete ? rollback ? 'rolledBack' : 'complete' : rollback ? 'rollingBack' : 'restoring', updatedAt: now() };
      tx.set(jobRef(id), next); return progress(next, id);
    });
  }
  async function cancelJob(actor, { jobId: id }) {
    admin(actor);
    return store.runTransaction(async tx => {
      const job = checked(actor, (await tx.get(jobRef(id))).data()), settings = (await tx.get(settingsRef)).data() || {};
      fail(job.kind === 'backup' || job.cursor === 0 && ['uploading', 'validating', 'validated', 'planning', 'restoring'].includes(job.status), 409, 'Đã ghi dữ liệu. Dùng hoàn tác trước khi mở khóa.');
      if (settings.maintenance?.jobId === id) { const next = { ...settings }; delete next.maintenance; tx.set(settingsRef, next); }
      tx.set(jobRef(id), { ...job, status: 'cancelled', updatedAt: now() }); return { cancelled: true };
    });
  }
  async function listJobs(actor) {
    admin(actor); const result = await store.collection(`${prefix}server_maintenance_jobs`).where('owner', '==', actor.uid).orderBy('createdAt', 'desc').limit(50).get();
    return { jobs: result.docs.map(item => ({ id: item.id, ...progress(item.data(), item.id) })) };
  }
  async function completeBackupExport(actor, { jobId: id, fileId }) {
    admin(actor); documentId(fileId);
    return store.runTransaction(async tx => {
      const job = checked(actor, (await tx.get(jobRef(id))).data());
      fail(job.kind === 'backup' && job.status === 'complete', 409, 'Bản sao lưu chưa hoàn tất.');
      tx.set(jobRef(id), { ...job, exportStatus: 'saved', exportFileId: fileId, exportedAt: now() }); return { saved: true };
    });
  }
  return { readSummary, beginBackup, stepBackup, readBackup, completeBackupExport, beginRestore, uploadRestoreChunk, uploadMailboxChunk, applyMailbox, prepareRestore, stepRestore, cancelJob, listJobs };
}
