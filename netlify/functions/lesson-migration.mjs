import { firebaseServer } from '../lib/firebaseServer.mjs';
import { verifyApiActor } from '../lib/apiActor.mjs';
import { prepareLessonMigration, validLessonId } from '../lib/lessonMigration.mjs';

const respond = (statusCode, data) => ({ statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  body: JSON.stringify(data) });

export function createLessonMigrationHandler({ context = firebaseServer, verifyActor = verifyApiActor, fetchImpl = fetch, env = process.env } = {}) {
  return async event => {
    if (event.httpMethod !== 'POST') return respond(405, { error: 'Chỉ nhận POST.' });
    if (env.KHL_LESSON_MIGRATION_ENABLED !== 'true') return respond(503, { error: 'Chuyển bài thử nghiệm chưa được bật trên máy chủ.' });
    try {
      if (event.isBase64Encoded || Buffer.byteLength(event.body || '', 'utf8') > 20000) return respond(413, { error: 'Yêu cầu quá lớn.' });
      let payload;
      try { payload = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'JSON không hợp lệ.' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return respond(400, { error: 'Yêu cầu không hợp lệ.' });
      if (!['preview', 'stage', 'verify', 'publish'].includes(payload.action)) return respond(400, { error: 'Thao tác chuyển bài không hợp lệ.' });
      const noteId = payload.noteId;
      if (!validLessonId(noteId)) return respond(400, { error: 'Mã bài học không hợp lệ.' });
      if (env.KHL_LESSON_MIGRATION_NOTE_ID && noteId !== env.KHL_LESSON_MIGRATION_NOTE_ID) return respond(403, { error: 'Bản thử chỉ cho phép bài đã chọn.' });
      const ctx = context();
      const actor = await verifyActor(ctx, event, payload);
      if (actor.role !== 'admin') return respond(403, { error: 'Chỉ quản trị viên được chuyển bài học.' });
      const sourceRef = ctx.store.doc(`artifacts/${ctx.appId}/public/data/lesson_notes/${noteId}`);
      const snapshot = await sourceRef.get();
      if (!snapshot.exists) return respond(404, { error: 'Không tìm thấy bài trong Firestore.' });
      const source = snapshot.data() || {};
      const prepared = prepareLessonMigration(noteId, source);
      if (payload.action === 'preview') return respond(200, { status: 'preview', ...prepared });
      if (payload.sourceHash !== prepared.report.sourceHash) return respond(409, { error: 'Bài đã thay đổi hoặc chưa xem trước. Xem trước lại trước khi chuyển.' });
      const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
      const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) return respond(503, { error: 'Máy chủ chưa cấu hình đích Supabase.' });
      const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      if (['verify', 'publish'].includes(payload.action)) {
        const rows = [];
        for (const [table, fields] of [['lesson_public', 'note_id,school_code,school_year,grade,subject,lesson,html,layout_mode,published,source_updated_at,content_hash'], ['lesson_private', 'note_id,answer_html']]) {
          const query = new URLSearchParams({ note_id: `eq.${noteId}`, select: fields, limit: '1' });
          const response = await fetchImpl(`${url}/rest/v1/${table}?${query}`, { headers, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error('Supabase readback failed.');
          const data = await response.json();
          rows.push(Array.isArray(data) ? data[0] : null);
        }
        const [publicRow, privateRow] = rows;
        if (!publicRow || !privateRow) return respond(409, { status: 'incomplete', error: 'Chưa có đủ hai bản để đối chiếu.' });
        const matches = (actual, expected) => Object.entries(expected).every(([key, value]) => actual[key] === value);
        // Publishing changes only the visibility flag, after both stored bodies match.
        const publicMatches = matches(publicRow, { ...prepared.publicRow, published: publicRow.published }), privateMatches = matches(privateRow, prepared.privateRow);
        if (payload.action === 'publish') {
          if (!publicMatches || !privateMatches) return respond(409, { status: 'mismatch', error: 'Hai bản chưa khớp bài nguồn. Chưa xuất bản.' });
          if (publicRow.published === true) return respond(200, { status: 'published', ...prepared.report, published: true, alreadyPublished: true });
          const query = new URLSearchParams({ note_id: `eq.${noteId}`, content_hash: `eq.${prepared.report.sourceHash}`, published: 'eq.false', select: 'note_id,content_hash,published' });
          const response = await fetchImpl(`${url}/rest/v1/lesson_public?${query}`, {
            method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ published: true }), signal: AbortSignal.timeout(15000)
          });
          if (!response.ok) throw new Error('Supabase publication failed.');
          const updated = await response.json();
          if (!Array.isArray(updated) || updated.length !== 1 || updated[0].published !== true || updated[0].content_hash !== prepared.report.sourceHash || updated[0].note_id !== noteId) return respond(409, { error: 'Bài đã thay đổi trong lúc xuất bản. Đọc lại và đối chiếu.' });
          return respond(200, { status: 'published', ...prepared.report, published: true });
        }
        return respond(publicMatches && privateMatches ? 200 : 409, { status: publicMatches && privateMatches ? 'verified' : 'mismatch',
          ...prepared.report, published: publicRow.published, publicMatches, privateMatches, publicRow, privateRow });
      }
      // Pilot inserts only. A duplicate must never overwrite or unpublish a live lesson.
      const publicResponse = await fetchImpl(`${url}/rest/v1/lesson_public`, {
        method: 'POST', headers, body: JSON.stringify(prepared.publicRow), signal: AbortSignal.timeout(15000)
      });
      if (publicResponse.status === 409) return respond(409, { error: 'Bài hoặc phạm vi này đã tồn tại ở Supabase. Cần đối chiếu trước khi cập nhật.' });
      if (!publicResponse.ok) throw new Error(`Supabase public upsert failed (${publicResponse.status}).`);
      try {
        const privateResponse = await fetchImpl(`${url}/rest/v1/lesson_private`, {
          method: 'POST', headers, body: JSON.stringify(prepared.privateRow), signal: AbortSignal.timeout(15000)
        });
        if (!privateResponse.ok) throw new Error('Private insert failed.');
      } catch {
        return respond(502, { status: 'incomplete', noteId, published: false,
          error: 'Đã lưu bản học sinh chưa xuất bản nhưng chưa xác nhận lưu đáp án. Đối chiếu hai bảng trước khi thử lại.' });
      }
      return respond(200, { status: 'staged', ...prepared.report });
    } catch (error) {
      if (error.status) return respond(error.status, { error: error.message });
      console.error('Lesson migration failed:', error.code || error.name);
      return respond(500, { error: 'Chưa chuyển được bài. Dữ liệu gốc vẫn còn trong Firestore.' });
    }
  };
}

export const handler = createLessonMigrationHandler();
