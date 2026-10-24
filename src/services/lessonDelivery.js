import { ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys.js';

export const LESSON_DELIVERY_ENABLED = import.meta.env?.VITE_SUPABASE_LESSON_SYNC_ENABLED === 'true';
export const LESSON_DELIVERY_PENDING_KEY = 'khl-lesson-delivery-pending-v1';
const ENDPOINT = '/.netlify/functions/lesson-sync';
const validId = id => typeof id === 'string' && /^[\p{L}\p{N}_&-]{1,180}$/u.test(id);

/**
 * Fire-and-forget delivery after a successful source save. State describes delivery,
 * never whether Firestore saved. Only a matching `synced` response clears pending.
 * Dependencies allow offline tests without Firebase or real browser storage.
 */
export function createLessonDeliveryClient({
  enabled = LESSON_DELIVERY_ENABLED,
  windowObject = globalThis.window,
  localStorage,
  sessionStorage,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = 20000,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  const states = new Map(), flights = new Map(), pending = new Set(), listeners = new Set();
  let activeSyncs = 0;
  const waitingSyncs = [];
  const acquireSync = () => activeSyncs < 2 ? (activeSyncs++, Promise.resolve()) : new Promise(resolve => waitingSyncs.push(resolve));
  const releaseSync = () => { const next = waitingSyncs.shift(); if (next) next(); else activeSyncs--; };
  let loaded = false, owners = 0;
  const storage = (injected, key) => {
    try { return injected === undefined ? windowObject?.[key] : injected; } catch { return null; }
  };
  const loadPending = () => {
    if (!enabled || loaded) return;
    loaded = true;
    try {
      const ids = JSON.parse(storage(localStorage, 'localStorage')?.getItem(LESSON_DELIVERY_PENDING_KEY) || '[]');
      if (Array.isArray(ids)) ids.filter(validId).forEach(id => pending.add(id));
    } catch { /* Storage may be unavailable or contain an incomplete old write. */ }
  };
  const persist = () => {
    try {
      const target = storage(localStorage, 'localStorage');
      if (pending.size) target?.setItem(LESSON_DELIVERY_PENDING_KEY, JSON.stringify([...pending]));
      else target?.removeItem(LESSON_DELIVERY_PENDING_KEY);
    } catch { /* In-memory delivery and server-side retries still work. */ }
  };
  const getLessonDeliveryState = noteId => {
    loadPending();
    if (!states.has(noteId)) states.set(noteId, Object.freeze({ noteId,
      status: !enabled ? 'disabled' : pending.has(noteId) ? 'pending' : 'idle', syncing: false, error: null }));
    return states.get(noteId);
  };
  const publish = state => {
    const snapshot = Object.freeze(state);
    states.set(state.noteId, snapshot);
    for (const listener of listeners) {
      try { listener(snapshot); } catch { /* Observers cannot turn a saved lesson into a save failure. */ }
    }
    return snapshot;
  };
  const callEndpoint = async (action, payload) => {
    const controller = new AbortController();
    let timer;
    try {
      // Bound both fetch and response-body parsing, even if a fetch shim ignores abort.
      const timeout = new Promise((_, reject) => {
        timer = setTimeoutImpl(() => {
          reject(new Error('timeout'));
          controller.abort();
        }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000);
      });
      const operation = (async () => {
        const sessions = storage(sessionStorage, 'sessionStorage');
        const body = { action, ...payload };
        const admin = sessions?.getItem(ADMIN_SERVER_SESSION_STORAGE_KEY);
        const staff = sessions?.getItem(STAFF_SERVER_SESSION_STORAGE_KEY);
        if (admin) body.adminSessionToken = admin;
        if (staff) body.staffSessionToken = staff;
        if (!admin && !staff) throw new Error('authentication_required');
        if (windowObject?.navigator?.onLine === false) throw new Error('offline');
        const response = await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal, body: JSON.stringify(body) });
        if (!response.ok) {
          const error = new Error('request_failed');
          error.status = response.status;
          throw error;
        }
        return response.json();
      })();
      return await Promise.race([operation, timeout]);
    } finally { clearTimeoutImpl(timer); }
  };
  const request = async noteId => {
    await acquireSync();
    try {
      const result = await callEndpoint('sync', { noteId });
      if (result?.noteId !== noteId || !['synced', 'stale', 'pending', 'error'].includes(result?.status)) {
        throw new Error('invalid_response');
      }
      // Do not retain arbitrary response fields, HTML, or server error text that may echo secrets.
      return { noteId, status: result.status,
        ...(typeof result.published === 'boolean' ? { published: result.published } : {}),
        ...(typeof result.contentHash === 'string' ? { contentHash: result.contentHash } : {}),
        error: result.status === 'error' ? 'sync_failed' : null };
    } catch (error) {
      if (['authentication_required', 'offline'].includes(error?.message)) {
        return { noteId, status: 'pending', error: error.message };
      }
      return { noteId, status: 'error', error: error?.message === 'timeout' ? 'timeout' : 'sync_failed' };
    } finally { releaseSync(); }
  };
  /** Authenticated source transaction. Rejects uncertain/failed saves; never auto-retries
   * writes and never stores draft content. Call notifyLessonSaved only after success.
   * Server success contract: { saved: true, status: 'pending', noteId, ... }.
   * Also accepts an explicit status:'saved' acknowledgement.
   */
  const saveLessonSource = async draft => {
    if (!enabled) throw new Error('Chức năng lưu bài qua máy chủ chưa được bật.');
    if (!validId(draft?.noteId)) throw new Error('Mã bài học không hợp lệ. Bản nháp được giữ lại.');
    try {
      const result = await callEndpoint('save', { draft });
      const saved = result?.status === 'saved' || result?.saved === true && result.status === 'pending';
      if (!saved || result.noteId !== draft.noteId) throw new Error('source_save_failed');
      return result;
    } catch (failure) {
      const status = failure?.message === 'authentication_required' ? 401 : failure?.status;
      const messages = {
        401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại; bản nháp được giữ lại.',
        409: 'Bài học vừa được người khác sửa. Bản nháp được giữ lại; tải lại bài trước khi lưu.',
        423: 'Năm học đang khóa hoặc hệ thống đang bảo trì. Bản nháp được giữ lại; vui lòng thử lại sau.',
        413: 'Bài học quá lớn. Bản nháp được giữ lại; hãy giảm dung lượng nội dung rồi lưu lại.'
      };
      const error = new Error(messages[status] || 'Chưa xác nhận được bài đã lưu. Bản nháp được giữ lại; kiểm tra lại bài trước khi thử lưu lại.');
      if (status) error.status = status;
      error.code = failure?.message === 'timeout' ? 'timeout' : 'source_save_failed';
      throw error;
    }
  };
  const enqueue = (noteId, saved) => {
    if (!enabled || !validId(noteId)) return Promise.resolve(getLessonDeliveryState(noteId));
    loadPending();
    pending.add(noteId);
    persist();
    const existing = flights.get(noteId);
    if (existing) {
      if (saved) existing.dirty = true;
      return existing.promise;
    }
    const flight = { dirty: false, promise: null };
    // Register before publishing or calling dependencies; even reentrant observers dedupe.
    flights.set(noteId, flight);
    flight.promise = Promise.resolve().then(async () => {
      for (;;) {
        // All saves before this request are covered by the latest source read.
        flight.dirty = false;
        publish({ noteId, status: 'pending', syncing: true, error: null });
        const result = await request(noteId);
        if (flight.dirty) continue;
        flights.delete(noteId);
        if (result.status === 'synced') pending.delete(noteId);
        persist();
        return publish({ ...result, syncing: false });
      }
    });
    return flight.promise;
  };
  const retryLessonDelivery = noteId => enqueue(noteId, false);
  const notifyLessonSaved = noteId => { void enqueue(noteId, true); };
  const subscribeLessonDelivery = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const retryPending = () => {
    if (!enabled) return;
    loadPending();
    for (const id of pending) void retryLessonDelivery(id);
  };
  const sessionChanged = event => {
    if (!event.key || [ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY].includes(event.key)) retryPending();
  };
  /** Shared hook lifecycle: first enabled owner retries once; final cleanup removes listeners.
   * Set hook enabled from staff/admin login state so a new login reruns startup.
   * Session storage events cover changes from another same-origin frame.
   */
  const start = () => {
    if (!enabled) return () => {};
    if (owners++ === 0) {
      windowObject?.addEventListener('online', retryPending);
      windowObject?.addEventListener('storage', sessionChanged);
      retryPending();
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (--owners === 0) {
        windowObject?.removeEventListener('online', retryPending);
        windowObject?.removeEventListener('storage', sessionChanged);
      }
    };
  };
  return { saveLessonSource, notifyLessonSaved, subscribeLessonDelivery, retryLessonDelivery, getLessonDeliveryState, start };
}

const client = createLessonDeliveryClient();
export const saveLessonSource = client.saveLessonSource;
export const notifyLessonSaved = client.notifyLessonSaved;
export const subscribeLessonDelivery = client.subscribeLessonDelivery;
export const retryLessonDelivery = client.retryLessonDelivery;
export const getLessonDeliveryState = client.getLessonDeliveryState;
export const startLessonDeliveryRetries = client.start;
