import { STAFF_SERVER_SESSION_STORAGE_KEY } from './helpers';

export const ADMIN_SESSION_STORAGE_KEY = 'khl-admin-session-v1';
export const ADMIN_SERVER_SESSION_STORAGE_KEY = 'khl-admin-server-session-v1';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const readStoredAdminSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const session = JSON.parse(window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || 'null');
    if (!session || Number(session.expiresAt || 0) <= Date.now()) {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    const hasRequiredServerSession = session.scope === 'thd'
      ? Boolean(window.sessionStorage.getItem(STAFF_SERVER_SESSION_STORAGE_KEY))
      : Boolean(window.sessionStorage.getItem(ADMIN_SERVER_SESSION_STORAGE_KEY));
    if (!hasRequiredServerSession) {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    return null;
  }
};

export const writeStoredAdminSession = (adminModule = 'thcs', scope = 'full') => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify({
    module: adminModule || 'thcs',
    scope: scope === 'thd' ? 'thd' : 'full',
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS
  }));
};

export const clearStoredAdminSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(ADMIN_SERVER_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(STAFF_SERVER_SESSION_STORAGE_KEY);
};
