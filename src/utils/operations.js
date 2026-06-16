export const normalizeAccessCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export const validateMessageRecipients = (students = []) => {
  const valid = [];
  const missingCode = [];
  students.forEach(student => {
    if (normalizeAccessCode(student?.accessCode || student?.studentAccessCode)) valid.push(student);
    else missingCode.push(student);
  });
  return { valid, missingCode };
};

export const findScheduleTeacherConflicts = (entries = []) => {
  const occupied = new Map();
  const conflicts = [];
  entries.forEach(entry => {
    const teacher = String(entry?.teacher || '').trim();
    if (!teacher || !entry?.day || !entry?.period) return;
    const key = `${entry.day}::${entry.period}::${teacher}`;
    if (occupied.has(key) && occupied.get(key)?.className !== entry.className) {
      conflicts.push({ key, first: occupied.get(key), second: entry });
      return;
    }
    occupied.set(key, entry);
  });
  return conflicts;
};

export const filterMailboxRowsForDeletion = (rows = [], { mode = 'filter', category = 'all', fromTime = 0, toTime = 0 } = {}) => (
  rows.filter(row => {
    if (mode === 'all') return true;
    const createdAt = Number(row?.createdAt) || 0;
    return (category === 'all' || String(row?.category || 'general').toLowerCase() === String(category).toLowerCase())
      && (!fromTime || createdAt >= fromTime)
      && (!toTime || createdAt <= toTime);
  })
);

export const normalizeScoreValue = (value) => {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return '';
  const score = Number(text);
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  return String(Math.round(score * 10) / 10);
};

export const validateBackupSnapshot = (snapshot) => (
  Boolean(snapshot && typeof snapshot === 'object' && snapshot.collections && typeof snapshot.collections === 'object')
);

export const toExportRows = (items = [], columns = []) => [
  columns.map(column => column.label),
  ...items.map(item => columns.map(column => item?.[column.key] ?? ''))
];

export const extractSchoolYearFromText = (text, fallback) => {
  if (!text) return fallback;
  const doubleYearMatch = text.match(/(20\d{2})\s*[-/]\s*(20\d{2})/);
  if (doubleYearMatch) {
    return `${doubleYearMatch[1]}-${doubleYearMatch[2]}`;
  }
  const shortYearMatch = text.match(/(20\d{2})\s*[-/]\s*(\d{2})\b/);
  if (shortYearMatch) {
    const start = shortYearMatch[1];
    const endShort = shortYearMatch[2];
    const end = start.slice(0, 2) + endShort;
    return `${start}-${end}`;
  }
  const singleYearMatch = text.match(/\b(20\d{2})\b/);
  if (singleYearMatch) {
    const startYear = parseInt(singleYearMatch[1], 10);
    return `${startYear}-${startYear + 1}`;
  }
  return fallback;
};

