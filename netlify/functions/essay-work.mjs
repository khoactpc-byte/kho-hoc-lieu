import { firebaseStore } from '../lib/firebaseStore.mjs';
import { verifyStaffSession } from '../lib/firebaseServer.mjs';
import { createEssayWorkService, dispatchEssayJobs, essayBridge } from '../lib/essayWork.mjs';

export function createEssayWorkHandler({ context = firebaseStore, verifyStaff = verifyStaffSession, bridge = essayBridge, dispatch = dispatchEssayJobs } = {}) {
  return async event => {
    const reply = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(data) });
    if (event.httpMethod !== 'POST') return reply(405, { error: 'Chỉ nhận POST.' });
    try {
      if (event.isBase64Encoded || Buffer.byteLength(event.body || '') > 12000) return reply(413, { error: 'Yêu cầu quá lớn.' });
      let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'JSON không hợp lệ.' }); }
      if (!payload || !['queue', 'send'].includes(payload.action)) return reply(400, { error: 'Thao tác không hợp lệ.' });
      let actor;
      if (payload.adminSessionToken || payload.staffSessionToken) {
        try { actor = await verifyStaff(payload); } catch { return reply(401, { error: 'Phiên giáo viên hết hạn. Đăng nhập lại để tiếp tục.' }); }
      } else if (payload.action === 'queue' && payload.studentSessionToken) {
        const result = await bridge('getEssayStudentIdentity', { studentSessionToken: payload.studentSessionToken });
        actor = { ...result.student, role: 'student' };
      } else return reply(401, { error: 'Cần đăng nhập để xử lý bài.' });
      const service = createEssayWorkService({ ...context(), bridge });
      if (payload.action === 'send') return reply(200, await service.send(actor, payload));
      const result = await service.queue(actor, payload);
      if (result.status === 'queued') {
        try { await dispatch([payload.id]); } catch { return reply(202, { ...result, message: 'Đã xếp hàng. Máy chủ sẽ thử chấm nền sau.' }); }
      }
      return reply(200, result);
    } catch (error) { return reply(error.status || 503, { error: error.status ? error.message : 'Chưa xử lý được bài. Bài nộp và bản nháp vẫn được giữ.' }); }
  };
}
export const handler = createEssayWorkHandler();
