import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccountTeacherSuggestions, getTeachingCampusCodes, getTeachingTeacherSuggestions } from '../src/utils/teacherSuggestions.js';

const nanTeachers = [
  { name: 'Trần Minh Triết', subject: 'Toán' },
  { name: 'Bùi Thị Thu Trang', subject: 'Ngữ Văn' }
];
const tqkTeachers = [
  { name: 'Nguyễn Văn An', subject: 'Toán' },
  { name: 'Lê Thị Bình', subject: 'Tiếng Anh' }
];

test('class suffixes select only their assigned campus roster', () => {
  assert.deepEqual(getTeachingCampusCodes(['6A', '9A']), ['NAN']);
  assert.deepEqual(getTeachingCampusCodes(['6B', '9B']), ['TQK']);
  assert.deepEqual(getTeachingCampusCodes(['6A', '9B']), ['NAN', 'TQK']);
});

test('teacher suggestions match the selected subject within the class campus', () => {
  const options = {
    classes: ['6A', '9A'],
    teachersByCampus: { NAN: nanTeachers, TQK: tqkTeachers },
    fallbackTeachers: [...nanTeachers, ...tqkTeachers],
    assignment: 'Toán',
    subjectAliases: ['Math']
  };
  assert.deepEqual(getTeachingTeacherSuggestions(options).map(teacher => teacher.name), ['Trần Minh Triết']);
  assert.deepEqual(getTeachingTeacherSuggestions({ ...options, classes: ['6B'] }).map(teacher => teacher.name), ['Nguyễn Văn An']);
});

test('teacher suggestion search is accent-insensitive and class suffixes can combine campus lists', () => {
  const suggestions = getTeachingTeacherSuggestions({
    query: 'van an',
    assignment: 'Toán',
    classes: ['6A', '6B'],
    teachersByCampus: { NAN: nanTeachers, TQK: tqkTeachers },
    subjectAliases: ['Toán']
  });
  assert.deepEqual(suggestions.map(teacher => teacher.name), ['Nguyễn Văn An']);
});

test('legacy suggestions still use the fallback list when no A/B class suffix is selected', () => {
  const suggestions = getTeachingTeacherSuggestions({
    query: 'tran minh',
    classes: ['6PC'],
    fallbackTeachers: nanTeachers
  });
  assert.deepEqual(suggestions.map(teacher => teacher.name), ['Trần Minh Triết']);
});

test('account name search uses only the chosen campus and matches Vietnamese accents including đ', () => {
  const teachersByCampus = { NAN: [...nanTeachers, { name: 'Đặng Thị Ánh', subject: 'Toán' }], TQK: tqkTeachers };
  const names = (schoolCode, query) => getAccountTeacherSuggestions({ schoolCode, teachersByCampus, query }).map(item => item.name);
  assert.deepEqual(names('NAN', 'dang thi anh'), ['Đặng Thị Ánh']);
  assert.deepEqual(names('NAN', 'ĐẶNG THỊ ÁNH'), ['Đặng Thị Ánh']);
  assert.deepEqual(names('NAN', 'van an'), []);
  assert.deepEqual(names('TQK', 'van an'), ['Nguyễn Văn An']);
  assert.deepEqual(names('UNKNOWN', ''), []);
});

test('account suggestions merge duplicate names across subjects and handle empty campus rosters', () => {
  const teachersByCampus = { NAN: [
    { name: ' Đặng Thị Ánh ', subject: 'Toán' },
    { name: 'Đặng Thị Ánh', subject: 'Chủ nhiệm' },
    null,
    { name: '' }
  ] };
  assert.deepEqual(getAccountTeacherSuggestions({ schoolCode: 'NAN', teachersByCampus }).map(item => item.name), ['Đặng Thị Ánh']);
  assert.deepEqual(getAccountTeacherSuggestions({ schoolCode: 'TQK', teachersByCampus }), []);
});
