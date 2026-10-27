import { collection, getDocsFromServer, query, where } from 'firebase/firestore';
import { appId, auth, db } from '../config/firebase';
import { ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys';
import { exchangeScopedIdentity, SCOPED_AUTH_ENABLED, STUDENT_SESSION_KEY } from './scopedIdentity';
import { clearRememberedLogin, readRememberedLogin, saveLoginPreference, storeRememberedLogin } from '../utils/loginMemory';

const keys = { adminSessionToken: ADMIN_SERVER_SESSION_STORAGE_KEY, staffSessionToken: STAFF_SERVER_SESSION_STORAGE_KEY, studentSessionToken: STUDENT_SESSION_KEY };
const sessionTokens = () => Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, window.sessionStorage.getItem(key) || '']));
let lastBrowserLoginAt = 0;
export const browserLoginLastCheckedAt = () => lastBrowserLoginAt;
export const hasBrowserLogin = () => !!readRememberedLogin() || Object.values(sessionTokens()).some(Boolean);
export async function requestBrowserLogin(payload, { signal, timeoutMs = 25000 } = {}) {
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch('/.netlify/functions/remember-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    let result; try { result = await response.json(); } catch { throw new Error('Máy chủ chưa hỗ trợ ghi nhớ đăng nhập.'); }
    if (!response.ok) throw Object.assign(new Error(result.error || 'Chưa khôi phục được đăng nhập.'), { status: response.status });
    return result;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function rememberBrowserLogin({ remember, username, isCurrent = () => true, signal, notify = () => {} }) {
  lastBrowserLoginAt = Date.now();
  saveLoginPreference(remember, username);
  if (!remember) { clearRememberedLogin(); return; }
  try {
    const result = await requestBrowserLogin({ action: 'create', ...sessionTokens() }, { signal });
    if (!isCurrent()) { await requestBrowserLogin({ action: 'forget', rememberToken: result.rememberToken }, { timeoutMs: 5000 }).catch(() => {}); return; }
    storeRememberedLogin(result);
  } catch (error) {
    if (isCurrent() && error.name !== 'AbortError') notify('Đã đăng nhập, nhưng chưa lưu được phiên ghi nhớ. Máy chủ cần được cập nhật hoặc kết nối lại.', 'error');
  }
}
export function forgetBrowserLogin() {
  const saved = readRememberedLogin();
  clearRememberedLogin();
  if (saved) void requestBrowserLogin({ action: 'forget', rememberToken: saved.token }, { timeoutMs: 5000 }).catch(() => {});
}
export async function restoreBrowserLogin({ signal, isCurrent = () => true } = {}) {
  const saved = readRememberedLogin(), tokens = sessionTokens();
  if (!saved && !Object.values(tokens).some(Boolean)) return null;
  let result;
  try { result = await requestBrowserLogin({ action: 'restore', ...(saved ? { rememberToken: saved.token } : tokens) }, { signal }); }
  catch (error) { if (error.status === 401) { clearRememberedLogin(); Object.values(keys).forEach(key => window.sessionStorage.removeItem(key)); } throw error; }
  if (!isCurrent() || signal?.aborted) throw new DOMException('Đã hủy khôi phục đăng nhập.', 'AbortError');
  let student;
  if (result.role === 'student') {
    if (SCOPED_AUTH_ENABLED) {
      const verified = await exchangeScopedIdentity({ kind: 'student-session', accessCode: result.studentProfile.accessCode, studentSessionToken: result.studentSessionToken }, { signal, remember: !!saved });
      student = verified.student;
    } else {
      const snapshot = await getDocsFromServer(query(collection(db, 'artifacts', appId, 'public', 'data', 'students'), where('accessCode', '==', result.studentProfile.accessCode)));
      const matches = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.status !== 'dropped' && item.schoolYear === result.studentProfile.schoolYear);
      if (matches.length !== 1) throw new Error('Hồ sơ học sinh cần được đối chiếu trước khi khôi phục đăng nhập.');
      student = matches[0];
    }
  } else if (['admin', 'thd', 'teacher'].includes(result.role)) {
    if (SCOPED_AUTH_ENABLED) await exchangeScopedIdentity({ kind: 'staff', adminSessionToken: result.adminSessionToken, staffSessionToken: result.staffSessionToken }, { signal, remember: !!saved });
  } else throw new Error('Phiên đăng nhập không hợp lệ.');
  if (!isCurrent() || signal?.aborted) throw new DOMException('Đã hủy khôi phục đăng nhập.', 'AbortError');
  Object.entries(keys).forEach(([name, key]) => { if (result[name]) window.sessionStorage.setItem(key, result[name]); else window.sessionStorage.removeItem(key); });
  const claims = SCOPED_AUTH_ENABLED ? (await auth.currentUser.getIdTokenResult()).claims : null;
  lastBrowserLoginAt = Date.now();
  return { ...result, student, claims };
}
