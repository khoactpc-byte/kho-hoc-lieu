import { createHash } from 'node:crypto';
export const SESSION_LEASE_MS = 120000;
export const sessionRef = (store, appId, id) => store.doc(`artifacts/${appId}/server_sessions/${id}`);
export function sessionId(appId, token) { return createHash('sha256').update(`${appId}:${token}`).digest('hex'); }

export async function issueSessionLease({ store, appId, uid, token, expiresAt, identity, now = Date.now }) {
  const stamp = now();
  if (!token || !Number.isSafeInteger(expiresAt) || expiresAt <= stamp || expiresAt > stamp + 6 * 3600000 + 5000) throw new Error('Máy chủ đăng nhập chưa cung cấp hạn phiên hợp lệ. Cập nhật Apps Script và đăng nhập lại.');
  const id = sessionId(appId, token), ref = sessionRef(store, appId, id);
  const lease = await store.runTransaction(async transaction => {
    const previous = (await transaction.get(ref)).data();
    if (previous?.revokedAt) throw new Error('Phiên đã bị thu hồi. Đăng nhập lại.');
    if (previous && previous.uid && previous.uid !== uid) throw new Error('Phiên không khớp tài khoản.');
    const originalExpiresAt = Math.min(expiresAt, previous?.originalExpiresAt || expiresAt);
    const next = { uid, identity, originalExpiresAt, expiresAt: Math.min(originalExpiresAt, stamp + SESSION_LEASE_MS), active: true, updatedAt: stamp };
    transaction.set(ref, next); return next;
  });
  return { sessionId: id, sessionExpiresAt: lease.expiresAt, originalExpiresAt: lease.originalExpiresAt };
}

export async function requireSessionLease({ store, appId }, identity, now = Date.now) {
  const id = identity.sessionId;
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw Object.assign(new Error('Đăng nhập lại để cập nhật phiên.'), { status: 401 });
  const lease = (await sessionRef(store, appId, id).get()).data();
  if (!lease?.active || lease.uid !== identity.uid || lease.originalExpiresAt <= now() || lease.expiresAt <= now()
    || lease.identity.role !== identity.role || lease.identity.sessionVersion !== identity.sessionVersion) throw Object.assign(new Error('Phiên đã hết hiệu lực. Đăng nhập lại.'), { status: 401 });
  return { ...identity, ...lease.identity, uid: identity.uid };
}

export async function revokeSessionLease(context, identity) {
  return context.store.runTransaction(async transaction => {
    const ref = sessionRef(context.store, context.appId, identity.sessionId);
    const lease = (await transaction.get(ref)).data();
    if (!lease || lease.uid !== identity.uid) throw new Error('Phiên không thuộc tài khoản.');
    transaction.set(ref, { active: false, revokedAt: Date.now() }, { merge: true });
  });
}
