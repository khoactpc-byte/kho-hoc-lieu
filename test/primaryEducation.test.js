import test from 'node:test';
import assert from 'node:assert/strict';
import { educationGrades, belongsToEducationLevel, recordGrade, educationRoute, parseEducationRoute } from '../src/utils/educationLevels.js';
import { PRIMARY_SCOREBOOK_SOURCE, primaryCellKey, primaryHasTest, primarySubjectsForGrade, normalizePrimaryScore } from '../src/utils/primaryAcademic.js';
import { scorebookDocumentId } from '../src/utils/scorebookArchive.js';
import { createDataService } from '../netlify/lib/serverData.mjs';
import { memoryStore } from './helpers/memoryStore.js';

test('education scope follows the current class, supports registration aliases and preserves route level', () => {
  assert.deepEqual(educationGrades('primary'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(educationGrades('thcs'), ['6', '7', '8', '9']);
  assert.equal(recordGrade({ entryGrade: '4', currentClassName: '6B', grade: '5' }), '6');
  assert.equal(belongsToEducationLevel({ entryGrade: '4', className: '6A' }, 'primary'), false);
  assert.equal(belongsToEducationLevel({ lopHienTai: '5A', khoi: '3' }, 'primary'), true);
  assert.equal(belongsToEducationLevel({}, 'primary'), false, 'unclassified registrations are never silently assigned to a level');
  assert.equal(educationRoute('/students/current', 'primary'), '/primary/students/current');
  assert.equal(educationRoute('/transcript', 'thcs'), '/thcs/transcript');
  assert.equal(educationRoute('/tran-hung-dao/classes', 'primary'), '/tran-hung-dao/classes');
  assert.deepEqual(parseEducationRoute('/primary/scorebook', 'thcs'), { level: 'primary', path: '/scorebook' });
  assert.deepEqual(parseEducationRoute('/students/current', 'primary'), { level: 'primary', path: '/students/current' });
});

test('primary assessments use integer scores, grade-specific subjects and stable pupil keys', () => {
  assert.ok(primarySubjectsForGrade('1').some(subject => subject.key === 'tu_nhien_xa_hoi'));
  assert.ok(!primarySubjectsForGrade('1').some(subject => subject.key === 'khoa_hoc'));
  const subjects = primarySubjectsForGrade('5');
  assert.ok(!subjects.some(subject => subject.key === 'tu_nhien_xa_hoi'));
  assert.ok(subjects.some(subject => subject.key === 'khoa_hoc'));
  const math = subjects.find(subject => subject.key === 'toan');
  assert.equal(primaryHasTest(math, 'mid1', '3'), false);
  assert.equal(primaryHasTest(math, 'mid1', '4'), true);
  assert.equal(primaryHasTest(subjects.find(subject => subject.key === 'dao_duc'), 'end2', '5'), false);
  for (const score of ['', '0', '5', '10']) assert.equal(normalizePrimaryScore(score), score);
  for (const score of ['7.5', '-1', '11', 'text']) assert.equal(normalizePrimaryScore(score), null);
  assert.equal(primaryCellKey({ accessCode: 'HS001' }, 'end2', 'toan', 'score'), primaryCellKey({ id: 'new-record', accessCode: 'HS001', fullName: 'Changed' }, 'end2', 'toan', 'score'));
  assert.equal(primaryCellKey({}, 'end2', 'toan', 'score'), '');
});

test('primary score API enforces the pupil, campus, year lock, score format and teaching assignment', async () => {
  const root = 'artifacts/test/public/data';
  const store = memoryStore();
  const service = createDataService({ store, appId: 'test', now: () => 100 });
  const actor = { uid: 'admin', role: 'admin' };
  const pupil = { id: 'p1', accessCode: 'TH001', schoolCode: 'NAN', className: '4A', schoolYear: '2026-2027' };
  store.put(`${root}/settings/global`, { schoolYear: pupil.schoolYear });
  store.put(`${root}/students/p1`, pupil);
  const metadata = { schoolYear: pupil.schoolYear, schoolCode: 'NAN', grade: '4', sourceFile: PRIMARY_SCOREBOOK_SOURCE };
  const id = scorebookDocumentId(metadata);
  const key = primaryCellKey(pupil, 'mid1', 'toan', 'score');
  const save = (value, extra = {}) => service.saveScores(actor, { documentId: id, metadata, patch: { [key]: { value } }, ...extra });
  await save('0');
  assert.equal(store.get(`${root}/scorebooks/${id}`).edits[key], '0');
  await assert.rejects(save('7.5', { expectedEdits: { [key]: '0' } }), /số nguyên/);
  await assert.rejects(save('8'), /vừa sửa/);
  await save('8', { expectedEdits: { [key]: '0' } });
  const forgedKey = primaryCellKey({ accessCode: 'OTHER' }, 'end2', 'toan', 'score');
  await assert.rejects(service.saveScores(actor, { documentId: id, metadata, patch: { [forgedKey]: { value: '8' } } }), /không thuộc học sinh/);
  const invalidLevel = primaryCellKey(pupil, 'end2', 'toan', 'level');
  await assert.rejects(service.saveScores(actor, { documentId: id, metadata, patch: { [invalidLevel]: { value: 'Tốt' } } }), /Mức đánh giá/);
  const teacher = { uid: 't1', role: 'teacher', schoolCode: 'NAN', grades: ['4'], subjects: ['Tiếng Việt'] };
  await assert.rejects(service.saveScores(teacher, { documentId: id, metadata, patch: { [key]: { value: '9' } }, expectedEdits: { [key]: '8' } }), /phân công/);
  store.put(`${root}/settings/global`, { schoolYear: pupil.schoolYear, inputYearLocks: { [pupil.schoolYear]: true } });
  await assert.rejects(save('9', { expectedEdits: { [key]: '8' } }), /khóa/);
  assert.equal(store.get(`${root}/scorebooks/${id}`).edits[key], '8');
});
