import { doc, runTransaction, FieldPath, deleteField } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { hasLegacyRowEdits } from '../utils/studentScoreKeys';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { requestPrivateApi } from './serverQuizClient';

export const scorebookRef = id => doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', id);
export const inputSettingsRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
export const hasScoreValue = value => value !== undefined && value !== null && String(value).trim() !== '';

export function assertScorebookScope(data, metadata, settings) {
  if (!metadata.schoolYear || !metadata.schoolCode || !metadata.grade) throw new Error('Thiếu năm học, cơ sở hoặc khối của sổ điểm.');
  if (settings.inputYearLocks?.[metadata.schoolYear]) throw new Error('Năm học đang khóa nhập liệu. Chưa lưu điểm.');
  for (const field of ['schoolYear', 'schoolCode', 'grade', 'sourceFile']) {
    if (data[field] && String(data[field]) !== String(metadata[field] || '')) throw new Error('Sổ điểm thuộc năm, cơ sở, khối hoặc mẫu khác. Chưa ghi đè.');
  }
  if (hasLegacyRowEdits(data.edits) || hasLegacyRowEdits(data.scoreSources)) throw new Error('Điểm cũ cần đối chiếu trước khi sửa.');
}

// Literal FieldPath keys keep student IDs containing punctuation intact.
export function writeScorebookCells(transaction, ref, metadata, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const edits = {}, scoreSources = {};
  keys.forEach(key => {
    edits[key] = patch[key].value ?? deleteField();
    scoreSources[key] = patch[key].source ?? deleteField();
  });
  const payload = { ...metadata, schemaVersion: 2, updatedAt: Date.now(), edits, scoreSources };
  transaction.set(ref, payload, { mergeFields: [...Object.keys(metadata), 'schemaVersion', 'updatedAt',
    ...keys.flatMap(key => [new FieldPath('edits', key), new FieldPath('scoreSources', key)])] });
}

export async function saveScorebookCells({ documentId, metadata, patch, expectedEdits = {}, expectedSources = {}, onlyEmpty = false }) {
  if (!documentId || !Object.keys(patch || {}).length) return { keys: [] };
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('data', 'saveScores', { documentId, metadata,
    patch: Object.fromEntries(Object.entries(patch).map(([key, cell]) => [key, { ...cell, value: cell.value ?? null }])), expectedEdits, expectedSources, onlyEmpty });
  if (Object.keys(patch).some(key => !key || /:r\d+(?::|$)/.test(key))) throw new Error('Ô điểm thiếu mã học sinh ổn định.');
  const ref = scorebookRef(documentId);
  return runTransaction(db, async transaction => {
    const data = (await transaction.get(ref)).data() || {};
    const settings = (await transaction.get(inputSettingsRef())).data() || {};
    assertScorebookScope(data, metadata, settings);
    const changes = {};
    for (const [key, cell] of Object.entries(patch)) {
      if (onlyEmpty && (hasScoreValue(data.edits?.[key]) || data.scoreSources?.[key])) continue;
      if (!sameData(data.edits?.[key], expectedEdits[key]) || !sameData(data.scoreSources?.[key], expectedSources[key])) {
        throw new Error('Có người khác vừa sửa ô điểm này. Bản nháp được giữ để đối chiếu.');
      }
      changes[key] = cell;
    }
    writeScorebookCells(transaction, ref, metadata, changes);
    return { keys: Object.keys(changes) };
  });
}
