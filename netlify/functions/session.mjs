import { firebaseServer, verifyStaffSession } from '../lib/firebaseServer.mjs';
import { sessionRef, SESSION_LEASE_MS, revokeSessionLease } from '../lib/sessionLease.mjs';
import { extractSchoolYearFromText } from '../../src/utils/schoolYearText.js';

export function createSessionHandler({ context = firebaseServer, verifyStaff = verifyStaffSession, now = Date.now } = {}) {
  return async event => {
    const respond = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
    if (event.httpMethod !== 'POST') return respond(405, { error: 'Chỉ nhận POST.' });
    try {
      if (event.isBase64Encoded || Buffer.byteLength(event.body || '') > 12000) return respond(413, { error: 'Yêu cầu quá lớn.' });
      let payload; try { payload = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'JSON không hợp lệ.' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return respond(400, { error: 'Yêu cầu không hợp lệ.' });
      const current = context(), { store, auth, appId } = current;
      const token = (event.headers?.authorization || event.headers?.Authorization || '').match(/^Bearer (\S+)$/)?.[1];
      if (!token) return respond(401, { error: 'Cần đăng nhập lại.' });
      const actor = await auth.verifyIdToken(token, true);
      if (actor.appId !== appId || !/^[a-f0-9]{64}$/.test(actor.sessionId || '')) return respond(403, { error: 'Phiên không thuộc ứng dụng.' });
      if (payload.action === 'revoke') { await revokeSessionLease(current, actor); return respond(200, { revoked: true }); }
      if (payload.action !== 'renew') return respond(400, { error: 'Thao tác không hợp lệ.' });
      let verified;
      if (actor.role === 'student') {
        const profile = (await store.doc(`artifacts/${appId}/public/data/students/${actor.studentId}`).get()).data();
        if (!profile || profile.status === 'dropped' || profile.accessCode !== actor.accessCode || profile.schoolCode !== actor.schoolCode
          || String(profile.grade || String(profile.className || '').match(/^\d+/)?.[0]) !== actor.grade || extractSchoolYearFromText(profile.schoolYear, '') !== actor.schoolYear) throw new Error('Hồ sơ đã thay đổi.');
      } else {
        verified = await verifyStaff(payload);
        if (verified.role !== actor.role || actor.role === 'teacher' && (verified.teacherId !== actor.teacherId || verified.sessionVersion !== actor.sessionVersion)) throw new Error('Phân công đã thay đổi.');
      }
      const result = await store.runTransaction(async transaction => {
        const ref = sessionRef(store, appId, actor.sessionId), lease = (await transaction.get(ref)).data();
        const stamp = now();
        if (!lease?.active || lease.uid !== actor.uid || lease.originalExpiresAt <= stamp) throw new Error('Phiên gốc đã hết hạn.');
        const expiresAt = Math.min(lease.originalExpiresAt, stamp + SESSION_LEASE_MS);
        transaction.set(ref, { expiresAt, updatedAt: stamp }, { merge: true });
        return { sessionExpiresAt: expiresAt, originalExpiresAt: lease.originalExpiresAt };
      });
      return respond(200, result);
    } catch {
      return respond(401, { error: 'Phiên đã hết hạn hoặc hồ sơ/phân công đã thay đổi. Đăng nhập lại.' });
    }
  };
}
export const handler = createSessionHandler();
