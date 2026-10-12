export const SCHEDULE_DAY_KEYS = ['2', '3', '4', '5', '6', '7'];
const MAX_PERIODS = 5;

export function normalizeScheduleDayPeriods(value, fallbackPeriods = MAX_PERIODS, fallbackDays = SCHEDULE_DAY_KEYS) {
  const fallback = Math.min(MAX_PERIODS, Math.max(1, Math.floor(Number(fallbackPeriods) || MAX_PERIODS)));
  const source = value && typeof value === 'object' ? value : {};
  const days = Array.isArray(fallbackDays) ? fallbackDays : SCHEDULE_DAY_KEYS;
  return Object.fromEntries(SCHEDULE_DAY_KEYS.map(day => {
    const raw = source[day];
    const count = raw !== null && raw !== '' && Number.isFinite(Number(raw))
      ? Math.min(MAX_PERIODS, Math.max(0, Math.floor(Number(raw))))
      : (days.includes(day) ? fallback : 0);
    return [day, count];
  }));
}

export const getScheduleTeachingDays = counts => SCHEDULE_DAY_KEYS.filter(day => Number(counts?.[day]) > 0);
export const getScheduleMaxPeriods = counts => Math.max(1, ...SCHEDULE_DAY_KEYS.map(day => Number(counts?.[day]) || 0));

const isLesson = value => Boolean(String(value || '').trim()) && !['-', '__OFF__'].includes(String(value).trim());

export function findLessonsOutsideScheduleSettings(schedule, rows, counts) {
  return rows.flatMap(row => SCHEDULE_DAY_KEYS.flatMap(day => [1, 2, 3, 4, 5]
    .filter(period => period > Number(counts[day] || 0) && isLesson(schedule?.[row.id]?.[day]?.[period]))
    .map(period => ({ rowId: row.id, day, period, value: schedule[row.id][day][period] }))));
}

export function clearSlotsOutsideScheduleSettings(schedule, rows, counts) {
  return Object.fromEntries(rows.map(row => [row.id, Object.fromEntries(SCHEDULE_DAY_KEYS.map(day => [day,
    Object.fromEntries([1, 2, 3, 4, 5].map(period => [period, period <= Number(counts[day] || 0) ? (schedule?.[row.id]?.[day]?.[period] || '') : '']))
  ]))]));
}
