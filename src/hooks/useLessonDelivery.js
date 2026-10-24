import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getLessonDeliveryState, notifyLessonSaved, retryLessonDelivery, startLessonDeliveryRetries,
  subscribeLessonDelivery } from '../services/lessonDelivery.js';

/**
 * enabled should follow staff/admin login state. Enabling retries persisted IDs,
 * including when no lesson is selected. Repeated note changes do not restart retries.
 * state.status is idle/disabled/pending/synced/stale/error; state.syncing marks a request.
 * A source save and public delivery are separate successes; only synced confirms delivery.
 */
export function useLessonDelivery({ noteId, enabled = false, sourceState }) {
  const attempted = useRef(new Set());
  const subscribe = useCallback(listener => {
    if (!enabled) return () => {};
    return subscribeLessonDelivery(state => { if (state.noteId === noteId) listener(); });
  }, [noteId, enabled]);
  const snapshot = useCallback(() => getLessonDeliveryState(noteId), [noteId]);
  const localState = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (enabled) return startLessonDeliveryRetries();
    return undefined;
  }, [enabled]);
  const sourceStatus = sourceState?.state, requestId = sourceState?.requestId;
  useEffect(() => {
    if (!enabled || !noteId || !['pending', 'error'].includes(sourceStatus)) return;
    const key = JSON.stringify([noteId, requestId ?? null]);
    if (attempted.current.has(key)) return;
    attempted.current.add(key);
    // A new source request during an older call must get its own follow-up.
    notifyLessonSaved(noteId);
  }, [noteId, enabled, sourceStatus, requestId]);
  const state = useMemo(() => {
    if (!enabled || localState.status === 'disabled' || localState.syncing) return localState;
    if (['pending', 'syncing', 'error'].includes(sourceStatus)) {
      return { noteId, status: sourceStatus === 'syncing' ? 'pending' : sourceStatus,
        syncing: sourceStatus === 'syncing', error: sourceStatus === 'error' ? 'sync_failed' : null };
    }
    // The durable worker can complete after a browser timeout or while it is offline.
    if (sourceStatus === 'synced') {
      return { noteId, status: 'synced', syncing: false, error: null,
        ...(typeof sourceState.published === 'boolean' ? { published: sourceState.published } : {}),
        ...(typeof sourceState.contentHash === 'string' ? { contentHash: sourceState.contentHash } : {}) };
    }
    return localState;
  }, [enabled, noteId, localState, sourceStatus, sourceState]);
  const retry = useCallback(() => enabled ? retryLessonDelivery(noteId) : Promise.resolve(getLessonDeliveryState(noteId)), [noteId, enabled]);
  return { state, retry };
}

export default useLessonDelivery;
