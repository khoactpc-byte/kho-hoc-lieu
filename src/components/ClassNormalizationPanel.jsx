import { useState } from 'react';
import { planClassNormalization, verifyClassNormalization } from '../utils/classNormalization';
import { applyClassNormalization } from '../services/classNormalization';
import { postAppsScript } from '../utils/helpers';

const labels = { students: 'Hồ sơ học sinh', student_archives: 'Hồ sơ lưu trữ', class_attendance: 'Điểm danh', class_timetables: 'Lịch lớp', class_schedules: 'Thời khóa biểu', student_profile_requests: 'Yêu cầu sửa', admission_applications: 'Tuyển sinh' };
export default function ClassNormalizationPanel({ captureSnapshot, busy, beginOperation, finishOperation, showNotification }) {
  const [snapshot, setSnapshot] = useState(null), [plan, setPlan] = useState(null), [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [stage, setStage] = useState('');
  const read = async () => {
    if (!beginOperation('class-preview')) return;
    try { setErrorMessage(''); const fresh = await captureSnapshot(); setSnapshot(fresh); setPlan(planClassNormalization(fresh)); setResult(null); }
    catch (error) { setErrorMessage(error.message); showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };
  const apply = async () => {
    if (!plan || !beginOperation('class-apply')) return;
    try {
      setErrorMessage(''); setStage('Đang tạo bản sao lưu…');
      const backup = await postAppsScript({ action: 'createSystemBackup', snapshot, reason: 'truoc-chuan-hoa-lop-A', actor: 'Admin' });
      if (backup.status !== 'success' || !backup.id) throw new Error('Chưa tạo được sao lưu. Chưa đổi dữ liệu.');
      setStage('Đang chuẩn hóa lớp…');
      const outcome = await applyClassNormalization(plan, backup.id);
      setStage('Đang đọc lại đối chiếu…');
      const fresh = await captureSnapshot();
      verifyClassNormalization(snapshot, fresh, plan);
      setResult(outcome); setSnapshot(fresh); setPlan(planClassNormalization(fresh));
      showNotification?.('Đã chuẩn hóa lớp Nguyễn An Ninh về đuôi A trên tất cả năm.');
    } catch (error) { setErrorMessage(error.message); showNotification?.(error.message, 'error'); } finally { setStage(''); finishOperation(); }
  };
  const verifyBackup = async () => {
    if (!beginOperation('class-verify')) return;
    try {
      setErrorMessage(''); setStage('Đang đối chiếu với bản gốc…');
      const listing = await postAppsScript({ action: 'listSystemBackups', actor: 'Admin' });
      const item = (listing.backups || []).filter(row => /truoc-chuan-hoa-lop-A\.json$/i.test(row.name)).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!item) throw new Error('Chưa tìm thấy bản sao lưu trước khi chuẩn hóa lớp A.');
      const response = await postAppsScript({ action: 'getSystemBackup', fileId: item.id, actor: 'Admin' });
      const original = response.backup?.snapshot;
      if (response.backup?.reason !== 'truoc-chuan-hoa-lop-A' || original?.version !== 2) throw new Error('Bản sao lưu lớp chưa hợp lệ.');
      const originalPlan = planClassNormalization(original);
      if (originalPlan.conflicts.length) throw new Error('Bản gốc có mục cần đối chiếu.');
      const fresh = await captureSnapshot();
      verifyClassNormalization(original, fresh, originalPlan);
      const remaining = planClassNormalization(fresh);
      if (remaining.groups.length || remaining.conflicts.length) throw new Error('Còn lớp cần chuẩn hóa hoặc đối chiếu.');
      setSnapshot(fresh); setPlan(remaining); setResult({ completed: originalPlan.groups.length, backupId: item.id });
    } catch (error) { setErrorMessage(error.message); showNotification?.(error.message, 'error'); } finally { setStage(''); finishOperation(); }
  };
  return <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal text-slate-700">
    <p>Chuẩn hóa lớp Nguyễn An Ninh · đuôi A</p>
    <p className="mt-1 text-xs text-slate-500">Đổi tên lớp hiện có và lịch sử lớp trên tất cả năm học. Giữ mã học sinh, điểm, ngày nghỉ và lịch học. Lớp đã gán Trần Quang Khải không bị đổi.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button disabled={Boolean(busy)} onClick={read} className="rounded border px-3 py-1.5 disabled:opacity-50">Kiểm tra lớp tất cả năm</button>
      <button disabled={Boolean(busy)} onClick={verifyBackup} className="rounded border px-3 py-1.5 disabled:opacity-50">Đối chiếu với sao lưu lớp A</button>
      {plan && <button disabled={Boolean(busy) || !plan.groups.length || Boolean(plan.conflicts.length)} onClick={apply} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">Sao lưu và chuẩn hóa lớp A</button>}
    </div>
    {plan && <div className="mt-2" data-testid="class-normalization-preview">
      <p>{plan.groups.length} mục cần đổi lớp · {plan.conflicts.length} mục cần đối chiếu.</p>
      <p className="mt-1 text-xs">{Object.entries(plan.counts).map(([name, count]) => `${labels[name] || name}: ${count}`).join(' · ')}</p>
      {plan.changes.length > 0 && <details className="mt-1 text-xs"><summary>Các tên lớp sẽ đổi</summary>{plan.changes.map(change => <p key={change}>{change}</p>)}</details>}
      {plan.conflicts.map(item => <p key={`${item.name}/${item.id}`} className="text-xs text-amber-700">{labels[item.name]}: {item.reason}</p>)}
    </div>}
    {result && <p role="status" className="mt-2 text-emerald-700">Đã đổi {result.completed} mục và đọc lại đối chiếu. Điểm, ngày nghỉ và mã học sinh được giữ nguyên. Đã sao lưu trước khi thay đổi.</p>}
    {stage && <p role="status" className="mt-2 text-xs">{stage}</p>}
    {errorMessage && <p role="alert" className="mt-2 text-xs text-rose-700">{errorMessage}</p>}
    <p className="mt-2 text-xs text-slate-500">Sheet Data dùng các cột lớp sẵn có; không cần thêm cột cơ sở theo năm.</p>
  </section>;
}
