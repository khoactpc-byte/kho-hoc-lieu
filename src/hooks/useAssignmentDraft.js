import { useCallback, useEffect, useState } from 'react';

// Keep the server version on which editing began until a successful save.
export function useAssignmentDraft(remoteValue) {
  const [draft, setDraft] = useState(() => ({ value: remoteValue || {}, base: remoteValue || {}, dirty: false }));
  useEffect(() => {
    setDraft(previous => previous.dirty ? previous : { value: remoteValue || {}, base: remoteValue || {}, dirty: false });
  }, [remoteValue]);
  const setValue = useCallback(updater => setDraft(previous => ({ ...previous,
    value: typeof updater === 'function' ? updater(previous.value) : updater })), []);
  const setDirty = useCallback(dirty => setDraft(previous => ({ ...previous, dirty })), []);
  const acknowledge = useCallback((sentDraft, savedValue) => setDraft(previous => ({
    value: previous.value === sentDraft ? savedValue : previous.value,
    base: savedValue,
    dirty: previous.value !== sentDraft
  })), []);
  return { ...draft, setValue, setDirty, acknowledge };
}
