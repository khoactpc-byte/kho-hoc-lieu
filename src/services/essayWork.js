import { ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys.js';
export async function requestEssayWork(action, payload, { fetchImpl = fetch, sessionStorage = window.sessionStorage, signal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
  const abort = () => controller.abort();
  if (signal?.aborted) { clearTimeout(timer); throw new DOMException('Đã hủy xem bài.', 'AbortError'); }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetchImpl('/.netlify/functions/essay-work', { method: 'POST', cache: 'no-store', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action, adminSessionToken: sessionStorage.getItem(ADMIN_SERVER_SESSION_STORAGE_KEY) || '', staffSessionToken: sessionStorage.getItem(STAFF_SERVER_SESSION_STORAGE_KEY) || '', studentSessionToken: sessionStorage.getItem('khl-student-server-session-v1') || '' }), signal: controller.signal });
    let result;
    try { result = await response.json(); } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw Object.assign(new Error('Máy chủ trả về trang web thay vì dữ liệu bài làm. Cần kiểm tra kết nối backend; bài nộp vẫn được giữ.', { cause: error }), { code: 'invalid_api_response' });
    }
    if (!response.ok) {
      const requiresUpdate = action === 'file' && response.status === 400 && /thao tác không hợp lệ|unsupported action|invalid action/i.test(result?.error || '');
      const message = requiresUpdate ? 'Máy chủ chưa được cập nhật chức năng xem bài trong web. Cần cập nhật backend và Apps Script; bạn vẫn có thể mở tệp gốc.'
        : response.status === 401 ? 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại; bản nháp vẫn được giữ.'
          : result?.error || 'Chưa xử lý được bài. Bản nháp vẫn được giữ.';
      throw Object.assign(new Error(message), { status: response.status, ...(requiresUpdate ? { code: 'backend_update_required' } : {}) });
    }
    return result;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Đã hủy xem bài.', 'AbortError');
    if (timedOut) throw new Error('Máy chủ phản hồi quá lâu. Bản nháp vẫn được giữ; hãy thử lại.', { cause: error });
    if (error instanceof TypeError) throw new Error('Chưa kết nối được máy chủ. Kiểm tra mạng rồi thử lại; bài nộp vẫn được giữ.', { cause: error });
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
