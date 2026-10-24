import { useEffect, useRef, useState } from 'react';

// Clearing the content uses the same transactional save as editing a lesson.
// The per-session undo never removes files, questions, or another week's data.
export default function useLessonRemoval({ contextKey, ownerKey, allowed, getDraft, cancelScheduledSave, waitForSaves, saveDraft, onSaved, onError }) {
  const latest = useRef(null), pending = useRef(null), backups = useRef(new Map());
  const [busy, setBusy] = useState(false);
  latest.current = { contextKey, ownerKey, allowed, getDraft, cancelScheduledSave, waitForSaves, saveDraft, onSaved, onError };
  useEffect(() => { backups.current.clear(); }, [ownerKey]);
  const run = async (restore, expectedKey = contextKey) => {
    const captured = latest.current;
    if (pending.current || !captured.allowed || captured.contextKey !== expectedKey) return false;
    if (restore && captured.getDraft()?.content?.trim()) {
      captured.onError(new Error('Bài đang soạn đã có nội dung mới. Chưa hoàn tác để tránh ghi đè.'));
      return false;
    }
    const before = restore ? backups.current.get(expectedKey) : captured.getDraft();
    if (!before || typeof before.baseContent !== 'string' || !before.content?.trim()) return false;
    pending.current = before.noteId; setBusy(true);
    try {
      captured.cancelScheduledSave();
      const saved = await captured.waitForSaves(before.noteId);
      if (latest.current.contextKey !== expectedKey || !latest.current.allowed) return false;
      const draft = { ...before, baseContent: restore ? '' : saved?.content ?? before.baseContent,
        baseLayoutMode: restore ? before.layoutMode : saved?.layoutMode ?? before.baseLayoutMode,
        content: restore ? before.content : '' };
      await captured.saveDraft(draft);
      if (latest.current.ownerKey === captured.ownerKey) {
        if (restore) backups.current.delete(expectedKey); else backups.current.set(expectedKey, before);
      }
      captured.onSaved(draft, { restore, current: latest.current.contextKey === expectedKey });
      return true;
    } catch (error) {
      if (latest.current.contextKey === expectedKey) captured.onError(error);
      return false;
    } finally { pending.current = null; setBusy(false); }
  };
  return { busy, canRestore: backups.current.has(contextKey), isBlocked: noteId => pending.current === noteId,
    remove: expectedKey => run(false, expectedKey), restore: () => run(true) };
}
