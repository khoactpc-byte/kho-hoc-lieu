import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, parseCalendarDate } from '../src/utils/calendarDate.js';

test('calendar parsing rejects rollover dates and preserves valid Vietnamese/ISO dates', () => {
  for (const text of ['31/02/2026', '2026-02-29', '31/04/2026', '2026-13-01', '00/01/2026', '2026-01-00', '29/02/1900', '01/01/0000', '131/01/2026']) {
    assert.equal(parseCalendarDate(text), null, text);
  }
  for (const text of ['2024-02-29', '29/02/2024', 'Ngày 29 tháng 2 năm 2024']) {
    const date = parseCalendarDate(text);
    assert.deepEqual([date.getFullYear(), date.getMonth() + 1, date.getDate()], [2024, 2, 29]);
  }
  assert.equal(calendarDate(2026, 2, 31), null);
  assert.equal(calendarDate(2026, 1.5, 1), null);
  assert.equal(calendarDate(99, 1, 1).getFullYear(), 99);
});
