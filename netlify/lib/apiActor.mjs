import { requireSessionLease } from './sessionLease.mjs';
import { verifyStaffSession } from './firebaseServer.mjs';

export async function verifyApiActor(context, event, payload, { verifyStaff = verifyStaffSession, requireLease = requireSessionLease } = {}) {
  const token = (event.headers?.authorization || event.headers?.Authorization || '').match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw Object.assign(new Error('Cần đăng nhập lại.'), { status: 401 });
  let identity;
  try { identity = await context.auth.verifyIdToken(token, true); }
  catch { throw Object.assign(new Error('Phiên đã hết hiệu lực.'), { status: 401 }); }
  if (!identity.uid || identity.appId !== context.appId) throw Object.assign(new Error('Phiên không thuộc ứng dụng.'), { status: 403 });
  identity = await requireLease(context, identity);
  if (['admin', 'teacher', 'thd'].includes(identity.role)) {
    let current;
    try { current = await verifyStaff(payload); }
    catch { throw Object.assign(new Error('Phiên nhân viên đã hết hiệu lực.'), { status: 401 }); }
    if (current.role !== identity.role || current.role === 'teacher' && (current.teacherId !== identity.teacherId || current.sessionVersion !== identity.sessionVersion)) throw Object.assign(new Error('Tài khoản hoặc phân công đã thay đổi.'), { status: 403 });
    return { ...identity, ...current };
  }
  if (identity.role !== 'student') throw Object.assign(new Error('Vai trò không hợp lệ.'), { status: 403 });
  return identity;
}
