import { useEffect } from 'react';
import { requestPrivateApi } from '../services/serverQuizClient';
import { SCOPED_AUTH_ENABLED } from '../services/scopedIdentity';

// Server grants at most two minutes; renewal cannot extend the original login.
export function useSessionLease(user, identity, onExpired, notify) {
  const uid = user?.uid, sessionId = identity?.sessionId;
  useEffect(() => {
    if (!SCOPED_AUTH_ENABLED || !uid || !sessionId) return undefined;
    const controller = new AbortController();
    let busy = false, active = true;
    const renew = async () => {
      if (busy || !active) return;
      busy = true;
      try { await requestPrivateApi('session', 'renew', {}, { signal: controller.signal, timeoutMs: 20000 }); }
      catch (error) {
        if (active && [401, 403].includes(error.status)) {
          active = false; notify('Phiên đã hết hiệu lực. Vui lòng đăng nhập lại.', 'error');
          await onExpired();
        }
      } finally { busy = false; }
    };
    const visible = () => { if (document.visibilityState === 'visible') void renew(); };
    const timer = setInterval(() => { void renew(); }, 45000);
    document.addEventListener('visibilitychange', visible);
    void renew();
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [uid, sessionId, onExpired, notify]);
}
