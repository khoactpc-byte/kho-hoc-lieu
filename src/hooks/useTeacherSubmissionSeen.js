import { useEffect, useState } from 'react';
import { submissionSeenStorageKey } from '../utils/teacherSubmissionInbox';

const read = key => { try { const value = JSON.parse(window.localStorage.getItem(key) || '[]'); return new Set(Array.isArray(value) ? value.filter(v => typeof v === 'string') : []); } catch { return new Set(); } };
export default function useTeacherSubmissionSeen(profile, year) {
  const key = submissionSeenStorageKey(profile, year);
  const [stored, setStored] = useState(() => ({ key, seen: read(key) }));
  const [error, setError] = useState('');
  const seen = stored.key === key ? stored.seen : read(key);
  useEffect(() => {
    setStored({ key, seen: read(key) }); setError('');
    const update = event => { if (event.key === key) setStored({ key, seen: read(key) }); };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [key]);
  const mark = rows => {
    setStored(previous => {
      const next = new Set(previous.key === key ? previous.seen : read(key));
      rows.forEach(row => row.receiptKeys.forEach(receipt => next.add(receipt)));
      try { window.localStorage.setItem(key, JSON.stringify([...next])); }
      catch { setError('Trình duyệt chưa lưu được trạng thái đã xem. Khi tải lại, thông báo có thể xuất hiện lại.'); }
      return { key, seen: next };
    });
  };
  return { seen, mark, error };
}
