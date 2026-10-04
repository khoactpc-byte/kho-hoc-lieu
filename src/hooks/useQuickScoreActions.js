import { useMemo } from 'react';
import { hasScoreValue } from '../services/scorebookCells';
import { normalizeNumericScore } from '../utils/scoreValues';
import { postAppsScript } from '../utils/helpers';

export function useQuickScoreActions({ user, canWrite, schoolYear, grade, schoolCode, schoolName, sourceFile,
  draft, getKey, quizKeys, students, columns, priorityIds, getStudentKey, absenceRatios, randomScore, showNotification }) {
  const metadata = useMemo(() => ({ grade: String(grade || ''), schoolYear, schoolCode, schoolName,
    sourceFile, authorId: user?.uid || '' }), [grade, schoolYear, schoolCode, schoolName, sourceFile, user?.uid]);
  const saveQuickScoreValue = async (semester, pageIndex, rowIndex, scoreIndex, rawValue) => {
    if (!user || !canWrite) return false;
    const key = getKey(semester, pageIndex, rowIndex, scoreIndex);
    const value = normalizeNumericScore(rawValue);
    if (!key) return false;
    if (value === null) { showNotification('Điểm phải là số từ 0 đến 10.', 'error'); return false; }
    const before = draft.edits[key] ?? '';
    const source = hasScoreValue(value) ? { source: 'manual', updatedAt: Date.now() }
      : (quizKeys.has(key) ? { source: 'manualCleared', updatedAt: Date.now() } : undefined);
    try {
      await draft.save({ [key]: { value: hasScoreValue(value) ? value : undefined, source } }, metadata, key);
      postAppsScript({ action: 'writeAuditLog', auditAction: 'sua_diem', actor: user.uid,
        details: { schoolYear, grade, key, before, after: value ?? '' } }).catch(() => undefined);
      return true;
    } catch (error) { showNotification('Chưa lưu được ô điểm: ' + error.message, 'error'); return false; }
  };
  const fillMissingQuickScores = async () => {
    if (!user || !canWrite) return;
    const patch = {};
    students.forEach((student, rowIndex) => {
      const priority = priorityIds.has(getStudentKey(student, rowIndex));
      columns.forEach(column => {
        if (!column.editable) return;
        const key = getKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
        // Unsaved drafts and deliberate manual clears are never empty candidates.
        if (!key || quizKeys.has(key) || hasScoreValue(draft.edits[key]) || draft.sources[key]
          || Object.hasOwn(draft.drafts, key)) return;
        patch[key] = { value: randomScore(column.subjectKey, absenceRatios[student.id], column.scoreIndex,
          Boolean(student.isClassLeader), priority), source: { source: 'random', updatedAt: Date.now() } };
      });
    });
    if (!Object.keys(patch).length) { showNotification('Không còn ô điểm trống trong phạm vi đang mở.'); return; }
    try {
      const result = await draft.save(patch, metadata, 'random-fill', { onlyEmpty: true });
      showNotification(`Đã điền ${result.keys.length} ô còn trống. Các điểm đã có được giữ nguyên.`);
    } catch (error) { showNotification('Chưa điền được điểm: ' + error.message, 'error'); }
  };
  const clearVisibleQuickScores = async () => {
    if (!user || !canWrite) return;
    const patch = {};
    students.forEach((student, rowIndex) => {
      columns.forEach(column => {
        if (!column.editable) return;
        const key = getKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
        if (!key || quizKeys.has(key)) return;
        if (!hasScoreValue(draft.edits[key]) && !Object.hasOwn(draft.drafts, key)) return;
        patch[key] = { value: undefined, source: undefined };
      });
    });
    if (!Object.keys(patch).length) { showNotification('Không có ô điểm để xóa trong phạm vi đang mở.'); return; }
    try {
      const result = await draft.save(patch, metadata, 'clear-visible');
      showNotification(`Đã xóa ${result.keys.length} ô điểm trong phạm vi đang mở.`);
    } catch (error) { showNotification('Chưa xóa được điểm: ' + error.message, 'error'); }
  };
  return { saveQuickScoreValue, fillMissingQuickScores, clearVisibleQuickScores };
}
