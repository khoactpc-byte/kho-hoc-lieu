import { createHash } from 'node:crypto';
import { firebaseServer } from '../lib/firebaseServer.mjs';
import { eligibleStudentProfiles, selectStudentIdentity } from '../../src/utils/studentIdentitySelection.js';
import { extractSchoolYearFromText } from '../../src/utils/schoolYearText.js';
import { issueSessionLease } from '../lib/sessionLease.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export async function handler(event) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const respond = (statusCode, data) => ({ statusCode, headers, body: JSON.stringify(data) });
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Chỉ nhận POST.' });
  try {
    if ((event.body || '').length > 12000) return respond(413, { error: 'Yêu cầu quá lớn.' });
    const payload = JSON.parse(event.body || '{}');
    const { store, auth, appId } = firebaseServer();
    const root = `artifacts/${appId}/public/data`;
    const bridgeToken = process.env.IDENTITY_BRIDGE_TOKEN;
    const mainUrl = process.env.APPS_SCRIPT_URL;
    const clientToken = process.env.APPS_SCRIPT_CLIENT_TOKEN;
    if (!bridgeToken || !mainUrl || !clientToken) throw new Error('Máy chủ chưa cấu hình xác thực Apps Script.');
    const call = async data => {
      const response = await fetch(mainUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...data, clientToken, identityBridgeToken: bridgeToken }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Chưa kết nối được máy chủ xác thực.');
      const result = await response.json();
      if (result.status !== 'success') throw new Error(result.message || 'Phiên không hợp lệ.');
      return result;
    };
    let claims; let uid; let student; let studentSessionToken; let leaseToken; let originalExpiresAt;
    if (payload.kind === 'student') {
      const code = String(payload.accessCode || '').trim().toUpperCase();
      if (!/^HS\d{3,15}$/.test(code)) return respond(401, { error: 'Mã học sinh không hợp lệ.' });
      const ip = event.headers?.['x-nf-client-connection-ip'] || 'unknown';
      const rateRef = store.collection('identity_attempts').doc(hash(`${ip}:student`));
      const allowed = await store.runTransaction(async transaction => {
        const previous = (await transaction.get(rateRef)).data() || {};
        const now = Date.now();
        const count = previous.until > now ? Number(previous.count || 0) : 0;
        if (count >= 240) return false;
        transaction.set(rateRef, { count: count + 1, until: previous.until > now ? previous.until : now + 900000 });
        return true;
      });
      if (!allowed) return respond(429, { error: 'Thử đăng nhập quá nhiều lần. Hãy thử lại sau 15 phút.' });
      const result = await store.collection(`${root}/students`).where('accessCode', '==', code).limit(16).get();
      if (result.docs.length > 15) return respond(409, { error: 'Có quá nhiều hồ sơ cùng mã. Cần giáo viên đối soát.' });
      let records = result.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.status !== 'dropped');
      if (!records.length) return respond(401, { error: 'Không tìm thấy học sinh đang học.' });
      const settings = (await store.doc(`${root}/settings/global`).get()).data() || {};
      student = selectStudentIdentity(records, settings.schoolYear);
      const stableKey = student.studentKey || student.accessCode;
      const siblings = await store.collection(`${root}/students`).where('studentKey', '==', stableKey).limit(16).get();
      const aliases = /^HS\d+$/.test(stableKey) ? await store.collection(`${root}/students`).where('accessCode', '==', stableKey).limit(16).get() : { docs: [] };
      if (siblings.docs.length > 15 || aliases.docs.length > 15) return respond(409, { error: 'Định danh có quá nhiều hồ sơ. Cần đối soát.' });
      records = [...new Map([...records, ...siblings.docs.map(item => ({ ...item.data(), id: item.id })), ...aliases.docs.map(item => ({ ...item.data(), id: item.id }))].map(item => [item.id, item])).values()];
      uid = `student_${hash(`${appId}:${student.studentKey || code}`).slice(0, 40)}`;
      claims = { role: 'student', appId, studentId: student.id, accessCode: code, schoolYear: extractSchoolYearFromText(student.schoolYear, ''),
        studentIds: eligibleStudentProfiles(records, settings.schoolYear).map(item => item.id),
        grade: String(student.className || '').match(/^[1-9]\d*/)?.[0] || String(student.grade || ''), schoolCode: student.schoolCode || 'UNKNOWN', className: student.className || '' };
      const session = await call({ action: 'createVerifiedStudentSession', student: { id: student.id, accessCode: code,
        fullName: student.fullName || '', className: student.className || '', schoolYear: student.schoolYear || '', schoolCode: student.schoolCode || '' } });
      studentSessionToken = session.studentSessionToken;
      leaseToken = studentSessionToken; originalExpiresAt = Number(session.expiresAt);
      claims.studentKey = student.studentKey || student.accessCode;
    } else if (payload.kind === 'staff') {
      const verified = await call({ action: 'getSessionIdentity', adminSessionToken: payload.adminSessionToken || '', staffSessionToken: payload.staffSessionToken || '' });
      const identity = verified.identity;
      leaseToken = payload.adminSessionToken || payload.staffSessionToken;
      originalExpiresAt = Number(identity?.expiresAt);
      if (!['admin', 'teacher', 'thd'].includes(identity?.role)) return respond(401, { error: 'Vai trò không hợp lệ.' });
      claims = identity.role === 'teacher' ? { role: 'teacher', appId, teacherId: identity.teacherId,
        schoolCode: identity.schoolCode, grades: identity.grades, subjects: identity.subjects, sessionVersion: identity.sessionVersion }
        : { role: identity.role, appId };
      uid = identity.role === 'teacher' ? `teacher_${hash(`${appId}:${identity.teacherId}`).slice(0, 40)}`
        : `staff_${hash(`${appId}:${identity.role}`).slice(0, 40)}`;
    } else return respond(400, { error: 'Loại đăng nhập không hợp lệ.' });
    const lease = await issueSessionLease({ store, appId, uid, token: leaseToken, expiresAt: originalExpiresAt, identity: claims });
    const firebaseToken = await auth.createCustomToken(uid, { ...claims, sessionId: lease.sessionId });
    return respond(200, { firebaseToken, ...lease, ...(student ? { student, studentSessionToken } : {}) });
  } catch (error) {
    // Never include service-account credentials or remote response bodies in logs/client errors.
    console.error('Identity exchange failed:', error.code || error.name);
    return respond(401, { error: 'Chưa xác thực được phiên. Kiểm tra cấu hình máy chủ hoặc đăng nhập lại.' });
  }
}
