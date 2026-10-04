// Shared numerical policy. Reading legacy rows and review-only subjects stays in adapters.
export function parseScoreNumber(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function formatScoreNumber(value) {
  return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1) : '';
}

export function calculateSemesterAverage(readScore) {
  const regular = [0, 1, 2, 3].map(index => parseScoreNumber(readScore(index))).filter(value => value !== null);
  const midterm = parseScoreNumber(readScore(4)), final = parseScoreNumber(readScore(5));
  if (!regular.length || midterm === null || final === null) return '';
  return formatScoreNumber((regular.reduce((sum, value) => sum + value, 0) + 2 * midterm + 3 * final) / (regular.length + 5));
}

export function calculateYearAverage(first, second) {
  const a = parseScoreNumber(first), b = parseScoreNumber(second);
  return a === null || b === null ? '' : formatScoreNumber((a + 2 * b) / 3);
}

export function academicSummary(values) {
  const scores = values.map(parseScoreNumber), present = scores.filter(value => value !== null);
  let result = '';
  if (present.length) {
    if (present.filter(score => score >= 8).length >= 5 && present.every(score => score >= 6.5)) result = 'Tốt';
    else if (present.filter(score => score >= 6.5).length >= 5 && present.every(score => score >= 5)) result = 'Khá';
    else if (present.filter(score => score >= 5).length >= 5 && present.every(score => score >= 3.5)) result = 'Đạt';
    else result = 'Chưa đạt';
  }
  return { result, complete: scores.length > 0 && present.length === scores.length, completedCount: present.length, requiredCount: scores.length };
}
