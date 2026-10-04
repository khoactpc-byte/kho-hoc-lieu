export function normalizeNumericScore(value = '') {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim().replace(',', '.');
  if (!text) return '';
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const score = Number(text);
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  return (Math.round(score * 10) / 10).toFixed(1);
}
