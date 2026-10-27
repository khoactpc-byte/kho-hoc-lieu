export const ESSAY_MARK_LIMIT = 300;
export const ESSAY_POINT_LIMIT = 10000;
export const ESSAY_FILE_LIMIT = 25 * 1024 * 1024;
export const ESSAY_CHUNK_BYTES = 768 * 1024;
export const ESSAY_ANNOTATION_BYTES = 100000;
const invalid = message => Object.assign(new Error(message), { status: 400 });
export const emptyEssayAnnotations = submission => ({ version: 1, fileId: String(submission.fileId || ''), submittedAt: Number(submission.submittedAt) || 0, pages: {} });

export function validateEssayAnnotations(value, submission) {
  if (!value || value.version !== 1 || value.fileId !== submission.fileId || value.submittedAt !== (Number(submission.submittedAt) || 0)
    || !value.pages || Array.isArray(value.pages) || typeof value.pages !== 'object') throw invalid('Nét chấm không khớp tệp bài nộp. Hãy mở lại bài.');
  const pages = {};
  let count = 0, points = 0;
  for (const [page, marks] of Object.entries(value.pages)) {
    if (!/^[1-9]\d?$|^100$/.test(page) || !Array.isArray(marks)) throw invalid('Trang chấm không hợp lệ.');
    pages[page] = marks.map(mark => {
      if (++count > ESSAY_MARK_LIMIT || !mark || !['pen', 'tick', 'cross', 'text'].includes(mark.kind)
        || !['#dc2626', '#2563eb', '#16a34a'].includes(mark.color) || !Number.isFinite(mark.width) || mark.width < 1 || mark.width > 10
        || !Array.isArray(mark.points) || !mark.points.length || mark.points.length > 1500 || (points += mark.points.length) > ESSAY_POINT_LIMIT) throw invalid('Nét chấm quá lớn hoặc không hợp lệ. Hãy giảm bớt nét vẽ.');
      const cleanPoints = mark.points.map(p => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1000 || p.y < 0 || p.y > 1000) throw invalid('Vị trí nét chấm không hợp lệ.');
        return { x: Math.round(p.x), y: Math.round(p.y) };
      });
      const text = String(mark.text || '').trim();
      if (mark.kind === 'text' && (!text || text.length > 180)) throw invalid('Ghi chú trên bài tối đa 180 ký tự.');
      return { kind: mark.kind, color: mark.color, width: mark.width, points: cleanPoints, ...(mark.kind === 'text' ? { text } : {}) };
    });
  }
  const clean = { ...emptyEssayAnnotations(submission), pages };
  if (new TextEncoder().encode(JSON.stringify(clean)).byteLength > ESSAY_ANNOTATION_BYTES) throw invalid('Nét chấm quá lớn. Hãy bớt nét vẽ hoặc rút gọn ghi chú.');
  return clean;
}

export function readEssayAnnotations(value, submission) {
  try { return validateEssayAnnotations(value, submission); } catch { return emptyEssayAnnotations(submission); }
}
export const sameEssayAnnotations = (a, b, submission) => {
  const canonical = value => JSON.stringify(Object.entries(readEssayAnnotations(value, submission).pages).filter(([, marks]) => marks.length));
  return canonical(a) === canonical(b);
};
export const essayHasMarks = value => Object.values(value?.pages || {}).some(marks => Array.isArray(marks) && marks.length > 0);
export const quickEssayScores = maximum => {
  const n = Number(String(maximum ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? [...new Set([0, ...[0.25, 0.5, 0.75, 1].map(f => Math.round(n * f * 100) / 100)])] : [];
};
