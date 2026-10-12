import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPendingRegistrations, pendingRegistrationKey } from '../services/pendingRegistrations';
import { belongsToEducationLevel } from '../utils/educationLevels';

// Load outside the student workspace so pending applications are visible on every admin page.
export function usePendingRegistrationCount(enabled, scopeKey, educationLevel = '') {
  const [snapshot, setSnapshot] = useState({ scopeKey: null, items: [], loaded: false, error: '' });
  const runtimeRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const runtime = { scopeKey, active: true, controller: null, lastRefreshAt: 0 };
    runtimeRef.current = runtime;
    setSnapshot({ scopeKey, items: [], loaded: false, error: '' });
    const refresh = async () => {
      if (!runtime.active || runtime.controller || document.visibilityState === 'hidden') return;
      const controller = new AbortController();
      runtime.controller = controller;
      runtime.lastRefreshAt = Date.now();
      try {
        const items = await fetchPendingRegistrations({ signal: controller.signal });
        if (runtime.active && !controller.signal.aborted) setSnapshot({ scopeKey, items, loaded: true, error: '' });
      } catch (error) {
        if (runtime.active && !controller.signal.aborted) {
          setSnapshot(previous => ({ ...previous, error: error.message }));
        }
      } finally {
        if (runtime.controller === controller) runtime.controller = null;
      }
    };
    const resume = () => {
      if (Date.now() - runtime.lastRefreshAt >= 20000) void refresh();
    };
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    void refresh();
    return () => {
      runtime.active = false;
      runtime.controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [enabled, scopeKey]);

  const updateSnapshot = useCallback(transform => {
    const runtime = runtimeRef.current;
    if (!enabled || !runtime?.active || runtime.scopeKey !== scopeKey) return;
    // A background read started before a decision must never restore a resolved row.
    runtime.controller?.abort();
    runtime.controller = null;
    runtime.lastRefreshAt = Date.now();
    setSnapshot(previous => previous.scopeKey === scopeKey ? transform(previous) : previous);
  }, [enabled, scopeKey]);

  const replaceRegistrations = useCallback(items => {
    updateSnapshot(previous => ({ ...previous, items, loaded: true, error: '' }));
  }, [updateSnapshot]);

  const removeRegistrations = useCallback(items => {
    const resolved = new Set(items.map(pendingRegistrationKey));
    updateSnapshot(previous => ({ ...previous, items: previous.items.filter(item => !resolved.has(pendingRegistrationKey(item))) }));
  }, [updateSnapshot]);

  const current = enabled && snapshot.scopeKey === scopeKey ? snapshot : { items: [], loaded: !enabled, error: '' };
  return { count: current.items.filter(item => belongsToEducationLevel(item, educationLevel)).length, loaded: current.loaded, error: current.error, replaceRegistrations, removeRegistrations };
}
