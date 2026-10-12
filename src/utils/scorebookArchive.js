import { normalizeSchoolCode, normalizeSchoolYearKey } from './schoolClasses.js';

export function scorebookDocumentId({ schoolYear, sourceFile, schoolCode, grade }) {
  return `${schoolYear || 'nam-hoc'}_${sourceFile || 'so-diem'}_${schoolCode}_khoi_${grade || 'tat-ca'}`.replace(/[^\w-]+/g, '_');
}

export function scorebookArchiveScope(document = {}) {
  return {
    schoolYear: normalizeSchoolYearKey(document.schoolYear),
    sourceFile: String(document.sourceFile || ''),
    schoolCode: normalizeSchoolCode(document.schoolCode) || normalizeSchoolCode(document.schoolName) || 'UNKNOWN',
    grade: String(document.grade || '').trim()
  };
}

// An old book without a campus stays unassigned. Never attach it to a named campus by guessing.
export function scorebooksForScope(documents = [], scope = {}) {
  const expected = scorebookArchiveScope(scope);
  return documents.filter(document => {
    if (document.campusNormalization?.archivedTo) return false;
    const actual = scorebookArchiveScope(document);
    return actual.schoolYear === expected.schoolYear && actual.sourceFile === expected.sourceFile
      && actual.schoolCode === expected.schoolCode && actual.grade === expected.grade;
  }).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0) || a.id.localeCompare(b.id));
}

export function resolveScorebookDocument(documents, scope, selectedId = '') {
  const canonicalId = scorebookDocumentId(scope);
  const candidates = scorebooksForScope(documents, scope);
  const selected = candidates.find(document => document.id === selectedId);
  const canonical = candidates.find(document => document.id === canonicalId);
  // Preserve separate saved versions. Ambiguous archives require choosing a version.
  const document = selected || canonical || (candidates.length === 1 ? candidates[0] : null);
  return { id: document?.id || canonicalId, document, candidates,
    needsSelection: !document && candidates.length > 1, archived: Boolean(document && document.id !== canonicalId) };
}
