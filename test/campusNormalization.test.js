import test from 'node:test';
import assert from 'node:assert/strict';
import { planCampusNormalization } from '../src/utils/campusNormalization.js';
import { scorebookDocumentId, resolveScorebookDocument } from '../src/utils/scorebookArchive.js';

const scope = { schoolYear: '2025-2026', grade: '9', sourceFile: 'template.xlsx', schoolCode: 'NAN' };
const original = { id: 'old-book', ...scope, schoolCode: undefined, edits: { 'custom:hkiScore:0:r0:s0': '0', 'custom:hkiScore:0:r0:s1': '8' } };
const snapshot = collections => ({ version: 2, collections });

test('campus normalization covers all years while preserving identities, historical classes and raw marks', () => {
  const collections = { students: [{ id: 'old', accessCode: 'HS123', className: '8B', schoolYear: '2025-2026', previousStudentId: 'prior', classHistory: { '2024-2025': '7' } },
    { id: 'current', studentKey: 'HS123', className: '9A', schoolYear: '2026-2027' }], scorebooks: [original],
    class_attendance: [{ id: 'attendance', schoolYear: '2025-2026', className: '8B', records: { old: { status: 'CP' } } }] };
  const before = JSON.stringify(collections);
  const plan = planCampusNormalization(snapshot(collections), 'NAN');
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.counts, { students: 2, scorebooks: 1, class_attendance: 1 });
  const studentPatch = plan.groups.find(group => group.id === 'old').operations[0].patch;
  assert.deepEqual(studentPatch, { schoolCode: 'NAN', schoolName: 'THCS Nguyễn An Ninh' });
  const book = plan.groups.find(group => group.name === 'scorebooks');
  assert.equal(book.operations[0].id, scorebookDocumentId(scope));
  assert.deepEqual(book.operations[0].data.edits, original.edits);
  assert.equal(book.operations[1].patch.campusNormalization.archivedTo, scorebookDocumentId(scope));
  assert.equal(JSON.stringify(collections), before);
});

test('a current destination and a legacy book merge distinct keys once without shadowing the old book', () => {
  const target = { id: scorebookDocumentId(scope), ...scope, edits: { 'custom:cover:title': 'Bìa đã sửa' } };
  const plan = planCampusNormalization(snapshot({ scorebooks: [target, original] }), 'NAN');
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.groups[0].operations[0].data.edits, { ...original.edits, ...target.edits });
});

test('conflicting saved marks and multiple old versions block normalization instead of choosing or overwriting', () => {
  const target = { id: scorebookDocumentId(scope), ...scope, edits: { 'custom:hkiScore:0:r0:s0': '7' } };
  assert.equal(planCampusNormalization(snapshot({ scorebooks: [original, target] }), 'NAN').conflicts.length, 1);
  assert.equal(planCampusNormalization(snapshot({ scorebooks: [original, { ...original, id: 'other-old' }] }), 'NAN').conflicts.length, 2);
});

test('known other campuses stay untouched and completed normalization can be rerun safely', () => {
  const targetId = scorebookDocumentId(scope);
  const books = [{ ...original, schoolCode: 'NAN', schoolName: 'THCS Nguyễn An Ninh', campusNormalization: { archivedTo: targetId } },
    { ...original, ...scope, id: targetId, schoolName: 'THCS Nguyễn An Ninh' }];
  const plan = planCampusNormalization(snapshot({ students: [{ id: 'other', schoolCode: 'TQK' }], scorebooks: books }), 'NAN');
  assert.equal(plan.groups.length, 0);
  assert.equal(plan.skipped.length, 1);
  assert.deepEqual(resolveScorebookDocument(books, scope).candidates.map(book => book.id), [targetId]);
  assert.equal(resolveScorebookDocument(books, { ...scope, schoolCode: 'UNKNOWN' }).candidates.length, 0);
});
