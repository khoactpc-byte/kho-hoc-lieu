import { requestEssayWork } from './essayWork.js';
import { ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys.js';
import { ESSAY_CHUNK_BYTES, ESSAY_FILE_LIMIT } from '../utils/essayAnnotations.js';

const aborted = () => new DOMException('Đã đóng bài làm.', 'AbortError');
const browserSession = () => typeof window === 'undefined' ? '' : JSON.stringify([
  ADMIN_SERVER_SESSION_STORAGE_KEY, STAFF_SERVER_SESSION_STORAGE_KEY, 'khl-student-server-session-v1',
].map(key => window.sessionStorage.getItem(key) || ''));

async function download(submission, { signal, request, onProgress }) {
  const chunks = [];
  let total = 0, mimeType = '', received = 0;
  const read = async offset => {
    if (signal.aborted) throw aborted();
    const part = await request('file', { id: submission.id, fileId: submission.fileId, submittedAt: Number(submission.submittedAt) || 0, offset }, { signal });
    if (signal.aborted) throw aborted();
    if (part.fileId !== submission.fileId || part.offset !== offset || !Number.isSafeInteger(part.size) || part.size < 1 || part.size > ESSAY_FILE_LIMIT
      || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(part.mimeType) || typeof part.base64 !== 'string' || part.base64.length > ESSAY_CHUNK_BYTES * 1.4
      || offset && (part.size !== total || part.mimeType !== mimeType)) throw new Error('Tệp vừa thay đổi hoặc dữ liệu xem bài không hợp lệ. Hãy mở lại bài.');
    const binary = atob(part.base64), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (!bytes.length || bytes.length > ESSAY_CHUNK_BYTES || offset + bytes.length > part.size || bytes.length !== Math.min(ESSAY_CHUNK_BYTES, part.size - offset)) throw new Error('Chưa tải đủ tệp bài làm. Hãy thử lại.');
    chunks[offset / ESSAY_CHUNK_BYTES] = bytes; total = part.size; mimeType = part.mimeType; received += bytes.length;
    onProgress(Math.round(received / total * 100));
  };
  await read(0);
  let next = ESSAY_CHUNK_BYTES;
  const worker = async () => { while (next < total) { const offset = next; next += ESSAY_CHUNK_BYTES; await read(offset); } };
  await Promise.all(Array.from({ length: Math.min(3, Math.ceil(total / ESSAY_CHUNK_BYTES) - 1) }, worker));
  return new Blob(chunks, { type: mimeType });
}

export function createEssaySubmissionFileLoader({ request = requestEssayWork, getSessionKey = browserSession, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  let sessionKey, cachedBytes = 0;
  return async (submission, { signal, onProgress = () => {} } = {}) => {
    if (signal?.aborted) throw aborted();
    const currentSession = getSessionKey();
    if (currentSession !== sessionKey) {
      for (const entry of pending.values()) entry.controller.abort();
      pending.clear(); cache.clear(); cachedBytes = 0; sessionKey = currentSession;
    }
    const key = JSON.stringify([submission.id, submission.fileId, Number(submission.submittedAt) || 0]);
    for (const [id, entry] of cache) if (now() - entry.at > 5 * 60 * 1000) { cache.delete(id); cachedBytes -= entry.blob.size; }
    const cached = cache.get(key);
    if (cached) { cache.delete(key); cache.set(key, cached); onProgress(100); return cached.blob; }
    let entry = pending.get(key);
    if (!entry || entry.controller.signal.aborted) {
      entry = { controller: new AbortController(), listeners: new Set(), progress: 0 };
      pending.set(key, entry);
      const ownerSession = sessionKey;
      entry.promise = download(submission, { signal: entry.controller.signal, request, onProgress: progress => {
        entry.progress = progress; for (const listener of entry.listeners) listener(progress);
      } }).then(blob => {
        if (!entry.controller.signal.aborted && ownerSession === sessionKey) {
          cache.set(key, { blob, at: now() }); cachedBytes += blob.size;
          while (cache.size > 6 || cachedBytes > 32 * 1024 * 1024) {
            const oldest = cache.keys().next().value; cachedBytes -= cache.get(oldest).blob.size; cache.delete(oldest);
          }
        }
        return blob;
      }).catch(error => { entry.controller.abort(); throw error; }).finally(() => { if (pending.get(key) === entry) pending.delete(key); });
    }
    return new Promise((resolve, reject) => {
      const progress = value => onProgress(value);
      const cleanup = () => { signal?.removeEventListener('abort', cancel); entry.listeners.delete(progress); };
      const cancel = () => { cleanup(); if (!entry.listeners.size) entry.controller.abort(); reject(aborted()); };
      entry.listeners.add(progress); signal?.addEventListener('abort', cancel, { once: true });
      onProgress(entry.progress);
      entry.promise.then(blob => { cleanup(); if (signal?.aborted) reject(aborted()); else resolve(blob); }, error => { cleanup(); reject(error); });
    });
  };
}

const cachedLoader = createEssaySubmissionFileLoader();
export function loadEssaySubmissionFile(submission, options = {}) {
  // Explicit request adapters (tests/previews) never share authenticated cache entries.
  return (options.request ? createEssaySubmissionFileLoader({ request: options.request }) : cachedLoader)(submission, options);
}
