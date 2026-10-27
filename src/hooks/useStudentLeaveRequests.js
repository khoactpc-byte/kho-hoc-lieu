import { useCallback, useEffect, useState } from 'react';
import { subscribeLeaveRequests } from '../services/studentLeaveRequests';
import { leaveRequestErrorMessage } from '../utils/firestoreErrors';

export default function useStudentLeaveRequests({ enabled = true, role, studentId, schoolYear }) {
  const scope = JSON.stringify([enabled, role, studentId, schoolYear]);
  const [state, setState] = useState({ scope: '', requests: [], status: 'loading', error: '' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let current = true, unsubscribe;
    setState({ scope, requests: [], status: 'loading', error: '' });
    const fail = error => { if (current) setState({ scope, requests: [], status: 'error', error: leaveRequestErrorMessage(error) }); };
    try { unsubscribe = subscribeLeaveRequests({ role, studentId, schoolYear }, requests => {
      if (current) setState({ scope, requests, status: 'ready', error: '' });
    }, fail); } catch (error) { fail(error); }
    return () => { current = false; unsubscribe?.(); };
  }, [enabled, role, studentId, schoolYear, scope, revision]);
  return { ...(enabled && state.scope === scope ? state : { requests: [], status: enabled ? 'loading' : 'ready', error: '' }), retry };
}
