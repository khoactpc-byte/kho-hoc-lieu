import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMailboxRowsForDeletion, findScheduleTeacherConflicts, normalizeAccessCode, normalizeScoreValue, toExportRows, validateBackupSnapshot, validateMessageRecipients } from '../src/utils/operations.js';

test('normalizeAccessCode standardizes student codes', () => {
  assert.equal(normalizeAccessCode(' hs 26 001 '), 'HS26001');
});

test('validateMessageRecipients separates students missing access codes', () => {
  const result = validateMessageRecipients([{ id: '1', accessCode: 'HS1' }, { id: '2', accessCode: '' }]);
  assert.deepEqual(result.valid.map(item => item.id), ['1']);
  assert.deepEqual(result.missingCode.map(item => item.id), ['2']);
});

test('findScheduleTeacherConflicts detects a teacher in two classes at one period', () => {
  const conflicts = findScheduleTeacherConflicts([
    { day: 'T2', period: 1, teacher: 'GV A', className: '6A' },
    { day: 'T2', period: 1, teacher: 'GV A', className: '7A' },
    { day: 'T2', period: 2, teacher: 'GV A', className: '8A' }
  ]);
  assert.equal(conflicts.length, 1);
});

test('filterMailboxRowsForDeletion respects category and date range', () => {
  const rows = [
    { id: '1', category: 'score', createdAt: 100 },
    { id: '2', category: 'general', createdAt: 200 },
    { id: '3', category: 'score', createdAt: 300 }
  ];
  assert.deepEqual(filterMailboxRowsForDeletion(rows, { category: 'score', fromTime: 150 }).map(item => item.id), ['3']);
});

test('normalizeScoreValue accepts valid scores and rejects invalid scores', () => {
  assert.equal(normalizeScoreValue('8,5'), '8.5');
  assert.equal(normalizeScoreValue('11'), null);
});

test('validateBackupSnapshot requires a collections object', () => {
  assert.equal(validateBackupSnapshot({ collections: { students: [] } }), true);
  assert.equal(validateBackupSnapshot({}), false);
});

test('toExportRows creates rows usable by PDF and Excel exporters', () => {
  assert.deepEqual(toExportRows([{ name: 'A', className: '6A' }], [{ key: 'name', label: 'Tên' }, { key: 'className', label: 'Lớp' }]), [['Tên', 'Lớp'], ['A', '6A']]);
});
