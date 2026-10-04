import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { fail } from './dataPolicy.mjs';
import { assembleGeneration } from '../../src/utils/chunkedData.js';

const hash = text => createHash('sha256').update(text).digest('hex');
const globalPath = 'public/data/settings/global';

// Every request advances one bounded checkpoint. Staging never writes live records.
export function createRestorePlanner({ store, prefix, jobRef, partRef, settingsRef, checked, fence, targets,
  readPlanPart, savePlanPart, decodeRows, encode, validateBackupPath, now, chunkSize }) {
  const incomingRef = (id, path) => partRef(id, 'incoming', hash(path));
  const collection = (id, name) => jobRef(id).collection(name);
  const pageAfter = (ref, after = '', size = 10) => {
    let query = ref.orderBy(FieldPath.documentId()).limit(size);
    if (after) query = query.startAfter(after);
    return query.get();
  };
  function parseRow(json, path = null) {
    let rows;
    try { rows = decodeRows(json); } catch (error) { fail(false, 400, error.status ? error.message : 'Nội dung hồ sơ phục hồi không hợp lệ.'); }
    fail(Array.isArray(rows) && rows.length === 1 && (!path || rows[0].path === path), 400, 'Mảnh hồ sơ khác đường dẫn.');
    const row = rows[0]; validateBackupPath(row.path);
    fail(row.data && !Array.isArray(row.data) && Object.getPrototypeOf(row.data) === Object.prototype, 400, 'Hồ sơ phục hồi phải là một map dữ liệu.');
    fail(Buffer.byteLength(encode([row])) <= 1600000, 413, 'Hồ sơ vượt kích thước Firestore cho phép.');
    return row;
  }
  async function readIncoming(id, path) {
    const part = await readPlanPart(id, 'incoming', hash(path));
    if (!part) return null;
    fail(hash(part.json) === part.checksum, 409, 'Hồ sơ đã tải lên bị thay đổi.');
    return parseRow(part.json, path);
  }
  async function advance(actor, id, job, patch, write = async () => {}) {
    return store.runTransaction(async tx => {
      const current = checked(actor, (await tx.get(jobRef(id))).data());
      const settings = job.status === 'planning' ? (await tx.get(settingsRef)).data() : null;
      fail(current.status === job.status && (current.planningRevision || 0) === (job.planningRevision || 0), 409, 'Chặng này đã được xử lý ở lượt khác; tải lại tiến độ.');
      if (job.status === 'planning') fence(settings, id);
      await write(tx);
      const next = { ...current, ...patch, planningRevision: (current.planningRevision || 0) + 1, updatedAt: now() };
      tx.set(jobRef(id), next); return { ...next, jobId: id };
    });
  }
  const rowMetadata = row => ({ rowPath: row.path, collectionPath: row.path.split('/').slice(0, -1).join('/') });
  async function stageChunk(actor, id, job) {
    if (job.validateCursor >= job.manifest.checksums.length) return advance(actor, id, job, { validatePhase: 'fragments', validateAfter: '' });
    const part = (await partRef(id, 'chunks', job.validateCursor).get()).data();
    fail(part && hash(part.json) === job.manifest.checksums[job.validateCursor], 409, 'Thiếu chặng hoặc checksum sai. Chưa thay đổi dữ liệu chính.');
    const rows = [], pieces = [], paths = new Set();
    for (const raw of JSON.parse(part.json)) {
      validateBackupPath(raw.path);
      if (!raw.fragment) {
        const row = parseRow(JSON.stringify([raw]));
        fail(!paths.has(row.path), 400, 'Đường dẫn bị lặp trong bản phục hồi.'); paths.add(row.path); rows.push(row);
      } else {
        const f = raw.fragment;
        fail(f.encoding === 'base64' && /^[A-Za-z0-9+/]*={0,2}$/.test(f.text), 400, 'Mã hóa mảnh hồ sơ không hợp lệ.');
        pieces.push({ path: raw.path, ...f });
      }
    }
    return advance(actor, id, job, { validateCursor: job.validateCursor + 1,
      documentCount: job.documentCount + rows.length, privateCount: job.privateCount + rows.filter(row => row.path.startsWith('server_')).length }, async tx => {
      const observed = new Map();
      for (const row of rows) { const ref = incomingRef(id, row.path); fail(!(await tx.get(ref)).exists, 400, 'Đường dẫn bị lặp trong bản phục hồi.'); }
      for (const piece of pieces) {
        const key = hash(piece.path), ref = collection(id, 'fragments').doc(key), child = ref.collection('pieces').doc(String(piece.index));
        if (!observed.has(key)) observed.set(key, { ref, old: (await tx.get(ref)).data(), indices: new Set() });
        const item = observed.get(key);
        fail((!item.old || item.old.total === piece.total && item.old.path === piece.path) && !item.indices.has(piece.index)
          && !(await tx.get(child)).exists, 400, 'Mảnh hồ sơ bị lặp hoặc không khớp.');
        item.indices.add(piece.index);
      }
      for (const row of rows) await savePlanPart(id, 'incoming', hash(row.path), [row], tx, rowMetadata(row));
      for (const piece of pieces) {
        const item = observed.get(hash(piece.path)); tx.set(item.ref.collection('pieces').doc(String(piece.index)), { text: piece.text });
      }
      for (const item of observed.values()) tx.set(item.ref, { path: pieces.find(p => hash(p.path) === item.ref.id).path,
        total: pieces.find(p => hash(p.path) === item.ref.id).total, count: (item.old?.count || 0) + item.indices.size });
    });
  }
  async function stageFragment(actor, id, job) {
    const page = await pageAfter(collection(id, 'fragments'), job.validateAfter, 1);
    if (!page.docs.length) return advance(actor, id, job, { validatePhase: 'graph', validateAfter: '' });
    const item = page.docs[0], meta = item.data(); fail(meta.count === meta.total, 400, 'Thiếu mảnh hồ sơ.');
    const pieces = [];
    for (let start = 0; start < meta.total; start += 8) {
      const parts = await Promise.all(Array.from({ length: Math.min(8, meta.total - start) }, (_, offset) => item.ref.collection('pieces').doc(String(start + offset)).get()));
      for (const part of parts) { const text = part.data()?.text; fail(typeof text === 'string', 400, 'Thiếu mảnh hồ sơ.'); pieces.push(Buffer.from(text, 'base64').toString('utf8')); }
    }
    const row = parseRow(pieces.join(''), meta.path);
    return advance(actor, id, job, { validateAfter: item.id, documentCount: job.documentCount + 1, privateCount: job.privateCount + Number(row.path.startsWith('server_')) }, async tx => {
      fail(!(await tx.get(incomingRef(id, row.path))).exists, 400, 'Đường dẫn bị lặp trong bản phục hồi.');
      await savePlanPart(id, 'incoming', hash(row.path), [row], tx, rowMetadata(row));
    });
  }
  async function validateGraphRow(id, { path, data }) {
    const has = async (target, message) => { const value = await readIncoming(id, target); fail(value, 400, message); return value.data; };
    if (path.startsWith('server_quiz_attempts/')) await has(`server_quizzes/${data.kind === 'material' ? 'material-' : ''}${data.quizId}`, 'Lượt làm thiếu đề riêng tương ứng.');
    if (path.startsWith('server_quiz_slots/') && data.attemptId) await has(`server_quiz_attempts/${data.attemptId}`, 'Khóa lượt làm thiếu lượt tương ứng.');
    if (path.startsWith('server_essay_slots/') && data.id) await has(`public/data/handwritten_submissions/${data.id}`, 'Khóa bài tự luận thiếu bài nộp tương ứng.');
    if (path.startsWith('public/data/student_code_registry/') && Array.isArray(data.studentIds)) {
      fail(data.studentIds.length <= 100, 400, 'Registry có quá nhiều hồ sơ; cần đối soát trước.');
      for (const studentId of data.studentIds) {
        const profile = await readIncoming(id, `public/data/students/${studentId}`) || await readIncoming(id, `public/data/student_archives/${studentId}`);
        fail(profile && (profile.data.studentKey || profile.data.accessCode) === data.studentKey, 400, 'Registry mã không khớp hồ sơ/đối soát học sinh.');
      }
    }
    if (/^public\/data\/(lesson_quizzes|materials)\//.test(path) && data.serverGraded) {
      const head = await has(`server_quizzes/${path.startsWith('public/data/materials/') ? 'material-' : ''}${path.split('/').at(-1)}`, 'Header thiếu đề riêng.');
      fail(head.serverVersion === data.serverVersion, 400, 'Header và đề riêng không cùng phiên bản.');
    }
    if (path === 'public/data/settings/thdTeachingAssignments' && data.chunked) {
      fail(Number.isInteger(data.chunkCount) && data.chunkCount > 0 && data.chunkCount <= 64, 413, 'Phân công vượt giới hạn kiểm chứng 64 mảnh.');
      const chunksPath = data.generation ? `${path}/generations/${data.generation}/chunks` : `${path}/chunks`;
      const parts = await collection(id, 'incoming').where('collectionPath', '==', chunksPath).limit(65).get(), pieces = [];
      fail(parts.docs.length === data.chunkCount, 400, 'Phân công chưa đủ mảnh.');
      for (const part of parts.docs) pieces.push((await readIncoming(id, part.data().rowPath)).data);
      try { await assembleGeneration(data, pieces); } catch (error) { fail(false, 400, error.message); }
    }
  }
  async function graph(actor, id, job) {
    const page = await pageAfter(collection(id, 'incoming'), job.validateAfter, 5);
    for (const part of page.docs) await validateGraphRow(id, await readIncoming(id, part.data().rowPath));
    if (page.docs.length) return advance(actor, id, job, { validateAfter: page.docs.at(-1).id });
    fail(await readIncoming(id, globalPath), 400, 'Bản sao lưu thiếu thiết lập chính.');
    return advance(actor, id, job, { validatePhase: 'mailbox', validateCursor: 0, mailboxBytes: 0 });
  }
  async function mailbox(actor, id, job) {
    if (job.validateCursor < (job.mailboxChecksums?.length || 0)) {
      const part = (await partRef(id, 'mailbox', job.validateCursor).get()).data();
      fail(part && hash(part.json) === job.mailboxChecksums[job.validateCursor], 409, 'Thiếu mảnh hộp thư. Chưa phục hồi dữ liệu chính.');
      const mailboxBytes = job.mailboxBytes + Buffer.byteLength(part.json);
      fail(mailboxBytes <= 7 * 1024 * 1024, 413, 'Hộp thư vượt giới hạn chuyển an toàn sang Apps Script.');
      return advance(actor, id, job, { mailboxBytes, validateCursor: job.validateCursor + 1 });
    }
    const paths = await targets();
    fail(Buffer.byteLength(JSON.stringify(paths)) <= 100000, 413, 'Quá nhiều generation; dọn bản cũ trước khi phục hồi.');
    return advance(actor, id, job, { validatePhase: 'preview', previewTargets: paths, previewCursor: 0, previewAfter: '', previewMatches: 0, previewDeleteCount: 0 });
  }
  async function preview(actor, id, job) {
    if (job.previewCursor >= job.previewTargets.length) return advance(actor, id, job, { status: 'validated', valid: true,
      previewCreateCount: job.documentCount - job.previewMatches, previewUpdateCount: job.previewMatches, previewOnly: true, previewTargets: null, writesBlockedDuringRestore: true });
    const page = await pageAfter(store.collection(prefix + job.previewTargets[job.previewCursor]), job.previewAfter);
    let matches = 0, deleted = 0;
    for (const item of page.docs) { if (await readIncoming(id, item.ref.path.slice(prefix.length))) matches++; else deleted++; }
    const done = page.docs.length < 10;
    return advance(actor, id, job, { previewCursor: job.previewCursor + Number(done), previewAfter: done ? '' : page.docs.at(-1).id,
      previewMatches: job.previewMatches + matches, previewDeleteCount: job.previewDeleteCount + deleted });
  }
  async function makePlans(actor, id, job, operations, patch, plannedRefs = []) {
    const groups = []; let group = [], bytes = 0;
    for (const { row, before } of operations) {
      const size = Math.max(Buffer.byteLength(encode([row])), before ? Buffer.byteLength(encode([{ path: row.path, data: before }])) : 0);
      if (group.length && (bytes + size > chunkSize || group.length >= 70)) { groups.push(group); group = []; bytes = 0; }
      group.push(row); bytes += size;
    }
    if (group.length) groups.push(group);
    return advance(actor, id, job, { ...patch, planCount: job.planCount + groups.length }, async tx => {
      for (let offset = 0; offset < groups.length; offset++) await savePlanPart(id, 'plan', job.planCount + offset, groups[offset], tx);
      plannedRefs.forEach(ref => tx.set(ref, { planned: true }, { merge: true }));
    });
  }
  async function scan(actor, id, job) {
    if (job.scanCursor >= job.targets.length) return advance(actor, id, job, { planPhase: 'creates', scanAfter: '' });
    const page = await pageAfter(store.collection(prefix + job.targets[job.scanCursor]), job.scanAfter);
    const operations = [], planned = []; let deleted = 0, updated = 0;
    for (const item of page.docs) {
      const path = item.ref.path.slice(prefix.length); if (path === globalPath) continue;
      const desired = await readIncoming(id, path);
      operations.push({ row: desired || { path, data: null }, before: item.data() });
      if (desired) { planned.push(incomingRef(id, path)); updated++; } else deleted++;
    }
    const done = page.docs.length < 10;
    return makePlans(actor, id, job, operations, { scanCursor: job.scanCursor + Number(done), scanAfter: done ? '' : page.docs.at(-1).id,
      deleteCount: job.deleteCount + deleted, updateCount: job.updateCount + updated }, planned);
  }
  async function creates(actor, id, job) {
    const page = await pageAfter(collection(id, 'incoming'), job.scanAfter);
    const operations = [];
    for (const item of page.docs) if (!item.data().planned && item.data().rowPath !== globalPath) operations.push({ row: await readIncoming(id, item.data().rowPath) });
    if (page.docs.length) return makePlans(actor, id, job, operations, { scanAfter: page.docs.at(-1).id, createCount: job.createCount + operations.length });
    const global = await readIncoming(id, globalPath), current = (await settingsRef.get()).data();
    return makePlans(actor, id, job, [{ row: global, before: current }], { status: 'restoring' });
  }
  async function prepare(actor, id, dryRun) {
    const job = checked(actor, (await jobRef(id).get()).data());
    fail(job.kind === 'restore' && ['uploading', 'validating', 'validated', 'planning', 'restoring'].includes(job.status), 409, 'Công việc đã bắt đầu. Dùng tiếp tục hoặc hoàn tác.');
    if (job.status === 'restoring') return { ...job, jobId: id };
    if (job.status === 'uploading') return advance(actor, id, job, { status: 'validating', validatePhase: 'chunks', validateCursor: 0, documentCount: 0, privateCount: 0 });
    if (job.status === 'validating') {
      const steps = { chunks: stageChunk, fragments: stageFragment, graph, mailbox, preview };
      return steps[job.validatePhase](actor, id, job);
    }
    if (job.status === 'validated') {
      if (dryRun) return { ...job, jobId: id };
      return store.runTransaction(async tx => {
        const current = checked(actor, (await tx.get(jobRef(id))).data()), settings = (await tx.get(settingsRef)).data() || {};
        fail(current.status === 'validated', 409, 'Công việc đã thay đổi.');
        fail(!settings.maintenance?.active, 423, 'Đang có bảo trì khác.');
        tx.set(settingsRef, { ...settings, maintenance: { active: true, jobId: id, kind: 'restore', createdAt: now() } });
        const next = { ...current, status: 'planning', planPhase: 'initialize', scanCursor: 0, scanAfter: '', planCount: 0, deleteCount: 0, createCount: 0, updateCount: 0 };
        tx.set(jobRef(id), next); return { ...next, jobId: id };
      });
    }
    if (job.planPhase === 'initialize') {
      // Discover live generation subcollections only after writes are fenced.
      const paths = await targets();
      fail(Buffer.byteLength(JSON.stringify(paths)) <= 100000, 413, 'Quá nhiều generation; dọn bản cũ trước khi phục hồi.');
      return advance(actor, id, job, { targets: paths, planPhase: 'scan' });
    }
    return job.planPhase === 'scan' ? scan(actor, id, job) : creates(actor, id, job);
  }
  return { prepare };
}
