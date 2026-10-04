import { useEffect } from 'react';
import { requestPrivateApi, requestServerQuiz, SERVER_QUIZ_ENABLED } from '../services/serverQuizClient';
export function useStudentLearningData(identity, refresh, setResults, setQuickResults, setYear, setLocks, notify) {
  const uid = identity?.uid || identity?.sub, sessionId = identity?.sessionId, role = identity?.role;
  useEffect(() => {
    if (!SERVER_QUIZ_ENABLED || role !== 'student' || !uid || !sessionId) return undefined;
    const controller = new AbortController(); let busy = false;
    const loadHistory = async kind => {
      const rows = []; let after = null;
      do { const page = await requestServerQuiz('history', { kind, after }, { signal: controller.signal }); rows.push(...page.results); after = page.after; } while (after);
      if (!controller.signal.aborted) (kind === 'lesson' ? setResults : setQuickResults)(rows);
    };
    const load = async () => {
      if (busy) return; busy = true;
      const results = await Promise.allSettled([loadHistory('lesson'), loadHistory('material'), requestPrivateApi('data', 'workspaceConfig', {}, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) { setYear(data.schoolYear); setLocks(data.inputYearLocks || {}); }
      })]); busy = false;
      const failed = results.find(item => item.status === 'rejected' && item.reason?.name !== 'AbortError');
      if (failed && !controller.signal.aborted) notify('Chưa tải được lịch sử/thiết lập: ' + failed.reason.message, 'error');
    };
    void load(); const timer = setInterval(() => { void load(); }, 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [uid, sessionId, role, refresh, setResults, setQuickResults, setYear, setLocks, notify]);
}
