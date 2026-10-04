import { useCallback, useEffect, useState } from 'react';
import { requestServerQuiz, SERVER_QUIZ_ENABLED } from '../services/serverQuizClient';

export function useQuickQuizSession(material, role, user, notify) {
  const [response, setResponse] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const id = material?.type === 'quick_quiz' ? material.id : null;
  const uid = user?.uid, version = material?.serverVersion;
  useEffect(() => {
    setResponse(null);
    if (!SERVER_QUIZ_ENABLED || !id || !uid) return undefined;
    const controller = new AbortController();
    requestServerQuiz(role === 'student' ? 'start' : 'read', { kind: 'material', quizId: id }, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResponse(value); })
      .catch(error => { if (!controller.signal.aborted) notify(error.message, 'error'); });
    return () => controller.abort();
  }, [id, uid, role, version, refresh, notify]);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  return { response, reload, id };
}
