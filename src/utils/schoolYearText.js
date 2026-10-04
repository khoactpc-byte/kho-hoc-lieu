export function extractSchoolYearFromText(text, fallback) {
  const source = String(text || '');
  const pair = source.match(/\b(20\d{2})\s*[-/–—]\s*(20\d{2}|\d{2})\b/);
  if (pair) {
    const start = Number(pair[1]);
    const end = pair[2].length === 2 ? Number(pair[1].slice(0, 2) + pair[2]) : Number(pair[2]);
    return end === start + 1 ? `${start}-${end}` : fallback;
  }
  const year = source.match(/\b(20\d{2})\b/);
  return year ? `${year[1]}-${Number(year[1]) + 1}` : fallback;
}

export const getSchoolYearStart = (schoolYear = '') => Number(String(schoolYear || '').match(/20\d{2}/)?.[0] || 0);
export const normalizeAdmissionSchoolYear = (candidate = '', fallback = '') => (
  getSchoolYearStart(candidate) && getSchoolYearStart(fallback) && getSchoolYearStart(candidate) < getSchoolYearStart(fallback)
    ? fallback : (candidate || fallback)
);
