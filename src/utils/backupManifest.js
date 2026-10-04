export const BACKUP_COLLECTIONS = ['students', 'scorebooks', 'class_attendance', 'class_timetables',
  'class_schedules', 'news', 'student_profile_requests', 'admission_applications', 'materials',
  'lesson_notes', 'lesson_quizzes', 'quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions', 'student_code_registry', 'student_code_counters', 'student_sync_jobs', 'student_archives', 'school_year_jobs', 'schedule_publications'];
const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function validateRestoreSnapshot(snapshot) {
  if (snapshot?.version === 3) {
    if (snapshot.manifest?.scope !== 'firestore-full-graph' || !Array.isArray(snapshot.chunks) || !snapshot.chunks.length
      || snapshot.chunks.length !== snapshot.manifest.checksums?.length || snapshot.chunks.some(part => typeof part?.json !== 'string')) throw new Error('Bản sao lưu đầy đủ thiếu mảnh hoặc danh mục.');
    return snapshot;
  }
  if (!isObject(snapshot) || ![1, 2].includes(snapshot.version) || !isObject(snapshot.collections)) {
    throw new Error('Bản sao lưu thiếu phiên bản hoặc danh mục dữ liệu hợp lệ. Chưa thay đổi dữ liệu.');
  }
  const names = Object.keys(snapshot.collections);
  if (!names.length || names.some(name => !BACKUP_COLLECTIONS.includes(name))) throw new Error('Danh mục sao lưu không được hỗ trợ.');
  for (const name of names) {
    const rows = snapshot.collections[name];
    if (!Array.isArray(rows)) throw new Error(`Dữ liệu ${name} không phải danh sách.`);
    const ids = new Set();
    for (const row of rows) {
      if (!isObject(row) || typeof row.id !== 'string' || !row.id || row.id.includes('/')
        || ['.', '..', '__proto__', 'constructor', 'prototype'].includes(row.id)
        || new TextEncoder().encode(row.id).length > 1500 || ids.has(row.id)) {
        throw new Error(`Mã dữ liệu ${name} không hợp lệ hoặc bị lặp.`);
      }
      ids.add(row.id);
    }
    if (snapshot.version === 2 && snapshot.manifest?.counts?.[name] !== rows.length) {
      throw new Error(`Số lượng ${name} không khớp danh mục sao lưu.`);
    }
  }
  if (snapshot.settings !== undefined && !isObject(snapshot.settings)) throw new Error('Thiết lập sao lưu không hợp lệ.');
  if (snapshot.teachingAssignments !== undefined && !isObject(snapshot.teachingAssignments)) throw new Error('Phân công sao lưu không hợp lệ.');
  return snapshot;
}

export function validateMailboxBackup(backup) {
  if (!Object.hasOwn(backup || {}, 'mailboxRows')) return false;
  if (!Array.isArray(backup.mailboxRows) || backup.mailboxRows.some(row => !Array.isArray(row) || row.length !== 12)) {
    throw new Error('Dữ liệu hộp thư sao lưu không hợp lệ.');
  }
  return true;
}

// Writes are applied before pruning. A large restore is refused until a server-side
// resumable restore exists; no unprotected sequence of partial batches is called safe.
export function buildAtomicRestorePlan(snapshot, existing) {
  validateRestoreSnapshot(snapshot);
  const operations = [];
  for (const [name, rows] of Object.entries(snapshot.collections)) {
    const desired = new Set(rows.map(row => row.id));
    rows.forEach(({ id, ...data }) => operations.push({ type: 'set', name, id, data }));
    (existing[name] || []).filter(id => !desired.has(id)).forEach(id => operations.push({ type: 'delete', name, id }));
  }
  if (operations.length > 350) {
    throw new Error('Bản phục hồi vượt giới hạn giao dịch an toàn tại trình duyệt. Chưa ghi/xóa dữ liệu; cần công cụ phục hồi trên máy chủ.');
  }
  return operations;
}
