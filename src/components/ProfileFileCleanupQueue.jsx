import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { belongsToEducationLevel } from '../utils/educationLevels';
import { profileCleanupMessage, retryProfileFileCleanup } from '../services/profileFileCleanup';

export default function ProfileFileCleanupQueue({ students, educationLevel, disabled, syncStudent, showNotification }) {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'student_file_cleanup_jobs'), where('status', 'in', ['pending', 'failed', 'running'])), snapshot => {
    setJobs(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
    setError('');
  }, () => setError('Chưa tải được danh sách file cũ chờ dọn.')), []);
  useEffect(() => {
    if (!jobs.some(job => job.status === 'running')) return;
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, [jobs]);
  const visibleJobs = jobs.filter(job => belongsToEducationLevel(students.find(student => student.id === job.studentId) || job, educationLevel));
  if (!visibleJobs.length && !error) return null;
  const retry = async job => {
    setBusy(job.id);
    try { showNotification?.(profileCleanupMessage(await retryProfileFileCleanup(job.id, syncStudent))); }
    catch (error) { showNotification?.('Ảnh mới đã được duyệt; chưa dọn xong file cũ: ' + error.message, 'error'); }
    finally { setBusy(''); }
  };
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      <div className="font-medium">File cũ chờ dọn</div>
      {error && <p role="alert" className="mt-1">{error}</p>}
      {visibleJobs.map(job => <div key={job.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 pt-2">
        <div><div>{job.studentName} · {job.fileIds.length} file</div><p className="mt-1">{job.message || 'Ảnh mới đã lưu. File cũ được giữ cho đến khi dọn thành công.'}</p></div>
        <button type="button" onClick={() => retry(job)} disabled={disabled || Boolean(busy) || job.leaseUntil > now} className="rounded border border-amber-300 bg-white px-3 py-2 disabled:opacity-50">{busy === job.id || job.leaseUntil > now ? 'Đang dọn…' : 'Thử dọn lại'}</button>
      </div>)}
    </div>
  );
}
