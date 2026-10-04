import { firebaseServer } from '../lib/firebaseServer.mjs';
import { verifyApiActor } from '../lib/apiActor.mjs';
import { createDataService } from '../lib/serverData.mjs';

async function verifySubmissionFile(actor, submission) {
  const response = await fetch(process.env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'verifyStudentUpload', studentId: actor.studentId, accessCode: actor.accessCode, fileId: submission.fileId, uploadReceipt: submission.uploadReceipt,
      clientToken: process.env.APPS_SCRIPT_CLIENT_TOKEN, identityBridgeToken: process.env.IDENTITY_BRIDGE_TOKEN }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Object.assign(new Error('Chưa xác nhận được tệp bài nộp.'), { status: 502 });
  const data = await response.json();
  if (data.status !== 'success') throw Object.assign(new Error('Tệp không thuộc lượt tải của em hoặc đã hết hạn. Tải lại tệp.'), { status: 403 });
  return data.file;
}
export function createDataHandler({ context = firebaseServer, verifyActor = verifyApiActor, verifyFile = verifySubmissionFile } = {}) {
  return async event => {
    const respond = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(data) });
    if (event.httpMethod !== 'POST') return respond(405, { error: 'Chỉ nhận POST.' });
    try {
      if (event.isBase64Encoded || Buffer.byteLength(event.body || '') > 800000) return respond(413, { error: 'Yêu cầu quá lớn.' });
      let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'JSON không hợp lệ.' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return respond(400, { error: 'Yêu cầu không hợp lệ.' });
      const ctx = context(), actor = await verifyActor(ctx, event, payload);
      const service = createDataService({ ...ctx, verifySubmissionFile: verifyFile });
      if (!Object.hasOwn(service, payload.action)) return respond(400, { error: 'Thao tác không hợp lệ.' });
      return respond(200, await service[payload.action](actor, payload));
    } catch (error) {
      if (error.status) return respond(error.status, { error: error.message });
      console.error('Private data failed:', error.code || error.name);
      return respond(500, { error: 'Chưa lưu được dữ liệu. Giữ bản nháp và thử lại.' });
    }
  };
}
export const handler = createDataHandler();
