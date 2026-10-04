import { auth } from '../config/firebase';
import { ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';

// Roll out together with scoped identity, staged Rules and the server endpoints.
export const SERVER_QUIZ_ENABLED = SCOPED_AUTH_ENABLED && import.meta.env.VITE_SERVER_QUIZ_ENABLED === 'true';

export async function requestPrivateApi(endpoint, action, payload, { signal, timeoutMs = 30000 } = {}) {
  if (!['quiz', 'data', 'system', 'session'].includes(endpoint)) throw new Error('Địa chỉ máy chủ không hợp lệ.');
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Cần đăng nhập lại để dùng chức năng này.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  const requireCurrent = () => {
    if (controller.signal.aborted || auth.currentUser !== user) throw new DOMException('Phiên hoặc màn hình đã thay đổi.', 'AbortError');
  };
  const untilAbort = operation => new Promise((resolve, reject) => {
    const onAbort = () => {
      controller.signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Yêu cầu đã hủy hoặc hết thời gian chờ.', 'AbortError'));
    };
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    Promise.resolve(operation).then(value => {
      controller.signal.removeEventListener('abort', onAbort); resolve(value);
    }, error => {
      controller.signal.removeEventListener('abort', onAbort); reject(error);
    });
  });
  try {
    requireCurrent();
    const token = await untilAbort(user.getIdToken());
    requireCurrent();
    const response = await untilAbort(fetch(`/.netlify/functions/${endpoint}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal: controller.signal,
      body: JSON.stringify({ ...payload, action,
        adminSessionToken: window.sessionStorage.getItem(ADMIN_SERVER_SESSION_STORAGE_KEY) || '',
        staffSessionToken: window.sessionStorage.getItem(STAFF_SERVER_SESSION_STORAGE_KEY) || '' }) }));
    let data;
    try { data = await untilAbort(response.json()); } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Máy chủ chưa phản hồi đúng. Giữ nội dung đang làm để thử lại.', { cause: error });
    }
    requireCurrent();
    if (!response.ok) {
      const error = new Error(data.error || 'Chưa xử lý được yêu cầu. Giữ nội dung đang làm để thử lại.');
      error.status = response.status;
      if (data.jobId) error.jobId = data.jobId;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

export const requestServerQuiz = (action, payload, options) => requestPrivateApi('quiz', action, payload, options);
