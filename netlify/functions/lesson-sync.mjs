import { firebaseServer, verifyStaffSession } from '../lib/firebaseServer.mjs';
import { createLessonDeliveryService } from '../lib/lessonDelivery.mjs';
export function createLessonSyncHandler({ context = firebaseServer, verifyStaff = verifyStaffSession, service = createLessonDeliveryService } = {}) {
  return async event => {
    const respond = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
    if (event.httpMethod !== 'POST') return respond(405, { error: 'Chỉ nhận POST.' });
    try {
      if (event.isBase64Encoded || Buffer.byteLength(event.body || '') > 1800000) return respond(413, { error: 'Yêu cầu quá lớn.' });
      let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'JSON không hợp lệ.' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !['save', 'sync', 'backfill'].includes(payload.action)) return respond(400, { error: 'Thao tác không hợp lệ.' });
      let actor; try { actor = await verifyStaff(payload); } catch { return respond(401, { error: 'Phiên đã hết hạn. Đăng nhập lại để đồng bộ.' }); }
      const current = service(context());
      if (payload.action === 'save') return respond(200, await current.save(payload.draft, actor));
      if (payload.action === 'backfill') {
        if (actor.role !== 'admin') return respond(403, { error: 'Chỉ quản trị viên được chuyển các bài cũ.' });
        return respond(200, await current.backfill(payload));
      }
      const result = await current.sync(payload.noteId, { actor });
      return respond(result.status === 'pending' ? 202 : 200, result);
    } catch (error) { return respond(error.status || 503, { error: error.status ? error.message : 'Bài gốc đã lưu; chưa đồng bộ được Supabase.' }); }
  };
}
export const handler = createLessonSyncHandler();
