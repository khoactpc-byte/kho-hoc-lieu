import { useCallback, useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { saveScorebookCells, scorebookRef } from '../services/scorebookCells';
import { sameData } from '../utils/dataEquality';

// Each document owns its drafts. Server acknowledgements never roll back local maps.
export function useQuickScorebook(documentId, enabled, showNotification, identityKey = '') {
  const documents = useRef(new Map());
  const active = useRef({ id: '', generation: 0 });
  const [, render] = useState(0);
  const id = enabled ? documentId : '';
  if (active.current.identityKey !== identityKey) {
    documents.current.clear();
    active.current = { id: '', identityKey, generation: active.current.generation + 1 };
  }
  if (active.current.id !== id) {
    active.current = { id, identityKey, generation: active.current.generation + 1 };
    if (id && documents.current.has(id)) documents.current.get(id).loaded = false;
  }
  if (!documents.current.has(id)) documents.current.set(id, { edits: {}, sources: {}, drafts: {}, loaded: false, operations: new Map() });
  const state = documents.current.get(id);
  const generation = active.current.generation;
  const isCurrent = () => active.current.id === id && active.current.generation === generation;
  useEffect(() => {
    if (!id) return undefined;
    state.loaded = false;
    render(value => value + 1);
    return onSnapshot(scorebookRef(id), { includeMetadataChanges: true }, snapshot => {
      if (!isCurrent() || snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
      const data = snapshot.data() || {};
      state.edits = data.edits || {};
      state.sources = data.scoreSources || {};
      state.loaded = true;
      render(value => value + 1);
    }, error => {
      if (!isCurrent()) return;
      state.loaded = false;
      render(value => value + 1);
      showNotification?.(`Chưa tải được sổ điểm: ${error.message}`, 'error');
    });
  // State and scope are bound to this subscription; only document changes resubscribe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, generation, showNotification]);
  const setter = field => update => {
    if (!isCurrent()) return;
    state[field] = typeof update === 'function' ? update(state[field]) : update;
    render(value => value + 1);
  };
  const save = async (patch, metadata, pendingKey, options = {}) => {
    if (!id || !state.loaded || !isCurrent()) throw new Error('Chờ tải sổ điểm từ máy chủ trước khi lưu.');
    const keys = Object.keys(patch);
    if ([...state.operations.values()].some(operation => operation.keys.some(key => keys.includes(key)))) {
      throw new Error('Ô này đang lưu. Bản nháp mới được giữ; chờ hoàn tất rồi lưu lại.');
    }
    const submittedDrafts = { ...state.drafts };
    const operation = {};
    state.operations.set(operation, { keys, pendingKey });
    render(value => value + 1);
    try {
      const result = await saveScorebookCells({ documentId: id, metadata, patch,
        expectedEdits: { ...state.edits }, expectedSources: { ...state.sources }, ...options });
      result.keys.forEach(key => {
        if (Object.hasOwn(submittedDrafts, key) && sameData(state.drafts[key], submittedDrafts[key])) delete state.drafts[key];
      });
      return result;
    } finally {
      state.operations.delete(operation);
      if (isCurrent()) render(value => value + 1);
    }
  };
  const hasUnsavedChanges = useCallback(() => [...documents.current.values()].some(document => Object.keys(document.drafts).length || document.operations.size), []);
  return { edits: state.edits, sources: state.sources, drafts: state.drafts, loaded: state.loaded,
    pending: [...state.operations.values()].at(-1)?.pendingKey || '', setEdits: setter('edits'), setSources: setter('sources'), setDrafts: setter('drafts'), save, hasUnsavedChanges };
}
