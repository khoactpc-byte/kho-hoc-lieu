import { firebaseServer, verifyStaffSession } from '../lib/firebaseServer.mjs';
import { createQuizService, QuizError } from '../lib/serverQuiz.mjs';
import { requireSessionLease } from '../lib/sessionLease.mjs';

export function createQuizHandler({ enabled, context, verifyStaff = verifyStaffSession, requireLease = requireSessionLease }) {
  return async event => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const respond = (statusCode, data) => ({ statusCode, headers, body: JSON.stringify(data) });
    if (event.httpMethod !== 'POST') return respond(405, { error: 'Chỉ nhận POST.' });
    if (!enabled()) return respond(503, { error: 'Chấm bài máy chủ chưa được bật.' });
    try {
      if (event.isBase64Encoded || Buffer.byteLength(event.body || '', 'utf8') > 800000) return respond(413, { error: 'Yêu cầu quá lớn.' });
      let payload;
      try { payload = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'Yêu cầu JSON không hợp lệ.' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return respond(400, { error: 'Yêu cầu không hợp lệ.' });
      const token = (event.headers?.authorization || event.headers?.Authorization || '').match(/^Bearer (\S+)$/)?.[1];
      if (!token) return respond(401, { error: 'Cần đăng nhập lại.' });
      const { store, auth, appId } = context();
      let identity;
      try { identity = await auth.verifyIdToken(token, true); } catch { return respond(401, { error: 'Phiên đã hết hiệu lực. Đăng nhập lại.' }); }
      if (identity.appId !== appId || !identity.uid) return respond(403, { error: 'Phiên không thuộc ứng dụng này.' });
      identity = await requireLease({ store, appId }, identity);
      if (['read', 'publish', 'reset', 'archive', 'clear'].includes(payload.action) || payload.action === 'studentDocument' && identity.role !== 'student') {
        let current;
        try { current = await verifyStaff(payload); } catch { return respond(401, { error: 'Phiên nhân viên đã hết hiệu lực. Đăng nhập lại.' }); }
        if (!['admin', 'teacher'].includes(current.role) || current.role !== identity.role
          || (current.role === 'teacher' && (current.teacherId !== identity.teacherId || current.sessionVersion !== identity.sessionVersion))) {
          return respond(403, { error: 'Phân công hoặc tài khoản đã thay đổi. Đăng nhập lại.' });
        }
        identity = { ...current, uid: identity.uid };
      } else if (!['start', 'submit', 'history', 'studentDocument'].includes(payload.action)) return respond(400, { error: 'Thao tác không hợp lệ.' });
      else if (identity.role !== 'student' && payload.action !== 'studentDocument') return respond(403, { error: 'Chỉ học sinh được làm bài.' });
      if (payload.kind != null && !['lesson', 'material'].includes(payload.kind)) return respond(400, { error: 'Loại bài không hợp lệ.' });
      const service = createQuizService({ store, appId, kind: payload.kind || 'lesson' });
      if (payload.action === 'studentDocument') {
        const safe = await service.studentDocument(identity, payload);
        const response = await fetch(process.env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'createStudentQuizDocFromHtml', ...safe, clientToken: process.env.APPS_SCRIPT_CLIENT_TOKEN, identityBridgeToken: process.env.IDENTITY_BRIDGE_TOKEN }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) return respond(502, { error: 'Chưa tạo được tài liệu học sinh.' });
        const data = await response.json(); if (data.status !== 'success') return respond(502, { error: 'Chưa tạo được tài liệu học sinh.' });
        return respond(200, { url: data.url, fileId: data.fileId, filename: data.filename });
      }
      return respond(200, await service[payload.action](identity, payload));
    } catch (error) {
      if (error instanceof QuizError || error.status) return respond(error.status, { error: error.message });
      console.error('Server quiz failed:', error.code || error.name);
      return respond(500, { error: 'Chưa xử lý được bài. Em giữ câu trả lời và thử lại.' });
    }
  };
}

export const handler = createQuizHandler({ enabled: () => process.env.KHL_SERVER_QUIZ_ENABLED === 'true', context: firebaseServer });
