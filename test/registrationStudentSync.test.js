import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps-script/dang-ky-hoc-sinh/code_dangky.gs', import.meta.url), 'utf8');
function fixture() {
  const headers = Array(56).fill('');
  headers.push('2023-2024', '2024-2025', '2025-2026', '2026-2027');
  const row = Array(headers.length).fill('');
  Object.assign(row, { 1: 'Nguyễn Văn An', 6: '6A', 7: '2023-2024', 49: 'HS001', 50: '9', 51: '9A',
    52: '2025-2026', 53: 'THCS Nguyễn An Ninh', 54: 'NAN', 55: 'A', 56: '7A', 57: '8A', 58: '9A' });
  const values = [headers, row];
  const sheet = {
    getDataRange: () => ({ getValues: () => values.map(item => [...item]) }),
    getLastColumn: () => values[0].length,
    getLastRow: () => values.length,
    getRange: (r, c, height = 1, width = 1) => ({
      getValue: () => values[r - 1]?.[c - 1] || '',
      getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => values[r - 1 + i]?.[c - 1 + j] || '')),
      setValues: incoming => incoming.forEach((line, i) => line.forEach((value, j) => { values[r - 1 + i] ||= []; values[r - 1 + i][c - 1 + j] = value; })),
      setValue: value => { values[r - 1][c - 1] = value; },
      clearContent: () => { for (let i = 0; i < height; i++) for (let j = 0; j < width; j++) values[r - 1 + i][c - 1 + j] = ''; }
    }),
    appendRow: newRow => values.push([...newRow])
  };
  const context = vm.createContext({
    ContentService: { createTextOutput: value => ({ value, setMimeType() { return this; } }), MimeType: { JAVASCRIPT: 'js' } },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) }
  });
  vm.runInContext(source, context);
  context.ensureExtraHeaders_ = context.writeRegistrationSchoolMeta_ = () => {};
  context.claimSchoolYearSync_ = () => '2026-2027';
  const sync = patch => JSON.parse(context.syncStudentToSheet_({ fullName: row[1], accessCode: 'HS001',
    schoolYear: '2026-2027', schoolCode: 'NAN', ...patch }).value);
  return { context, sheet, values, row, headers, sync };
}

test('graduation sync keeps TNTHCS and graduation year while clearing its numeric grade', () => {
  const { context, row, headers, sync } = fixture();
  const result = sync({ className: 'TNTHCS', grade: '', status: 'completed', completionStatus: 'completed_grade_9',
    graduationYear: '2026', completionSchoolYear: '2025-2026', hocLucLop9: 'Đạt', hanhKiemLop9: 'Tốt' });
  assert.equal(result.success, true, result.message);
  assert.equal(row[50], ''); assert.equal(row[51], 'TNTHCS'); assert.equal(row[52], '2026');
  assert.equal(row[58], '9A'); assert.equal(row[59], 'TNTHCS');
  assert.equal(row[34], 'Đạt'); assert.equal(row[35], 'Tốt');
  const read = context.mapStudentSheetRow_(row, 0, headers);
  assert.equal(read.currentClassName, 'TNTHCS'); assert.equal(read.grade, '');
  assert.equal(read.graduationYear, '2026'); assert.equal(read.completionSchoolYear, '2025-2026');
});

test('dropout clears the current class even when stale class/history arrive and preserves older years', () => {
  const { context, row, headers, sync } = fixture();
  row[59] = '9A';
  const result = sync({ className: '9A', grade: '9', status: 'dropped', dropoutYear: '2026-2027',
    classHistory: { '2025-2026': '9A', '2026-2027': '9A' } });
  assert.equal(result.success, true, result.message);
  assert.equal(row[36], '2026-2027'); assert.equal(row[50], ''); assert.equal(row[51], ''); assert.equal(row[59], '');
  assert.equal(row[58], '9A'); assert.equal(row[6], '6A'); assert.equal(row[7], '2023-2024');
  const read = context.mapStudentSheetRow_(row, 0, headers);
  assert.equal(read.status, 'dropped'); assert.equal(read.currentClassName, ''); assert.equal(read.grade, '');
  assert.equal(read.entryGrade, '6', 'blank current class must not lose the education level');
});

test('Sheet dropout blocks a queued active sync and graduation, and only explicit reactivation restores the class', () => {
  const { row, values, sync } = fixture();
  row[36] = '2026-2027'; row[50] = ''; row[51] = ''; row[52] = '2026-2027';
  const before = structuredClone(values);
  for (const patch of [{ status: 'active', className: '9A' }, { status: 'completed', className: 'TNTHCS', graduationYear: '2026' }]) {
    const result = sync(patch);
    assert.equal(result.success, false); assert.match(result.message, /đánh dấu bỏ học/);
    assert.deepEqual(values, before);
  }
  const returned = sync({ status: 'active', className: '9A', reactivateDropout: true });
  assert.equal(returned.success, true, returned.message);
  assert.equal(row[36], ''); assert.equal(row[50], '9'); assert.equal(row[51], '9A'); assert.equal(row[59], '9A');
});

test('promotion rechecks dropout on Sheet before writing any row in its batch', () => {
  const { context, row, values } = fixture();
  const other = [...row]; other[1] = 'Bình'; other[49] = 'HS002'; other[36] = '2026-2027';
  values.push(other);
  const before = structuredClone(values);
  const result = JSON.parse(context.syncSchoolYearClasses_({ items: ['HS001', 'HS002'].map(accessCode => ({
    accessCode, sourceSchoolYear: '2025-2026', targetSchoolYear: '2026-2027', sourceClassName: '8A', targetClassName: '9A'
  })) }).value);
  assert.equal(result.success, false); assert.equal(result.updatedCount, 0); assert.match(result.message, /bỏ học/);
  assert.deepEqual(values, before, 'a later dropout in the batch must prevent earlier writes too');
});

test('Sheet import includes earlier dropouts when viewing a later year so a stale active web record is corrected', () => {
  const { context, row } = fixture();
  row[36] = '2025-2026'; row[50] = ''; row[51] = ''; row[52] = '2025-2026';
  const current = JSON.parse(context.listSheetStudents_({ schoolYear: '2026-2027' }).value);
  assert.equal(current.success, true); assert.equal(current.items.length, 1);
  assert.equal(current.items[0].status, 'dropped'); assert.equal(current.items[0].dropoutYear, '2025-2026');
  const past = JSON.parse(context.listSheetStudents_({ schoolYear: '2024-2025' }).value).items;
  assert.equal(past.length, 1); assert.equal(past[0].currentClassName, '8A'); assert.equal(past[0].status, 'active');
  assert.equal(past[0].dropoutYear, '');
});

test('requested year uses its history column even when the current summary still points to the previous year', () => {
  const { context, row } = fixture();
  row[51] = '8A'; row[50] = '8'; row[52] = '2025-2026'; row[59] = '9A';
  const current = JSON.parse(context.listSheetStudents_({ schoolYear: '2026-2027' }).value).items;
  assert.equal(current.length, 1); assert.equal(current[0].currentClassName, '9A'); assert.equal(current[0].grade, '9');
  assert.equal(current[0].schoolYear, '2026-2027'); assert.equal(current[0].className, '6A', 'admission class remains separate');
  row[59] = '';
  assert.equal(JSON.parse(context.listSheetStudents_({ schoolYear: '2026-2027' }).value).items.length, 0, 'no automatic promotion from a prior year');
});
