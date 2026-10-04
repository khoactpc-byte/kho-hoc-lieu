import test from 'node:test';
import assert from 'node:assert/strict';
import { contentBelongsToCampus, teacherHasContentScope, teacherUsernameFromName } from '../src/utils/teacherAccess.js';

test('campus-scoped content stays separate, with legacy content assigned to NAN', () => {
  assert.equal(contentBelongsToCampus({ schoolCode: 'TQK' }, 'TQK'), true);
  assert.equal(contentBelongsToCampus({ schoolCode: 'TQK' }, 'NAN'), false);
  assert.equal(contentBelongsToCampus({ schoolCode: 'NAN' }, 'NAN'), true);
  assert.equal(contentBelongsToCampus({}, 'NAN'), true);
  assert.equal(contentBelongsToCampus({}, 'TQK'), false);
  assert.equal(contentBelongsToCampus({ schoolCode: 'TQK' }, 'UNKNOWN'), false);
});

test('teacher may only use the assigned campus, grades, and subjects', () => {
  const profile = { role: 'teacher', schoolCode: 'TQK', grades: ['6', '7'], subjects: ['Toán'] };
  assert.equal(teacherHasContentScope(profile, { schoolCode: 'TQK', grade: 6, subject: 'Toán' }), true);
  assert.equal(teacherHasContentScope(profile, { schoolCode: 'NAN', grade: '6', subject: 'Toán' }), false);
  assert.equal(teacherHasContentScope(profile, { schoolCode: 'TQK', grade: '8', subject: 'Toán' }), false);
  assert.equal(teacherHasContentScope(profile, { schoolCode: 'TQK', grade: '6', subject: 'Ngữ Văn' }), false);
  assert.equal(teacherHasContentScope(null, { schoolCode: 'TQK', grade: '6', subject: 'Toán' }), false);
});

test('teacher account usernames use the last name without Vietnamese accents', () => {
  assert.equal(teacherUsernameFromName('Phạm Anh Khoa'), 'khoa');
  assert.equal(teacherUsernameFromName('  Đỗ Thị Mỹ  '), 'my');
  assert.equal(teacherUsernameFromName('Lý'), 'ly');
  assert.equal(teacherUsernameFromName('---'), '');
});

test('teacher assignment scopes support primary grades and homeroom subject', () => {
  const profile = { role: 'teacher', schoolCode: 'NAN', grades: ['1', '5'], subjects: ['Chủ nhiệm'] };
  assert.equal(teacherHasContentScope(profile, { schoolCode: 'NAN', grade: '1', subject: 'Chủ nhiệm' }), true);
  assert.equal(teacherHasContentScope(profile, { schoolCode: 'NAN', grade: '5', subject: 'Chủ nhiệm' }), true);
});
