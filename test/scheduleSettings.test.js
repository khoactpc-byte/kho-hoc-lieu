import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSlotsOutsideScheduleSettings, findLessonsOutsideScheduleSettings, getScheduleMaxPeriods, getScheduleTeachingDays, normalizeScheduleDayPeriods } from '../src/utils/scheduleSettings.js';

test('legacy timetable limits migrate without reopening hidden days or expanding four periods', () => {
  const migrated = normalizeScheduleDayPeriods(undefined, 4, ['2', '3', '4', '5', '6']);
  assert.deepEqual(migrated, { 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 0 });
  assert.equal(getScheduleMaxPeriods(migrated), 4);
  assert.deepEqual(getScheduleTeachingDays(migrated), ['2', '3', '4', '5', '6']);
  const modern = normalizeScheduleDayPeriods({ 2: 3, 3: 5, 4: 4, 5: 4, 6: 4, 7: 0 }, 5, ['2']);
  assert.equal(modern['3'], 5, 'display preferences do not replace explicit teaching settings');
  assert.equal(modern['7'], 0);
});

test('reducing teaching limits identifies lessons to confirm and clears only unavailable slots', () => {
  const rows = [{ id: '6A' }];
  const schedule = { '6A': { 2: { 1: 'Toán', 2: '__OFF__', 3: 'Văn', 4: 'KHTN' }, 7: { 1: 'GDCD' } } };
  const settings = normalizeScheduleDayPeriods({ 2: 3, 7: 0 });
  const affected = findLessonsOutsideScheduleSettings(schedule, rows, settings);
  assert.deepEqual(affected.map(item => item.value), ['KHTN', 'GDCD']);
  const cleared = clearSlotsOutsideScheduleSettings(schedule, rows, settings);
  assert.equal(cleared['6A']['2'][1], 'Toán');
  assert.equal(cleared['6A']['2'][2], '__OFF__');
  assert.equal(cleared['6A']['2'][3], 'Văn');
  assert.equal(cleared['6A']['2'][4], '');
  assert.equal(cleared['6A']['7'][1], '');
  assert.equal(schedule['6A']['2'][4], 'KHTN', 'the original draft is not mutated before confirmation');
});
