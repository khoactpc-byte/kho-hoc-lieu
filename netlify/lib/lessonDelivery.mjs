import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { prepareLessonMigration, validLessonId } from './lessonMigration.mjs';
import { teacherHasContentScope } from '../../src/utils/teacherAccess.js';
import { normalizeLessonLayoutMode } from '../../src/utils/lessonLayout.js';
import { learningUpdateMetadata, learningUpdateId, LEARNING_UPDATES_COLLECTION } from '../../src/utils/learningUpdates.js';
import { SUBJECTS } from '../../src/config/learningDomain.js';
import { primarySubjectsForGrade } from '../../src/utils/primaryAcademic.js';

const fail = (ok, status, message) => { if (!ok) throw Object.assign(new Error(message), { status }); };
export function assertLessonDeliveryScope(actor, source, noteId) {
  fail(actor?.role === 'admin' || teacherHasContentScope(actor, source), 403, 'Chưa được phân công bài học này.');
  const prefix = source.schoolCode === 'NAN' ? '' : `${source.schoolCode}_`;
  fail(noteId === `${prefix}g${source.grade}_${String(source.subject).replace(/\s/g, '')}_l${source.lesson || source.week}`, 409, 'Mã bài không khớp trường, khối, môn hoặc tuần.');
}
const sourceKey = source => createHash('sha256').update(JSON.stringify([source.updatedAt, source.content, source.layoutMode, source.schoolCode, source.schoolYear, source.grade, source.subject, source.lesson])).digest('hex');
export function legacyLessonMetadata(noteId, source, schoolYear) {
  const match = noteId.match(/^(?:(NAN|TQK)_)?g([1-9])_(.+)_l(\d{1,2})$/u);
  if (!match) return {};
  const subjects = [...new Set([...SUBJECTS, ...primarySubjectsForGrade(match[2]).map(item => item.label), 'Chủ nhiệm'])];
  const subject = subjects.find(item => item.replace(/\s/g, '') === match[3]);
  if (!subject) return {};
  const expected = { schoolCode: match[1] || 'NAN', grade: match[2], subject, lesson: match[4], schoolYear };
  return Object.fromEntries(Object.entries(expected).filter(([key, value]) => !source[key] && value));
}
export function createLessonDeliveryService({ store, appId, env = process.env, fetchImpl = fetch, now = Date.now }) {
  const root = `artifacts/${appId}/public/data`, refFor = id => store.doc(`${root}/lesson_notes/${id}`);
  const allowed = id => !env.KHL_LESSON_SYNC_NOTE_ID || env.KHL_LESSON_SYNC_NOTE_ID === id;
  const enabled = () => env.KHL_LESSON_SYNC_ENABLED === 'true';
  const proof = (id, source, revision) => {
    fail(env.IDENTITY_BRIDGE_TOKEN, 503, 'Chưa cấu hình xác thực hàng chờ đồng bộ.');
    return createHmac('sha256', env.IDENTITY_BRIDGE_TOKEN).update(`lesson-delivery-v1:${appId}:${id}:${revision}:${sourceKey(source)}`).digest('hex');
  };
  const approved = (id, source) => {
    const revision = source.deliverySync?.revision, signature = source.deliverySync?.proof;
    if (!Number.isSafeInteger(revision) || revision <= 0 || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(proof(id, source, revision)));
  };
  const marker = (id, source, previous = 0) => {
    const stamp = now() * 1000;
    const revision = Math.max(stamp, Number.isSafeInteger(previous) && previous < stamp + 1000000 ? previous + 1 : stamp);
    return { state: 'pending', requestId: randomUUID(), revision, proof: proof(id, source, revision), attempts: 0, nextAttemptAt: now() };
  };
  async function save(draft, actor) {
    fail(enabled(), 503, 'Đồng bộ bài học chưa được bật.');
    fail(draft && validLessonId(draft.noteId) && allowed(draft.noteId) && typeof draft.content === 'string' && typeof draft.baseContent === 'string', 400, 'Bài lưu không hợp lệ.');
    const { noteId } = draft;
    assertLessonDeliveryScope(actor, draft, noteId);
    fail(Buffer.byteLength(draft.content) <= 850000, 413, 'Bài học quá lớn để lưu.');
    fail(['auto', 'single', 'double'].includes(draft.layoutMode), 400, 'Bố cục không hợp lệ.');
    prepareLessonMigration(noteId, draft, { allowEmpty: true });
    const ref = refFor(noteId);
    await store.runTransaction(async tx => {
      const current = (await tx.get(ref)).data() || {};
      const settings = (await tx.get(store.doc(`${root}/settings/global`))).data() || {};
      fail(!settings.maintenance?.active && !settings.inputYearLocks?.[draft.schoolYear], 423, 'Năm học đang khóa hoặc hệ thống đang bảo trì.');
      fail(settings.schoolYear === draft.schoolYear, 423, 'Chỉ lưu bài của năm học hiện tại.');
      fail((current.content || '') === draft.baseContent || current.content === draft.content, 409, 'Bài học vừa được người khác sửa. Bản nháp được giữ để đối chiếu.');
      const mode = normalizeLessonLayoutMode(current.layoutMode);
      fail(draft.baseLayoutMode === undefined || mode === normalizeLessonLayoutMode(draft.baseLayoutMode) || mode === draft.layoutMode, 409, 'Bố cục bài học vừa được người khác sửa.');
      if (current.schoolCode) assertLessonDeliveryScope(actor, current, noteId);
      const saved = { ...current, content: draft.content, hasContent: !!draft.content.trim(), layoutMode: draft.layoutMode, updatedAt: now(),
        schoolCode: draft.schoolCode, schoolYear: draft.schoolYear, grade: String(draft.grade), subject: draft.subject, lesson: String(draft.lesson),
        authorId: actor.teacherId || `staff:${actor.role}`, ...(draft.documentSource ? { documentSource: draft.documentSource } : {}), ...(draft.pdfSource ? { pdfSource: draft.pdfSource } : {}) };
      saved.deliverySync = marker(noteId, saved, current.deliverySync?.revision);
      tx.set(ref, saved);
      const update = learningUpdateMetadata('note', noteId, saved);
      if (update) tx.set(store.doc(`${root}/${LEARNING_UPDATES_COLLECTION}/${learningUpdateId('note', noteId)}`), update);
    });
    return { saved: true, status: 'pending', noteId };
  }
  async function sync(noteId, { actor, background = false } = {}) {
    fail(enabled(), 503, 'Đồng bộ bài học chưa được bật.');
    fail(validLessonId(noteId) && allowed(noteId), 403, 'Bài chưa nằm trong phạm vi đồng bộ.');
    const ref = refFor(noteId), initial = await ref.get();
    fail(initial.exists, 404, 'Không tìm thấy bài gốc; chưa đổi bản Supabase.');
    const rawSource = initial.data();
    const settings = (await store.doc(`${root}/settings/global`).get()).data() || {};
    // Only a verified administrator may repair missing legacy metadata. Conflicting
    // declared fields are never replaced; canonical IDs and schema validation still apply.
    const inferred = actor?.role === 'admin' && !background ? legacyLessonMetadata(noteId, rawSource, settings.schoolYear) : {};
    const source = { ...rawSource, ...inferred };
    if (!background) assertLessonDeliveryScope(actor, source, noteId);
    else {
      assertLessonDeliveryScope({ role: 'admin' }, source, noteId);
      fail(approved(noteId, source), 403, 'Hàng chờ chưa được máy chủ xác thực.');
    }
    fail(!settings.maintenance?.active, 423, 'Hệ thống đang bảo trì; sẽ đồng bộ lại sau.');
    const prepared = prepareLessonMigration(noteId, source, { allowEmpty: true });
    const capturedKey = sourceKey(rawSource);
    const token = randomUUID();
    let revision;
    const acquired = await store.runTransaction(async tx => {
      const snapshot = await tx.get(ref), latest = snapshot.data();
      if (!latest || latest.deliverySync?.lockUntil > now()) return false;
      // The pending save may have changed while validating the actor. Never lock an older body.
      if (sourceKey(latest) !== capturedKey) return false;
      if (background && !approved(noteId, latest)) return false;
      const signed = approved(noteId, latest) && !Object.keys(inferred).length ? latest.deliverySync : marker(noteId, { ...latest, ...inferred }, latest.deliverySync?.revision);
      revision = signed.revision;
      tx.update(ref, { ...inferred, deliverySync: { ...signed, state: 'syncing', lockToken: token, lockUntil: now() + 90000, nextAttemptAt: now() + 90000 } });
      return true;
    });
    if (!acquired) return { status: 'pending', noteId };
    let result, error;
    try {
      const url = String(env.SUPABASE_URL || '').replace(/\/$/, ''), key = env.SUPABASE_SERVICE_ROLE_KEY;
      fail(/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key, 503, 'Chưa cấu hình máy chủ Supabase.');
      const response = await fetchImpl(`${url}/rest/v1/rpc/sync_lesson_delivery`, { method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_public: { ...prepared.publicRow, published: !!source.content.trim() }, p_private: prepared.privateRow, p_source_revision: revision }),
        signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Supabase delivery HTTP ${response.status}`);
      result = await response.json();
      if (!['synced', 'stale'].includes(result.status) || result.noteId !== noteId) throw new Error('Unexpected delivery response');
    } catch (failure) { error = failure; }
    let marked = false;
    await store.runTransaction(async tx => {
      const latest = (await tx.get(ref)).data();
      if (!latest || latest.deliverySync?.lockToken !== token) return;
      const attempts = error ? Number(latest.deliverySync?.attempts || 0) + 1 : 0;
      const state = error ? attempts >= 5 ? 'error' : 'pending' : result.status === 'stale' ? 'error' : 'synced';
      tx.update(ref, { deliverySync: { state, attempts, revision, proof: latest.deliverySync.proof, requestId: latest.deliverySync.requestId, completedAt: error ? null : now(),
        ...(error ? { error: 'Chưa đồng bộ được. Bài gốc đã lưu; có thể thử lại.', ...(attempts < 5 ? { nextAttemptAt: now() + Math.min(300000 * 2 ** (attempts - 1), 3600000) } : {}) }
          : { contentHash: result.contentHash, published: result.published, ...(result.status === 'stale' ? { error: 'Bản nguồn cũ hơn bản đã xuất bản; cần quản trị đối chiếu.' } : {}) }) } });
      marked = true;
    });
    if (error) return { status: 'pending', noteId, error: 'Bài gốc đã lưu. Chưa đồng bộ Supabase; hệ thống sẽ thử lại.' };
    return marked ? { ...result, ...(Object.keys(inferred).length ? { inferredFields: Object.keys(inferred) } : {}) } : { status: 'pending', noteId, error: 'Có bản sửa mới hơn đang chờ đồng bộ.' };
  }
  async function drain({ limit = 8, budgetMs = 12000 } = {}) {
    if (!enabled()) return { processed: 0, synced: 0, pending: 0 };
    const start = now(), result = { processed: 0, synced: 0, pending: 0 };
    // Indexed due-time query, never download the full lesson collection.
    const due = await store.collection(`${root}/lesson_notes`).where('deliverySync.nextAttemptAt', '<=', now()).limit(Math.min(limit, 20)).get();
    for (const row of due.docs) {
      if (now() - start >= budgetMs) break;
      if (!allowed(row.id)) continue;
      try { const saved = await sync(row.id, { background: true }); result[saved.status === 'synced' ? 'synced' : 'pending']++; }
      catch (failure) {
        result.pending++;
        // Invalid scope/metadata must not permanently block the head of the due queue.
        await store.runTransaction(async tx => {
          const ref = refFor(row.id), current = (await tx.get(ref)).data();
          if (current?.deliverySync?.requestId !== row.data().deliverySync?.requestId || current?.deliverySync?.lockUntil > now()) return;
          if (!failure.status || failure.status === 423 || failure.status >= 500) {
            tx.update(ref, { deliverySync: { ...current.deliverySync, state: 'pending', lockToken: null, lockUntil: 0,
              nextAttemptAt: now() + 300000, error: 'Tạm chờ máy chủ; hệ thống sẽ tự thử lại.' } });
          } else tx.update(ref, { deliverySync: { state: 'error', attempts: Number(current?.deliverySync?.attempts || 0) + 1,
            error: 'Cần kiểm tra phạm vi hoặc cấu hình bài trước khi đồng bộ lại.' } });
        });
      }
      result.processed++;
    }
    return result;
  }
  async function backfill({ cursor = '' } = {}) {
    fail(enabled(), 503, 'Đồng bộ chưa được bật.');
    fail(!cursor || validLessonId(cursor), 400, 'Mốc đồng bộ không hợp lệ.');
    let query = store.collection(`${root}/lesson_notes`).orderBy('__name__');
    if (cursor) query = query.startAfter(cursor);
    const rows = await query.limit(1).get();
    const report = { processed: 0, synced: 0, failed: 0, failures: [], nextCursor: cursor, done: rows.empty };
    const start = now();
    for (const row of rows.docs) {
      if (now() - start > 10000) break;
      report.processed++; report.nextCursor = row.id;
      try {
        const result = await sync(row.id, { actor: { role: 'admin' } });
        if (result.status !== 'synced') throw new Error('Bài đang chờ hoặc cần đối chiếu.');
        report.synced++;
      } catch (error) { report.failed++; report.failures.push({ noteId: row.id, error: error.status ? error.message : 'Chưa đồng bộ được. Có thể thử lại.' }); }
    }
    return report;
  }
  return { save, sync, drain, backfill };
}
