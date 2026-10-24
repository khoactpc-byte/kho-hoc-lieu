import { ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys.js';
export async function requestEssayWork(action, payload, { fetchImpl = fetch, sessionStorage = window.sessionStorage } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetchImpl('/.netlify/functions/essay-work', { method: 'POST', cache: 'no-store', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action, adminSessionToken: sessionStorage.getItem(ADMIN_SERVER_SESSION_STORAGE_KEY) || '', staffSessionToken: sessionStorage.getItem(STAFF_SERVER_SESSION_STORAGE_KEY) || '', studentSessionToken: sessionStorage.getItem('khl-student-server-session-v1') || '' }), signal: controller.signal });
    let result; try { result = await response.json(); } catch { throw new Error('Chưa kết nối được máy chủ chấm nền. Bài nộp vẫn được giữ.'); }
    if (!response.ok) throw new Error(result.error || 'Chưa xử lý được bài. Bản nháp vẫn được giữ.');
    return result;
  } finally { clearTimeout(timer); }
}
