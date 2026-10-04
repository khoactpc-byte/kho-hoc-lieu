// Calendar dates use local date components, never UTC parsing or Date rollover.
export function calendarDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const result = new Date(0);
  result.setFullYear(year, month - 1, day);
  result.setHours(0, 0, 0, 0);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

export function parseCalendarDate(value = '') {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // Imported notes can include a Vietnamese date inside a longer label.
  const vi = text.match(/(?:^|\D)(\d{1,2})\D+(\d{1,2})\D+(\d{4})(?!\d)/);
  return vi ? calendarDate(Number(vi[3]), Number(vi[2]), Number(vi[1])) : null;
}
