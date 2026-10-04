import test from 'node:test';
import { findPromotionTarget, promotionSourceVersions, assertPromotionPreviewCurrent } from '../src/utils/promotionTargets.js';
import assert from 'node:assert/strict';

test('promotion matching rejects duplicate identities and contradictory legacy names', () => {
  const source = { id: 'old', accessCode: 'HS001', identityCode: '123456789012', schoolCode: 'NAN', fullName: 'Đặng An', birthDate: '2012-01-01' };
  const linked = { id: 'new', previousStudentId: 'old', schoolCode: 'NAN' };
  assert.equal(findPromotionTarget(source, [linked]), linked);
  assert.throws(() => findPromotionTarget(source, [linked, { id: 'duplicate', accessCode: 'HS001', schoolCode: 'NAN' }]), /nhiều hồ sơ/);
  assert.throws(() => findPromotionTarget(source, [{ ...linked, schoolCode: 'TQK' }]), /cơ sở khác/);
  assert.throws(() => findPromotionTarget(source, [{ ...linked, status: 'dropped' }]), /đánh dấu nghỉ/);
  const otherCode = { ...source, id: 'other', accessCode: 'HS999', identityCode: '999999999999' };
  assert.equal(findPromotionTarget(source, [otherCode]), null);
  const legacy = { id: 'legacy', fullName: 'Dang An', birthDate: '2012-01-01', schoolCode: 'NAN' };
  assert.equal(findPromotionTarget(source, [legacy]), legacy);
  const localDate = { ...legacy, birthDate: '01/01/2012' };
  assert.equal(findPromotionTarget(source, [localDate]), localDate);
  assert.throws(() => findPromotionTarget(source, [legacy, { ...legacy, id: 'duplicate-legacy' }]), /nhiều hồ sơ/);
});

test('promotion preview rejects inserted, deleted or modified source students', () => {
  const students = [{ id: 'a', className: '6A', schoolYear: '2025-2026' }];
  const expected = promotionSourceVersions(students, '2025-2026');
  assert.doesNotThrow(() => assertPromotionPreviewCurrent(expected, students, '2025-2026'));
  assert.throws(() => assertPromotionPreviewCurrent(expected, [], '2025-2026'), /đã thay đổi/);
  assert.throws(() => assertPromotionPreviewCurrent(expected, [{ ...students[0], className: '7A' }], '2025-2026'), /đã thay đổi/);
  assert.throws(() => assertPromotionPreviewCurrent(expected, [...students, { id: 'b', schoolYear: '2025-2026' }], '2025-2026'), /đã thay đổi/);
});
import { JSDOM } from 'jsdom';
import { createHtmlSanitizer } from '../src/utils/safeHtml.js';
import { draftPatch, mergeRemoteDraft, assertNoDraftConflicts } from '../src/utils/documentDraft.js';
import { studentEditKey, migrateLegacyRowEdits, studentRowView, hasLegacyRowEdits } from '../src/utils/studentScoreKeys.js';
import { normalizeNumericScore } from '../src/utils/scoreValues.js';
import { assembleGeneration, contentDigest, splitUtf8Chunks } from '../src/utils/chunkedData.js';
import { validateRestoreSnapshot, validateMailboxBackup, buildAtomicRestorePlan, BACKUP_COLLECTIONS } from '../src/utils/backupManifest.js';
import { stableRecordId } from '../src/utils/idempotency.js';
import { listDriveFiles } from '../src/services/driveClient.js';

test('scores follow student identity after rename, insertion, removal and pagination', () => {
  const original = { id: 'docA', accessCode: 'HS26001', fullName: 'An' };
  const key = studentEditKey('custom:hkiScore:0:r0:s0', original);
  assert.equal(key, studentEditKey('custom:hkiScore:0:r42:s0', { ...original, fullName: 'Vân' }));
  assert.notEqual(key, studentEditKey('custom:hkiScore:0:r0:s0', { accessCode: 'HS26002' }));
  assert.deepEqual(studentRowView({ [key]: '8.0' }, original, 42), { 'custom:hkiScore:0:r42:s0': '8.0' });
  assert.deepEqual(studentRowView({ 'custom:hkiScore:0:r0:s0': '9' }, original, 0), {});
  assert.equal(studentEditKey('custom:hkiScore:0:r0:s0', {}), '');
});

test('migration requires a complete unique roster, preserves template cells and rejects alias conflicts', () => {
  const roster = [{ accessCode: 'HS01' }, { accessCode: 'HS02' }];
  const migrated = migrateLegacyRowEdits({ 'custom:hkiScore:0:r1:s0': '0.0', '0_1': 'header' }, roster);
  assert.equal(migrated['custom:hkiScore:0:uHS02:s0'], '0.0');
  assert.equal(migrated['0_1'], 'header');
  assert.equal(hasLegacyRowEdits(migrated), false);
  assert.throws(() => migrateLegacyRowEdits({ 'hkiScore:0:r2:s0': '8' }, roster), /Thiếu học sinh/);
  assert.throws(() => migrateLegacyRowEdits({}, [roster[0], roster[0]]), /trùng mã/);
  assert.throws(() => migrateLegacyRowEdits({ 'hkiScore:0:r0:s0': '8', 'custom:hkiScore:0:r0:s0': '9' }, roster), /cùng ô/);
});

test('numeric zero survives and invalid/out-of-range scores cannot be saved', () => {
  assert.equal(normalizeNumericScore(0), '0.0');
  assert.equal(normalizeNumericScore('8,5'), '8.5');
  assert.equal(normalizeNumericScore(''), '');
  for (const value of ['abc', '11', '-1', 'Infinity', '1e2']) assert.equal(normalizeNumericScore(value), null);
});

test('remote updates preserve draft cells and deletions while applying unrelated remote fields', () => {
  const base = { a: 1, b: 2, c: 3 };
  const draft = { a: 4, b: 2 };
  assert.deepEqual(draftPatch(base, draft), { a: 4, c: undefined });
  assert.deepEqual(mergeRemoteDraft(base, draft, { a: 5, b: 6, c: 7, d: 8 }), { a: 4, b: 6, d: 8 });
  assert.throws(() => assertNoDraftConflicts(base, draftPatch(base, draft), { a: 5 }), /vừa sửa/);
  assert.doesNotThrow(() => assertNoDraftConflicts(base, { a: 4 }, { a: 4, b: 7 }));
});

test('changes typed during an in-flight save remain as the next draft', () => {
  const submitted = { a: '8', b: '5' };
  const live = { a: '9', b: '5' };
  const saved = { a: '8', b: '6', c: '7' };
  assert.deepEqual(mergeRemoteDraft(submitted, live, saved), { a: '9', b: '6', c: '7' });
});

test('UTF-8 chunk boundaries preserve Vietnamese and emoji within byte limits', async () => {
  const value = { school: 'Trần Hưng Đạo 🏫'.repeat(20) };
  const text = JSON.stringify(value);
  const chunks = splitUtf8Chunks(text, 25);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(part => new TextEncoder().encode(part).length <= 25));
  const metadata = { generation: 'new', chunkCount: chunks.length, digest: await contentDigest(text) };
  const pieces = chunks.map((part, index) => ({ text: part, index, generation: 'new' }));
  assert.deepEqual(await assembleGeneration(metadata, [...pieces].reverse()), value);
  await assert.rejects(assembleGeneration(metadata, pieces.slice(1)), /chưa đủ/);
  await assert.rejects(assembleGeneration(metadata, pieces.map((part, i) => i ? part : { ...part, generation: 'old' })), /khác phiên bản/);
  await assert.rejects(assembleGeneration(metadata, pieces.map((part, i) => i ? part : { ...part, text: 'tampered' })), /không khớp/);
});

test('backup validation refuses duplicates, path injection, bad counts and malformed mailboxes', () => {
  const snapshot = { version: 2, collections: { students: [{ id: 'a', fullName: 'An' }] }, manifest: { counts: { students: 1 } } };
  assert.equal(validateRestoreSnapshot(snapshot), snapshot);
  for (const id of ['../a', '__proto__', '', 'x'.repeat(1501)]) {
    assert.throws(() => validateRestoreSnapshot({ version: 1, collections: { students: [{ id }] } }));
  }
  assert.throws(() => validateRestoreSnapshot({ ...snapshot, manifest: { counts: { students: 2 } } }), /không khớp/);
  assert.throws(() => validateRestoreSnapshot({ version: 1, collections: { students: [{ id: 'a' }, { id: 'a' }] } }), /bị lặp/);
  assert.equal(validateMailboxBackup({}), false);
  assert.equal(validateMailboxBackup({ mailboxRows: [] }), true);
  assert.throws(() => validateMailboxBackup({ mailboxRows: [['invalid']] }));
  assert.ok(BACKUP_COLLECTIONS.includes('student_code_registry'));
});

test('restore only prunes included collections and refuses an oversized atomic restore', () => {
  const snapshot = { version: 1, collections: { students: [{ id: 'a', fullName: 'An' }] } };
  assert.deepEqual(buildAtomicRestorePlan(snapshot, { students: ['a', 'b'], news: ['keep'] }), [
    { type: 'set', name: 'students', id: 'a', data: { fullName: 'An' } },
    { type: 'delete', name: 'students', id: 'b' }
  ]);
  assert.throws(() => buildAtomicRestorePlan({ version: 1, collections: { students: Array.from({ length: 351 }, (_, index) => ({ id: String(index) })) } }, {}), /giới hạn/);
});

test('promotion and registration retries use stable unambiguous year/campus IDs', () => {
  const id = stableRecordId('promotion', 'HS01', '2026-2027', 'NAN');
  assert.equal(id, stableRecordId('promotion', 'HS01', '2026-2027', 'NAN'));
  assert.notEqual(id, stableRecordId('promotion', 'HS01', '2026-2027', 'TQK'));
  assert.notEqual(stableRecordId('a|b', 'c'), stableRecordId('a', 'b|c'));
  assert.throws(() => stableRecordId('promotion', ''));
  assert.throws(() => stableRecordId('promotion', 'x'.repeat(1000)), /quá dài/);
});

test('Drive listing follows every page and deduplicates file IDs', async () => {
  const urls = [];
  const pages = [{ files: [{ id: 'a' }], nextPageToken: 'two' }, { files: [{ id: 'a' }, { id: 'b' }] }];
  const files = await listDriveFiles({ folderId: 'folder', apiKey: 'key', fetchImpl: async url => {
    urls.push(new URL(url)); return { ok: true, json: async () => pages.shift() };
  } });
  assert.deepEqual(files.map(item => item.id), ['a', 'b']);
  assert.equal(urls[1].searchParams.get('pageToken'), 'two');
  assert.ok(urls[0].searchParams.get('fields').includes('nextPageToken'));
});

test('Drive errors, incomplete search and repeated page tokens are rejected', async () => {
  for (const body of [{ error: { message: 'quota' } }, { files: [], incompleteSearch: true }, {}]) {
    await assert.rejects(listDriveFiles({ folderId: 'f', apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => body }) }));
  }
  await assert.rejects(listDriveFiles({ folderId: 'f', apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ files: [], nextPageToken: 'repeat' }) }) }), /lặp/);
  await assert.rejects(listDriveFiles({ folderId: 'f', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 403 }) }), /403/);
});

test('HTML filtering blocks stored scripts, event handlers, javascript URLs and hostile embeds', () => {
  const windowObject = new JSDOM('').window;
  try {
    const sanitize = createHtmlSanitizer(windowObject);
    const html = sanitize('<script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)" target="_blank">link</a><iframe src="https://evil.example/embed" srcdoc="<script>alert(4)</script>"></iframe><div data-url="javascript:alert(5)">file</div>');
    const fragment = JSDOM.fragment(html);
    assert.equal(fragment.querySelectorAll('script,iframe,[onerror],[srcdoc],[data-url]').length, 0);
    assert.equal(fragment.querySelector('a').getAttribute('href'), null);
    assert.equal(fragment.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
  } finally { windowObject.close(); }
});

test('HTML filtering preserves formatting, MathML and approved Drive previews', () => {
  const windowObject = new JSDOM('').window;
  try {
    const html = createHtmlSanitizer(windowObject)('<table><tr><td><strong>Điểm</strong></td></tr></table><math><mi>x</mi></math><iframe src="https://drive.google.com/file/d/abc/preview"></iframe>');
    const fragment = JSDOM.fragment(html);
    assert.equal(fragment.querySelector('strong').textContent, 'Điểm');
    assert.ok(fragment.querySelector('math'));
    assert.equal(fragment.querySelector('iframe').getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation');
  } finally { windowObject.close(); }
});
