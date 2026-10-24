import { useEffect, useRef, useState } from 'react';
import { observeLearningUpdates, syncLearningUpdate } from '../services/learningUpdates';
import { learningUpdateId, learningUpdateMetadata } from '../utils/learningUpdates';
import { sameData } from '../utils/dataEquality';

export default function useLearningUpdates({ user, role, isAdmin, notes, quizzes, materials }) {
  const [items, setItems] = useState([]), [error, setError] = useState('');
  const seen = useRef(new Map()), currentItems = useRef(items);
  currentItems.current = items;
  const uid = user?.uid || '';
  useEffect(() => {
    setItems([]); setError('');
    if (!uid) return undefined;
    let active = true;
    const unsubscribe = observeLearningUpdates(rows => { if (active) { setItems(rows); setError(''); } }, () => {
      if (active) setError('Chưa tải được cập nhật bài học.');
    });
    return () => { active = false; unsubscribe(); };
  }, [uid]);
  useEffect(() => {
    seen.current = new Map();
  }, [uid, role, isAdmin]);
  useEffect(() => {
    if (!uid || !isAdmin && role !== 'teacher') return undefined;
    let active = true;
    const candidates = [['note', notes], ['quiz', quizzes], ['material', materials]].flatMap(([kind, rows]) => [...rows]
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)).slice(0, 12)
      .map(source => ({ kind, id: source.id, metadata: learningUpdateMetadata(kind, source.id, source) })));
    const visible = new Map(candidates.map(item => [learningUpdateId(item.kind, item.id), item]));
    // Re-read removed sources too; changing subjects must never delete another subject's announcement.
    const targets = [...new Map([...seen.current, ...visible]).values()];
    seen.current = visible;
    const known = new Map(currentItems.current.map(item => [learningUpdateId(item.kind, item.sourceId), item]));
    void (async () => {
      for (const item of targets) {
        if (!active) break;
        if (visible.has(learningUpdateId(item.kind, item.id)) && sameData(item.metadata, known.get(learningUpdateId(item.kind, item.id)))) continue;
        try { await syncLearningUpdate(item.kind, item.id, () => active); }
        catch { if (active) setError('Chưa đồng bộ được thông báo cập nhật.'); }
      }
    })();
    return () => { active = false; };
  }, [uid, role, isAdmin, notes, quizzes, materials]);
  return { items, error };
}
