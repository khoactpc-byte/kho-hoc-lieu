import { useState } from 'react';
import { planCampusNormalization } from '../utils/campusNormalization';
import { applyCampusNormalization } from '../services/campusNormalization';
import { postAppsScript } from '../utils/helpers';

const labels = { students: 'Hồ sơ học sinh', student_archives: 'Hồ sơ lưu trữ', scorebooks: 'Sổ điểm', class_attendance: 'Điểm danh',
  class_timetables: 'Lịch học theo cơ sở', class_schedules: 'Thời khóa biểu', schedule_publications: 'Lịch đã công bố',
  student_profile_requests: 'Yêu cầu sửa hồ sơ', admission_applications: 'Hồ sơ tuyển sinh', materials: 'Học liệu',
  lesson_notes: 'Ghi chú bài học', lesson_quizzes: 'Bài kiểm tra', quiz_results: 'Kết quả kiểm tra', quick_quiz_results: 'Kết quả trắc nghiệm',
  lesson_progress: 'Tiến độ học', handwritten_submissions: 'Bài nộp' };

export default function CampusNormalizationPanel({ captureSnapshot, busy, beginOperation, finishOperation, showNotification }) {
  const [preview, setPreview] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const read = async () => {
    if (!beginOperation('campus-preview')) return;
    try {
      const value = await captureSnapshot();
      setPreview(planCampusNormalization(value, 'NAN')); setSnapshot(value); setResult(null); setProgress(null);
    } catch (error) { showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };
  const apply = async () => {
    if (!preview || !snapshot || !beginOperation('campus-apply')) return;
    try {
      setProgress({ completed: 0, total: preview.groups.length });
      const backup = await postAppsScript({ action: 'createSystemBackup', snapshot, reason: 'truoc-chuan-hoa-co-so', actor: 'Admin' });
      if (backup.status !== 'success' || !backup.id) throw new Error('Chưa tạo được bản sao lưu. Dữ liệu chưa được chuẩn hóa.');
      const outcome = await applyCampusNormalization(preview, backup.id, setProgress);
      setResult(outcome);
      const fresh = await captureSnapshot();
      setPreview(planCampusNormalization(fresh, 'NAN')); setSnapshot(fresh);
      showNotification?.('Đã chuẩn hóa cơ sở. Bản gốc được giữ trong sao lưu.');
    } catch (error) { showNotification?.(`Chuẩn hóa chưa hoàn tất: ${error.message}`, 'error'); } finally { finishOperation(); }
  };
  return <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal text-slate-700">
    <p>Chuẩn hóa cơ sở của dữ liệu hiện có</p>
    <p className="mt-1 text-xs text-slate-500">Gán các hồ sơ chưa có cơ sở về THCS Nguyễn An Ninh trên tất cả năm học. Giữ nguyên mã học sinh, lớp, năm học và điểm. Hồ sơ đã thuộc cơ sở khác được giữ lại để đối chiếu.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={Boolean(busy)} onClick={read} className="rounded border px-3 py-1.5 disabled:opacity-50">Kiểm tra cơ sở tất cả năm</button>
      {preview && <button type="button" disabled={Boolean(busy) || !preview.groups.length || Boolean(preview.conflicts.length)} onClick={apply} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">Sao lưu và chuẩn hóa về Nguyễn An Ninh</button>}
    </div>
    {preview && <div className="mt-3">
      <p>{preview.groups.length} mục cần chuẩn hóa · {preview.conflicts.length} mục cần đối chiếu · {preview.skipped.length} mục thuộc cơ sở khác.</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{Object.entries(preview.counts).map(([name, count]) => <span key={name}>{labels[name] || name}: {count}</span>)}</div>
      {preview.conflicts.map(item => <p key={`${item.name}/${item.id}`} className="mt-1 text-xs text-amber-700">{labels[item.name]} · {item.id}: {item.reason}</p>)}
    </div>}
    {progress && !result && <p className="mt-2 text-xs">Đang chuẩn hóa {progress.completed}/{progress.total} mục.</p>}
    {result && <p role="status" className="mt-2 text-xs text-emerald-700">Đã chuẩn hóa {result.completed} mục. Đã tạo sao lưu trước khi thay đổi.</p>}
    <p className="mt-2 text-xs text-slate-500">Sheet Data cần thống nhất cột BB “Cơ sở đăng ký” và BC “Mã cơ sở”. Việc này không đổi lớp/năm hiện tại hoặc lịch sử lớp.</p>
  </section>;
}
