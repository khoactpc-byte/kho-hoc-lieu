import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNextSchoolYearClasses,
  createDefaultSchoolClassesByGrade,
  getSchoolClassesForCampus,
  getSchoolClassesForYear,
  getSchoolTeachingAssignmentClassesForYear,
  getSchoolClassTeacherAssignments,
  getSchoolGrade,
  getStudentSchoolCode,
  getStudentEntryGrade,
  normalizeSchoolCode,
  normalizeSchoolClassName,
  promoteSchoolClassName
} from '../src/utils/schoolClasses.js';

test('a new school year starts with one primary class and two secondary classes', () => {
  assert.deepEqual(createDefaultSchoolClassesByGrade(), {
    1: ['1A'], 2: ['2A'], 3: ['3A'], 4: ['4A'], 5: ['5A'],
    6: ['6A', '6B'], 7: ['7A', '7B'], 8: ['8A', '8B'], 9: ['9A', '9B']
  });
  assert.deepEqual(buildNextSchoolYearClasses({ 8: ['8C'] }, ['7C', '9D'])[8], ['8C']);
  assert.deepEqual(buildNextSchoolYearClasses({ 8: ['8C'] }, ['7C', '9D'])[7], ['7A', '7B', '7C']);
  assert.deepEqual(buildNextSchoolYearClasses({ 8: ['8C'] }, ['7C', '9D'])[9], ['9A', '9B', '9D']);
});

test('school classes stay separate by school year', () => {
  const classesByYear = {
    '2025-2026': { 9: ['9a', '9B'], 6: ['6A'] },
    '2026-2027': { 9: ['9C'] }
  };

  assert.deepEqual(getSchoolClassesForYear(classesByYear, '2025 - 2026', ['6', '7', '8', '9']), ['6A', '9A', '9B']);
  assert.deepEqual(getSchoolClassesForYear(classesByYear, '2026-2027', ['6', '7', '8', '9']), ['9C']);
});

test('class suffixes separate the two school campuses for assignment filters', () => {
  const classes = ['6A', '6B', '9A', '9B'];
  assert.deepEqual(getSchoolClassesForCampus(classes, 'NAN'), ['6A', '9A']);
  assert.deepEqual(getSchoolClassesForCampus(classes, 'TQK'), ['6B', '9B']);
});

test('teaching assignment class picker keeps 9B available when the year config only has 9A', () => {
  const byYear = { '2026-2027': { 6: ['6A', '6B'], 7: ['7A', '7B'], 8: ['8A', '8B'], 9: ['9A'] } };
  assert.deepEqual(
    getSchoolTeachingAssignmentClassesForYear(byYear, '2026-2027', ['6', '7', '8', '9']),
    ['6A', '6B', '7A', '7B', '8A', '8B', '9A', '9B']
  );
});

test('class names preserve the section while grade extraction stays available', () => {
  assert.equal(normalizeSchoolClassName('Lớp 9 a'), '9A');
  assert.equal(normalizeSchoolClassName('b', '8'), '8B');
  assert.equal(getSchoolGrade('9B'), '9');
});

test('promoting a student keeps the class section and does not promote grade 9', () => {
  assert.equal(promoteSchoolClassName('1a'), '2A');
  assert.equal(promoteSchoolClassName('6a'), '7A');
  assert.equal(promoteSchoolClassName('Lớp 7 B'), '8B');
  assert.equal(promoteSchoolClassName('8C1'), '9C1');
  assert.equal(promoteSchoolClassName('9A'), '');
});

test('entry grade stays fixed while the current class advances', () => {
  assert.equal(getStudentEntryGrade({ entryGrade: '6', className: '8A', enrollmentYear: '2024', schoolYear: '2026-2027' }), '6');
  assert.equal(getStudentEntryGrade({ className: '8A', enrollmentYear: '2024-2025', schoolYear: '2026-2027' }), '6');
});

test('class teacher assignments inherit grade defaults and override by semester', () => {
  const assignments = {
    6: {
      Toán: { hk1: 'GV khối HK1', hk2: 'GV khối HK2' },
      Văn: 'GV Văn'
    },
    '6A': {
      Toán: { hk2: 'GV riêng HK2' }
    }
  };

  assert.deepEqual(getSchoolClassTeacherAssignments(assignments, '6A'), {
    Toán: { hk1: 'GV khối HK1', hk2: 'GV riêng HK2' },
    Văn: 'GV Văn'
  });
  assert.deepEqual(getSchoolClassTeacherAssignments(assignments, '6B'), assignments[6]);
});

test('scorebook school codes stay separate from class suffixes', () => {
  assert.equal(normalizeSchoolCode('THCS Nguyễn An Ninh'), 'NAN');
  assert.equal(normalizeSchoolCode('TQK'), 'TQK');
  assert.equal(normalizeSchoolCode('tran-quang-khai'), 'TQK');
  assert.equal(getStudentSchoolCode({ schoolCode: 'NAN', className: '8A' }), 'NAN');
  assert.equal(getStudentSchoolCode({ schoolName: 'THCS Trần Quang Khải', className: '8B' }), 'TQK');
  assert.equal(getStudentSchoolCode({ schoolKey: 'nguyen-an-ninh', className: '8B' }), 'NAN');
  assert.equal(getStudentSchoolCode({ classHistory: { '2025-2026': '7B' } }), 'UNKNOWN');
  assert.equal(getStudentSchoolCode({ classSuffix: 'A', className: '8A' }), 'UNKNOWN');
  assert.equal(getStudentSchoolCode({ className: '8' }), 'UNKNOWN');
});
