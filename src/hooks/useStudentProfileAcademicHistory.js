import { useCallback, useEffect, useState } from 'react';
import { loadStudentProfileAcademicHistory } from '../services/studentProfileAcademicHistory';

export default function useStudentProfileAcademicHistory(enabled, student, records, currentSchoolYear) {
  const [state, setState] = useState({ scope: '', rows: null, status: 'loading', error: '' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  const scope = JSON.stringify([student?.id, student?.accessCode, currentSchoolYear]);
  useEffect(() => {
    if (!enabled || !student?.id) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      setState({ scope, rows: null, status: 'error', error: 'Máy chủ phản hồi chậm. Vui lòng tải lại kết quả.' });
    }, 30000);
    setState({ scope, rows: null, status: 'loading', error: '' });
    loadStudentProfileAcademicHistory({ student, records, currentSchoolYear, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setState({ scope, rows: result.rows, status: 'ready', error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ scope, rows: null, status: 'error', error: error.message });
    }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, student, records, currentSchoolYear, scope, revision]);
  return enabled && state.scope === scope ? { ...state, retry } : { rows: null, status: enabled ? 'loading' : 'ready', error: '', retry };
}
