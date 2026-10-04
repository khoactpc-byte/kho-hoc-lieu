import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { assertNoDraftConflicts, draftPatch, mergeRemoteDraft } from '../utils/documentDraft';
import { assertScorebookScope, hasScoreValue, inputSettingsRef } from '../services/scorebookCells';
import { SCOPED_AUTH_ENABLED } from '../services/scopedIdentity';
import { requestPrivateApi } from '../services/serverQuizClient';

// Keep drafts per document while navigating; never replace dirty cells with snapshots.
export function useScorebookDraft(docId, showNotification, retainedDocuments) {
  const localDocuments = useRef(new Map());
  const documents = retainedDocuments || localDocuments.current;
  const [, render] = useState(0);
  const stateFor = useCallback((id) => {
    if (!documents.has(id)) documents.set(id, {
      base: {}, edits: {}, updatedAt: null, loaded: false
    });
    return documents.get(id);
  }, [documents]);
  const state = stateFor(docId);
  useEffect(() => {
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', docId);
    return onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.hasPendingWrites) return;
      const current = stateFor(docId);
      const data = snapshot.data() || {};
      const remote = data.edits || {};
      if (current.pendingSave && data.draftSaveId === current.pendingSave.id) {
        current.edits = mergeRemoteDraft(current.pendingSave.submitted, current.edits, remote);
        current.base = remote;
        current.pendingSave.acknowledged = true;
      }
      const dirty = draftPatch(current.base, current.edits);
      current.edits = mergeRemoteDraft(current.base, current.edits, remote);
      // Preserve the original base of dirty fields for conflict detection at save time.
      current.base = { ...remote, ...Object.fromEntries(Object.keys(dirty).map(key => [key, current.base[key]])) };
      current.loaded = true;
      current.updatedAt = data.updatedAt || null;
      current.columnWidths = data.columnWidths || {};
      render(value => value + 1);
    }, error => showNotification?.(`Chưa tải được sổ điểm: ${error.message}`, 'error'));
  }, [docId, showNotification, stateFor]);

  const setEdits = (update) => {
    const current = stateFor(docId);
    current.edits = typeof update === 'function' ? update(current.edits) : update;
    render(value => value + 1);
  };
  const save = async (metadata) => {
    const current = stateFor(docId);
    if (!current.loaded) throw new Error('Chờ tải sổ điểm trước khi lưu.');
    if (current.pendingSave) throw new Error('Sổ điểm đang lưu. Bản nháp được giữ; chờ hoàn tất.');
    const base = { ...current.base };
    const submitted = { ...current.edits };
    const patch = draftPatch(base, submitted);
    const pending = { id: globalThis.crypto.randomUUID(), submitted, acknowledged: false };
    current.pendingSave = pending;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', docId);
    try {
      const saved = SCOPED_AUTH_ENABLED
        ? Object.keys(patch).length ? (await requestPrivateApi('data', 'saveScores', { documentId: docId, metadata, expectedEdits: base,
          editPatch: Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value ?? null])), draftSaveId: pending.id })).edits : base
        : await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        const settings = (await transaction.get(inputSettingsRef())).data() || {};
        assertScorebookScope(data, metadata, settings);
        const remote = data.edits || {};
        assertNoDraftConflicts(base, patch, remote);
        const next = { ...remote };
        const scoreSources = { ...data.scoreSources };
        Object.entries(patch).forEach(([key, value]) => {
          if (value === undefined) delete next[key]; else next[key] = value;
          if (/:u[^:]+:s\d+$/.test(key)) {
            if (hasScoreValue(value)) scoreSources[key] = { source: 'manual', updatedAt: Date.now() };
            else if (scoreSources[key]?.source === 'quiz') scoreSources[key] = { source: 'manualCleared', updatedAt: Date.now() };
            else delete scoreSources[key];
          }
        });
        transaction.set(ref, { ...metadata, edits: next, scoreSources, draftSaveId: pending.id },
          { mergeFields: [...Object.keys(metadata), 'edits', 'scoreSources', 'draftSaveId'] });
        return next;
      });
      // The matching snapshot may already have acknowledged this save, then
      // received a newer remote edit. Never replace that newer version here.
      if (!pending.acknowledged) {
        current.edits = mergeRemoteDraft(submitted, current.edits, saved);
        current.base = saved;
        current.updatedAt = metadata.updatedAt;
      }
    } finally {
      current.pendingSave = null;
      render(value => value + 1);
    }
  };
  return { edits: state.edits, setEdits, save, loaded: state.loaded,
    isDirty: Object.keys(draftPatch(state.base, state.edits)).length > 0,
    lastSavedAt: state.updatedAt, columnWidths: state.columnWidths || {} };
}
