import { firebaseStore } from '../lib/firebaseStore.mjs';
import { createEssayWorkService, essayWorkerAuthorized } from '../lib/essayWork.mjs';
export const handler = async event => {
  if (event.httpMethod !== 'POST' || !essayWorkerAuthorized(event.headers?.['x-essay-worker'] || event.headers?.['X-Essay-Worker'], process.env.IDENTITY_BRIDGE_TOKEN)) return { statusCode: 403, body: '' };
  let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: '' }; }
  if (!Array.isArray(payload.ids) || !payload.ids.length || payload.ids.length > 2) return { statusCode: 400, body: '' };
  const service = createEssayWorkService(firebaseStore());
  const stopAt = Date.now() + 10 * 60 * 1000;
  for (const id of payload.ids) {
    try { await service.grade(id); } catch (error) { console.error('Essay job not processed:', error.status || error.name); }
  }
  for (let batch = 0; batch < 5; batch++) {
    const ids = await service.pendingIds();
    if (!ids.length) break;
    let processed = false;
    for (const id of ids) {
      if (Date.now() >= stopAt) break;
      try { const result = await service.grade(id); processed ||= result.status !== 'skipped'; } catch (error) { console.error('Essay queue waiting:', error.status || error.name); }
    }
    if (!processed) break;
  }
  return { statusCode: 200, body: '' };
};
