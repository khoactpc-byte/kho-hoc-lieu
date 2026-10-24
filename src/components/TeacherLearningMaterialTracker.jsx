import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, X } from 'lucide-react';
import { buildLearningMaterialRows } from '../utils/learningMaterialStats';
import LearningMaterialTable from './LearningMaterialTable';
import { observeTeacherLearningMaterials } from '../services/teacherLearningMaterials';
import { teacherClassLabel, sortTeachingSubjects } from '../utils/teacherPresentation';

export default function TeacherLearningMaterialTracker({ profile, subscriptionScope, schoolCode, schoolYear, isQuizVisible, onOpenLesson, observeMaterials = observeTeacherLearningMaterials }) {
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState('all');
  const [subject, setSubject] = useState('all');
  const [data, setData] = useState({ materials: [], notes: [], quizzes: [], loading: true });
  const [error, setError] = useState('');
  const scopeKey = JSON.stringify({ ...subscriptionScope, profile, schoolYear });
  useEffect(() => {
    if (!open) return undefined;
    setError(''); setData({ materials: [], notes: [], quizzes: [], loading: true });
    return observeMaterials(JSON.parse(scopeKey), setData, setError);
  }, [open, scopeKey, observeMaterials]);
  const { materials, notes, quizzes } = data;
  const rows = useMemo(() => buildLearningMaterialRows({ materials, notes, quizzes, schoolYear, schoolCode,
    teacherProfile: profile, grades: profile?.grades || [], subjects: profile?.subjects || [], grade, subject,
    seedEmpty: true, isQuizVisible }), [materials, notes, quizzes, schoolYear, schoolCode, profile, grade, subject, isQuizVisible]);
  const openLesson = (row, lesson, missing) => {
    onOpenLesson(row, lesson, missing);
    setOpen(false);
  };
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Theo dõi học liệu" title="Theo dõi học liệu" className="teacher-materials-trigger flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-700">
      <ListChecks className="h-4 w-4" /><span className="text-xs font-semibold">Học liệu</span>
    </button>
    {open && createPortal(<div className="learning-week-overlay" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="teacher-learning-tracker-title" className="learning-week-preview teacher-learning-tracker admin-check-panel">
        <header><div><h3 id="teacher-learning-tracker-title">Theo dõi học liệu · {schoolYear}</h3><p>Các khối, môn được phân công. Bấm số tuần để xem hoặc bổ sung học liệu.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Đóng theo dõi học liệu" autoFocus><X /></button></header>
        <div className="learning-week-preview-body">
          <div className="admin-check-filters">
            <label>Lớp <select aria-label="Lớp được phân công" value={grade} onChange={event => setGrade(event.target.value)}><option value="all">Tất cả lớp</option>{(profile?.grades || []).map(g => <option key={g} value={g}>{teacherClassLabel(profile, g)}</option>)}</select></label>
            <label>Môn <select aria-label="Môn được phân công" value={subject} onChange={event => setSubject(event.target.value)}><option value="all">Tất cả môn</option>{sortTeachingSubjects(profile?.subjects).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          </div>
          <p className="my-2 text-xs text-slate-500">Bấm số lượng tuần đã có để mở bài. “Chưa có” không tính các tuần kiểm tra 10, 18, 26, 35.</p>
          {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : data.loading ? <p role="status" className="text-sm text-slate-500">Đang tải học liệu các môn được phân công...</p> : <LearningMaterialTable rows={rows} onOpenLesson={openLesson} gradeLabel={g => teacherClassLabel(profile, g)} allowAdd />}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
