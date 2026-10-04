import { firebaseServer } from '../lib/firebaseServer.mjs';
import { verifyApiActor } from '../lib/apiActor.mjs';
import { createSystemService } from '../lib/serverSystem.mjs';
import { createGenerationService } from '../lib/generationMaintenance.mjs';
import { createMetadataMigrationService } from '../lib/metadataMigration.mjs';
async function restoreMailbox(payload) {
  const response = await fetch(process.env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'restoreMailboxFromBackup', mailboxRows: payload.mailboxRows, restoreJobId: payload.restoreJobId, restoreChecksum: payload.restoreChecksum,
      adminSessionToken: payload.adminSessionToken, clientToken: process.env.APPS_SCRIPT_CLIENT_TOKEN, identityBridgeToken: process.env.IDENTITY_BRIDGE_TOKEN }), signal: AbortSignal.timeout(25000) });
  if (!response.ok || (await response.json()).status !== 'success') throw Object.assign(new Error('Dữ liệu chính đã xong; hộp thư cần thử lại.'), { status: 502 });
}
export function createSystemHandler({ context = firebaseServer, verifyActor = verifyApiActor, fenceReady = () => process.env.KHL_MAINTENANCE_RULES_READY === 'true', mailbox = restoreMailbox } = {}) {
  return async event => {
    const respond = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(data) });
    if (event.httpMethod !== 'POST') return respond(405, { error: 'Chỉ nhận POST.' });
    try {
      if (event.isBase64Encoded || Buffer.byteLength(event.body || '') > 800000) return respond(413, { error: 'Chặng tải lên quá lớn.' });
      let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'JSON không hợp lệ.' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return respond(400, { error: 'Yêu cầu không hợp lệ.' });
      const ctx = context(), actor = await verifyActor(ctx, event, payload);
      const service = { ...createSystemService({ ...ctx, fenceReady: fenceReady(), restoreMailbox: mailbox }), ...createGenerationService(ctx), ...createMetadataMigrationService(ctx) };
      if (!Object.hasOwn(service, payload.action)) return respond(400, { error: 'Thao tác không hợp lệ.' });
      return respond(200, await service[payload.action](actor, payload));
    } catch (error) {
      if (error.status) return respond(error.status, { error: error.message, ...(error.jobId ? { jobId: error.jobId } : {}) });
      console.error('System maintenance failed:', error.code || error.name);
      return respond(500, { error: 'Công việc chưa hoàn tất. Giữ mã công việc để tiếp tục hoặc hoàn tác.', ...(error.jobId ? { jobId: error.jobId } : {}) });
    }
  };
}
export const handler = createSystemHandler();
