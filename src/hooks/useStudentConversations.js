import { useCallback, useEffect, useState } from 'react';
import { subscribeConversations } from '../services/studentConversations';
import { conversationUnread } from '../utils/studentConversations';

export default function useStudentConversations({ enabled, role, accessCode, identityKey }) {
  const scope = JSON.stringify([enabled, role, accessCode, identityKey]);
  const [state, setState] = useState({ scope: '', threads: [], status: 'loading', error: '' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled || role === 'student' && !accessCode) return;
    let current = true;
    setState({ scope, threads: [], status: 'loading', error: '' });
    const fail = error => { if (current) setState({ scope, threads: [], status: 'error', error: error.message || 'Chưa tải được tin nhắn.' }); };
    let unsubscribe;
    try { unsubscribe = subscribeConversations({ role, accessCode }, threads => {
      if (current) setState({ scope, threads, status: 'ready', error: '' });
    }, fail); } catch (error) { fail(error); }
    return () => { current = false; unsubscribe?.(); };
  }, [enabled, role, accessCode, scope, revision]);
  const result = enabled && state.scope === scope ? state : { threads: [], status: enabled ? 'loading' : 'ready', error: '' };
  return { ...result, retry, unreadCount: result.threads.filter(thread => conversationUnread(thread, role)).length };
}
