import { browserSessionPersistence, setPersistence, signInAnonymously, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
export const SCOPED_AUTH_ENABLED = import.meta.env?.VITE_SCOPED_AUTH_ENABLED === 'true';
export const STUDENT_SESSION_KEY = 'khl-student-server-session-v1';
let revision = 0;
let pendingRequest;
let authQueue = Promise.resolve();
const mutateAuth = action => {
  const pending = authQueue.then(action);
  authQueue = pending.catch(() => undefined);
  return pending;
};

export function resetScopedIdentity() {
  revision += 1;
  pendingRequest?.abort();
  pendingRequest = null;
  return mutateAuth(async () => {
    const previous = auth.currentUser;
    if (previous && !previous.isAnonymous && previous.getIdToken) {
      try {
        const token = await previous.getIdToken();
        await fetch('/.netlify/functions/session', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'revoke' }), signal: AbortSignal.timeout(5000) });
      } catch { /* Lease expires within two minutes if offline. Local logout still completes. */ }
    }
    await signOut(auth);
    await signInAnonymously(auth);
  });
}

export async function exchangeScopedIdentity(payload, { signal, timeoutMs = 25000 } = {}) {
  const requestRevision = ++revision;
  pendingRequest?.abort();
  const controller = new AbortController();
  pendingRequest = controller;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  const requireCurrent = () => {
    if (requestRevision !== revision || controller.signal.aborted) throw new DOMException('Phiên đăng nhập đã hủy.', 'AbortError');
  };
  try {
    const response = await fetch('/.netlify/functions/identity', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await response.json();
    if (!response.ok || !data.firebaseToken) throw new Error(data.error || 'Không xác thực được phiên.');
    await mutateAuth(async () => {
      requireCurrent();
      let signInStarted = false;
      try {
        await setPersistence(auth, browserSessionPersistence);
        requireCurrent();
        signInStarted = true;
        await signInWithCustomToken(auth, data.firebaseToken);
        requireCurrent();
        if (data.studentSessionToken) window.sessionStorage.setItem(STUDENT_SESSION_KEY, data.studentSessionToken);
      } catch (error) {
        // Auth sign-in itself is not abortable. Revoke a late token before releasing
        // the queue to a newer login, including cancellation without a logout.
        if (signInStarted) {
          window.sessionStorage.removeItem(STUDENT_SESSION_KEY);
          await signOut(auth);
        }
        throw error;
      }
    });
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (pendingRequest === controller) pendingRequest = null;
  }
}
