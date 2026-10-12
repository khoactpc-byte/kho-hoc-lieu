import test from 'node:test';
import assert from 'node:assert/strict';
import { scorebookDocumentId, resolveScorebookDocument, scorebooksForScope } from '../src/utils/scorebookArchive.js';
import { legacyScorebookPreview } from '../src/utils/legacyScorebookPreview.js';

const scope = { schoolYear: '2025-2026', sourceFile: 'template.xlsx', grade: '9', schoolCode: 'UNKNOWN' };
const archive = { ...scope, schoolCode: undefined, id: 'old-book', updatedAt: 1, edits: { 'custom:hkiScore:0:r0:s0': '7' } };

test('unassigned legacy book opens under its original ID, without assigning a campus or changing its marks', () => {
  const result = resolveScorebookDocument([archive], scope);
  assert.equal(result.id, archive.id);
  assert.equal(result.document, archive);
  assert.equal(result.archived, true);
  assert.equal(result.needsSelection, false);
  assert.deepEqual(archive.edits, { 'custom:hkiScore:0:r0:s0': '7' });
  assert.equal(resolveScorebookDocument([archive], { ...scope, schoolCode: 'NAN' }).document, null);
});

test('saved books remain separate by campus, year, grade and template', () => {
  const otherScopes = [{ schoolCode: 'NAN' }, { schoolYear: '2026-2027' }, { grade: '8' }, { sourceFile: 'other.xlsx' }];
  const documents = [archive, ...otherScopes.map((change, index) => ({ ...archive, ...change, id: `other-${index}` }))];
  assert.deepEqual(scorebooksForScope(documents, scope).map(book => book.id), ['old-book']);
  assert.deepEqual(scorebooksForScope([{ ...archive, schoolYear: '2025 - 2026', grade: 9 }], scope).map(book => book.id), ['old-book']);
  assert.equal(resolveScorebookDocument([{ ...archive, schoolName: 'THCS Nguyễn An Ninh' }], { ...scope, schoolCode: 'NAN' }).id, 'old-book');
});

test('canonical book is preferred and older saved versions can still be selected explicitly', () => {
  const canonical = { ...scope, id: scorebookDocumentId(scope), updatedAt: 0 };
  assert.equal(resolveScorebookDocument([archive, canonical], scope).id, canonical.id);
  assert.equal(resolveScorebookDocument([archive, canonical], scope, archive.id).id, archive.id);
  assert.equal(resolveScorebookDocument([archive, canonical], scope, 'other-campus').id, canonical.id);
});

test('multiple old books require a choice instead of merging marks or choosing a version by date', () => {
  const second = { ...archive, id: 'second-book', updatedAt: 2 };
  const result = resolveScorebookDocument([archive, second], scope);
  assert.equal(result.needsSelection, true);
  assert.equal(result.document, null);
  assert.deepEqual(result.candidates.map(book => book.id), ['second-book', 'old-book']);
  assert.equal(resolveScorebookDocument([archive, second], scope, archive.id).document, archive);
});

test('legacy preview preserves original row positions, zero marks and conflicting aliases, without guessing student identities', () => {
  const edits = { 'custom:hkiScore:0:r1:s0': 0, 'custom:hkiScore:0:r1:s1': '7', 'hkiScore:0:r1:s1': '8',
    'custom:hkiScore:0:r0:s5': '6', 'custom:hkiiReview:2:r1:g7': 'Đ',
    'custom:hkiScore:0:uHS001:s0': '9', 'custom:hkiScore:0:r2:s0': '', 'custom:cover:title': 'Sổ cũ' };
  const snapshot = JSON.stringify(edits);
  const groups = legacyScorebookPreview(edits);
  assert.equal(groups.length, 2);
  const scores = groups.find(group => group.kind === 'Score');
  assert.deepEqual(scores.rows.map(row => row.index), [0, 1]);
  assert.deepEqual(scores.rows[1].values.s0, ['0']);
  assert.deepEqual(scores.rows[1].values.s1, ['7', '8']);
  assert.equal(JSON.stringify(edits), snapshot);
  assert.equal(JSON.stringify(groups).includes('HS001'), false);
});
