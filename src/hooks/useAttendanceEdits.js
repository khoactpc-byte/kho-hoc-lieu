import { useEffect, useRef, useState } from 'react';
import { saveAttendanceEntry } from '../services/attendance';
import { attendanceCellKey } from '../utils/attendance';

export function useAttendanceEdits(scopeKey) {
  const queues = useRef(new Map());
  const generation = useRef(0);
  const [changes, setChanges] = useState(new Map());

  useEffect(() => {
    const activeQueues = queues.current;
    generation.current += 1;
    activeQueues.clear();
    setChanges(new Map());
    return () => { generation.current += 1; activeQueues.clear(); };
  }, [scopeKey]);

  useEffect(() => {
    if (!changes.size) return undefined;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [changes.size]);

  const publish = () => setChanges(new Map([...queues.current].map(([key, edit]) =>
    [key, { input: edit.input, status: edit.status }])));

  const updateEntry = (input, { onCommit, onError }) => {
    const key = attendanceCellKey(input);
    let edit = queues.current.get(key);
    const current = edit?.status ?? input.expectedEntry?.status ?? '';
    const status = input.cycle ? (current === '' ? 'CP' : current === 'CP' ? 'KP' : '')
      : input.toggle && current === input.status ? '' : input.status;
    if (edit) {
      edit.status = status;
      publish();
      return;
    }
    edit = { input, status, confirmed: input.expectedEntry, revision: generation.current };
    queues.current.set(key, edit);
    publish();

    // Each cell has one writer. Rapid clicks replace its next queued status.
    void (async () => {
      try {
        do {
          const entry = await saveAttendanceEntry({ ...input, status: edit.status, expectedEntry: edit.confirmed });
          edit.confirmed = entry;
          if (generation.current === edit.revision) onCommit(entry, input);
        } while (edit.status !== edit.confirmed.status);
      } catch (error) {
        if (generation.current === edit.revision) {
          if (edit.confirmed) onCommit(edit.confirmed, input);
          onError(error);
        }
      } finally {
        if (generation.current === edit.revision && queues.current.get(key) === edit) {
          queues.current.delete(key);
          publish();
        }
      }
    })();
  };

  return { changes, updateEntry };
}
