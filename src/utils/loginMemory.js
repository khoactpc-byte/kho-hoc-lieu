export const REMEMBERED_LOGIN_KEY = 'khl-remembered-login-v1';
const PREFERENCE_KEY = 'khl-login-preference-v1';
const storage = () => typeof window === 'undefined' ? null : window.localStorage;
export function loginPreference() {
  try { return { remember: true, username: '', ...JSON.parse(storage()?.getItem(PREFERENCE_KEY) || '{}') }; }
  catch { return { remember: true, username: '' }; }
}
export function readRememberedLogin() {
  try {
    const value = JSON.parse(storage()?.getItem(REMEMBERED_LOGIN_KEY) || 'null');
    if (!value || !/^[a-f0-9]{64}$/.test(value.token) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()) { clearRememberedLogin(); return null; }
    return value;
  } catch { return null; }
}
export function clearRememberedLogin() { try { storage()?.removeItem(REMEMBERED_LOGIN_KEY); } catch { /* Storage may be disabled. */ } }
export function saveLoginPreference(remember, username) {
  try { storage()?.setItem(PREFERENCE_KEY, JSON.stringify({ remember, username: remember ? username : '' })); } catch { /* Session login can still work. */ }
}
export function storeRememberedLogin({ rememberToken, expiresAt }) {
  if (!/^[a-f0-9]{64}$/.test(rememberToken || '') || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) throw new Error('Máy chủ chưa xác nhận phiên ghi nhớ.');
  storage()?.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ token: rememberToken, expiresAt }));
}
