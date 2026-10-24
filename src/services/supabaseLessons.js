const env = import.meta.env || {};
const configuredUrl = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const configuredKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '');

export const SUPABASE_LESSONS_ENABLED = env.VITE_SUPABASE_LESSONS_ENABLED === 'true'
  && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(configuredUrl)
  && configuredKey.length > 20;

export function createSupabaseLessonReader({ url = configuredUrl, key = configuredKey, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const baseUrl = String(url || '').replace(/\/$/, '');
  const publishableKey = String(key || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl) || !publishableKey) {
    return { read: async () => null, clear() {} };
  }
  const requests = new Map();
  const read = (noteId, { signal, schoolYear = '', schoolCode = '', grade = '' } = {}) => {
    if (!/^[\p{L}\p{N}_&-]{3,180}$/u.test(String(noteId || ''))) return Promise.resolve(null);
    if (schoolYear && !/^\d{4}-\d{4}$/.test(schoolYear) || schoolCode && !/^[A-Z0-9_-]{1,20}$/.test(schoolCode) || grade && !/^[1-9]$/.test(String(grade))) return Promise.resolve(null);
    const cacheKey = JSON.stringify([noteId, schoolYear, schoolCode, String(grade)]);
    if (!signal && requests.has(cacheKey)) return requests.get(cacheKey);
    const query = new URLSearchParams({
      select: 'note_id,html,layout_mode,source_updated_at,updated_at,content_hash,school_year,school_code,grade',
      note_id: `eq.${noteId}`,
      published: 'eq.true',
      limit: '1'
    });
    if (schoolYear) query.set('school_year', `eq.${schoolYear}`);
    if (schoolCode) query.set('school_code', `eq.${schoolCode}`);
    if (grade) query.set('grade', `eq.${grade}`);
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    const request = Promise.resolve().then(() => fetchImpl(`${baseUrl}/rest/v1/lesson_public?${query}`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, Accept: 'application/json' },
      signal: controller.signal
    })).then(async response => {
      if (!response.ok) throw new Error(`Supabase lesson request failed (${response.status}).`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Phản hồi bài học không hợp lệ.');
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.note_id !== noteId) throw new Error('Bài tải về không đúng mã yêu cầu.');
      if (row && (schoolYear && row.school_year !== schoolYear || schoolCode && row.school_code !== schoolCode || grade && String(row.grade) !== String(grade))) throw new Error('Bài tải về không đúng năm học hoặc lớp đang chọn.');
      return row ? { noteId: row.note_id, content: row.html || '', layoutMode: row.layout_mode,
        sourceUpdatedAt: row.source_updated_at, updatedAt: row.updated_at, contentHash: row.content_hash } : null;
    }).catch(error => {
      if (controller.signal.aborted && !signal?.aborted) throw new Error('Tải bài quá lâu. Vui lòng thử lại.');
      throw error;
    }).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort); });
    if (!signal) {
      requests.set(cacheKey, request);
      request.catch(() => { if (requests.get(cacheKey) === request) requests.delete(cacheKey); });
    }
    return request;
  };
  return { read, clear: noteId => { if (!noteId) requests.clear(); else for (const key of requests.keys()) if (JSON.parse(key)[0] === noteId) requests.delete(key); } };
}

const defaultReader = createSupabaseLessonReader();
export const readSupabaseStudentLesson = (noteId, options) => defaultReader.read(noteId, options);

// Compact metadata keeps lesson notices working without downloading lesson bodies.
export async function readPublishedLessonIndex({ schoolCode, schoolYear, grade, signal, fetchImpl = fetch } = {}) {
  if (!/^[A-Z0-9_-]{1,20}$/.test(schoolCode || '') || !/^\d{4}-\d{4}$/.test(schoolYear || '') || !/^[1-9]$/.test(String(grade || ''))) return [];
  const query = new URLSearchParams({ select: 'note_id,school_code,school_year,grade,subject,lesson,source_updated_at',
    school_code: `eq.${schoolCode}`, school_year: `eq.${schoolYear}`, grade: `eq.${grade}`, published: 'eq.true', limit: '1000' });
  const response = await fetchImpl(`${configuredUrl}/rest/v1/lesson_public?${query}`, { headers: { apikey: configuredKey, Authorization: `Bearer ${configuredKey}` }, signal });
  if (!response.ok) throw new Error('Chưa tải được danh mục bài học.');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length >= 1000) throw new Error('Danh mục bài học cần được kiểm tra lại.');
  return rows.map(row => ({ id: row.note_id, schoolCode: row.school_code, schoolYear: row.school_year,
    grade: row.grade, subject: row.subject, lesson: String(row.lesson), updatedAt: row.source_updated_at, hasContent: true }));
}

