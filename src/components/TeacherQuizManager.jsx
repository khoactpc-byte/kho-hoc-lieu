import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, X } from 'lucide-react';
import { observeTeacherQuizManagement } from '../services/teacherLearningMaterials';
import { observeTeacherSubmissionAlerts } from '../services/teacherSubmissionAlerts';
import { buildTeacherSubmissionInbox, unreadSubmission } from '../utils/teacherSubmissionInbox';
import useTeacherSubmissionSeen from '../hooks/useTeacherSubmissionSeen';
import TeacherSubmissionInbox from './TeacherSubmissionInbox';
import TeacherMissingWeekWork from './TeacherMissingWeekWork';
import { buildWeeklyMissingWork, matchesTeacherWeeks } from '../utils/teacherWeekWork';
import { TOTAL_LESSONS } from '../config/learningDomain';
import { buildTeacherQuizManagement } from '../utils/teacherQuizManagement';
import { sortTeachingSubjects, teacherClassLabel } from '../utils/teacherPresentation';
import { normalizeMathHtml } from '../utils/quizContent';
import { typesetMath } from '../utils/mathTypesetting';
import EssayFeedbackText from './EssayFeedbackText';

function Submission({ row, onClose, inlineEssay = false, renderEssayReview }) {
  const root = useRef(null),resultRoot=useRef(null);
  useEffect(() => { typesetMath(resultRoot.current); }, [row]);
  useEffect(() => { root.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [row.key]);
  return <section ref={root} className="teacher-quiz-submission" aria-label={`Bài làm của ${row.student.fullName}`}>
    {!inlineEssay && <header><h4>Bài làm: {row.student.fullName}</h4><button type="button" onClick={onClose} aria-label="Đóng bài làm"><X className="h-4 w-4" /></button></header>}
    {row.result && <section ref={resultRoot}><h5>Trắc nghiệm: {row.quizScore}</h5>
      {!row.result.answers?.length && <p>Chưa có chi tiết đáp án trong lượt nộp này.</p>}
      {(row.result.answers || []).map((answer, i) => <article key={answer.questionId || i}>
        <div className="flex gap-2"><b>Câu {i + 1}.</b><div dangerouslySetInnerHTML={{ __html: normalizeMathHtml(answer.questionText || '') }} /></div>
        <p className={answer.isCorrect ? 'text-emerald-700' : 'text-rose-700'}>Chọn: {String(answer.selectedOptionId || 'Chưa chọn').toUpperCase()} · Đáp án: {String(answer.correctOptionId || '—').toUpperCase()} · {answer.isCorrect ? 'Đúng' : 'Sai'}</p>
      </article>)}
    </section>}
    {row.essay && inlineEssay && renderEssayReview ? renderEssayReview(row.essay,row.student,row.assignment,{inline:true}) : row.essay && <section><h5>Tự luận: {row.essayScore}</h5>
      {/^https?:\/\//i.test(row.essay.fileUrl || '') && <a href={row.essay.fileUrl} target="_blank" rel="noopener noreferrer">Mở file bài nộp: {row.essay.fileName || 'Bài tự luận'}</a>}
      {row.essay.teacherScore == null && row.essay.aiScore != null && <p>Điểm AI chấm nháp, chờ giáo viên kiểm tra.</p>}
      {row.essay.teacherComment && <><h5>Nhận xét giáo viên</h5><EssayFeedbackText text={row.essay.teacherComment}/></>}
      {row.essay.aiComment && <details><summary>Nhận xét AI</summary><EssayFeedbackText text={row.essay.aiComment}/></details>}
    </section>}
  </section>;
}

export default function TeacherQuizManager({ profile, subscriptionScope, schoolYear, isQuizVisible, onOpenQuiz, currentContext = {}, renderEssayReview, onAiGrade,canAiGrade=true, observe = observeTeacherQuizManagement, observeAlerts = observeTeacherSubmissionAlerts }) {
  const rosterRef = useRef(null), triggerRef = useRef(null);
  const [tab, setTab] = useState('student');
  const [weeks, setWeeks] = useState([String(currentContext.lesson || '1')]);
  const currentGrade = String(currentContext.grade || 'all'), currentSubject = currentContext.subject || 'all', currentWeek = String(currentContext.lesson || '1');
  const [alerts, setAlerts] = useState({ loading: true }), [alertError, setAlertError] = useState('');
  const [alertRetry, setAlertRetry] = useState(0);
  const { seen, mark, error: seenError } = useTeacherSubmissionSeen(profile, schoolYear);
  const [open, setOpen] = useState(false), [data, setData] = useState({ loading: true }), [error, setError] = useState('');
  const [grade, setGrade] = useState('all'), [subject, setSubject] = useState('all'), [publication, setPublication] = useState('all');
  const [selectedId, setSelectedId] = useState(''), [studentFilter, setStudentFilter] = useState('all'), [search, setSearch] = useState(''), [workKey, setWorkKey] = useState('');
  useEffect(() => { if (!open) return; setWeeks([currentWeek]); setGrade(currentGrade); setSubject(currentSubject); setSelectedId(''); setWorkKey(''); }, [open, currentWeek, currentGrade, currentSubject]);
  const scopeKey = JSON.stringify({ ...subscriptionScope, profile, schoolYear });
  useEffect(() => {
    if (!open) return undefined;
    setError(''); setData({ loading: true });
    return observe({ ...JSON.parse(scopeKey), includeInbox: true }, setData, setError);
  }, [open, scopeKey, observe]);
  useEffect(() => {
    setAlertError(''); setAlerts({ loading: true });
    return observeAlerts(JSON.parse(scopeKey), setAlerts, setAlertError);
  }, [scopeKey, observeAlerts, alertRetry]);
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow, trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; trigger?.focus(); };
  }, [open]);
  const inbox = useMemo(() => buildTeacherSubmissionInbox({ ...data, profile, schoolYear }).filter(row => row.submitted), [data, profile, schoolYear]);
  const alertRows = useMemo(() => buildTeacherSubmissionInbox({ ...alerts, profile, schoolYear }).filter(row => row.submitted), [alerts, profile, schoolYear]);
  const filter = open ? { grade, subject, weeks } : { grade: currentGrade, subject: currentSubject, weeks: [currentWeek] };
  const scopedInbox = inbox.filter(row => matchesTeacherWeeks(row, filter));
  const missing = buildWeeklyMissingWork({ ...data, profile, schoolYear, filter, isVisible: isQuizVisible });
  const unreadCount = (open && !data.loading && !error ? inbox : alertRows).filter(row => matchesTeacherWeeks(row, filter) && unreadSubmission(row, seen)).length;
  const quizzes = useMemo(() => buildTeacherQuizManagement({ ...data, profile, schoolYear, isVisible: isQuizVisible }), [data, profile, schoolYear, isQuizVisible]);
  const filtered = quizzes.filter(quiz => matchesTeacherWeeks(quiz, filter)
    && (publication === 'all' || (publication === 'published' ? quiz.available : !quiz.available)));
  const selected = filtered.find(quiz => quiz.id === selectedId);
  useEffect(() => { rosterRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [selectedId, studentFilter]);
  const students = (selected?.rows || []).filter(row => (studentFilter === 'all' || (studentFilter === 'done' ? row.submitted : studentFilter === 'pending' ? row.pending : !row.submitted))
    && `${row.student.fullName || ''} ${row.student.accessCode || ''}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const work = selected?.rows.find(row => row.key === workKey);
  const choose = (quiz, filter = 'all') => { setSelectedId(quiz.id); setStudentFilter(filter); setSearch(''); setWorkKey(''); };
  const navigate = action => { if (!selected) return; if (onOpenQuiz(selected, action) !== false) setOpen(false); };
  return <>
    <button ref={triggerRef} type="button" className="teacher-quiz-manager-trigger" aria-label="Danh sách bài kiểm tra" title={alertError || (unreadCount ? `Bài kiểm tra · ${unreadCount} bài nộp chưa xem` : 'Bài kiểm tra')} onClick={() => { setTab('student'); setOpen(true); }}><ClipboardCheck className="h-4 w-4" /><span>Bài kiểm tra</span>{unreadCount > 0 && <b className="teacher-submission-badge" aria-label={`${unreadCount} bài nộp chưa xem`}>{unreadCount > 99 ? '99+' : unreadCount}</b>}{alertError && <b className="teacher-alert-error" aria-label="Lỗi cập nhật thông báo">!</b>}</button>
    {open && createPortal(<div className="learning-week-overlay" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="teacher-quiz-manager-title" className="learning-week-preview teacher-quiz-manager admin-check-panel">
        <header><div><h3 id="teacher-quiz-manager-title">Bài kiểm tra · Tuần {weeks.join(', ')} · {schoolYear}</h3><p>{profile?.fullName} · Đề giáo viên và bài học sinh nộp.</p></div><button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Đóng danh sách bài kiểm tra"><X /></button></header>
        <div className="teacher-quiz-tabs" role="tablist" aria-label="Bài kiểm tra của giáo viên và học sinh">
          <button type="button" role="tab" id="teacher-work-tab" aria-selected={tab === 'teacher'} aria-controls="teacher-work-panel" onClick={() => setTab('teacher')}>Giáo viên</button>
          <button type="button" role="tab" id="student-work-tab" aria-selected={tab === 'student'} aria-controls="student-work-panel" onClick={() => setTab('student')}>Học sinh{unreadCount > 0 && <b className="teacher-submission-badge">{unreadCount}</b>}</button>
        </div>
        <div className="learning-week-preview-body" role="tabpanel" id={tab === 'teacher' ? 'teacher-work-panel' : 'student-work-panel'} aria-labelledby={tab === 'teacher' ? 'teacher-work-tab' : 'student-work-tab'}>
          <div className="admin-check-filters teacher-quiz-filters">
            <label>Lớp <select aria-label="Lọc lớp kiểm tra" value={grade} onChange={event => setGrade(event.target.value)}><option value="all">Tất cả lớp</option>{(profile?.grades || []).map(g => <option key={g} value={g}>{teacherClassLabel(profile, g)}</option>)}</select></label>
            <label>Môn <select aria-label="Lọc môn kiểm tra" value={subject} onChange={event => setSubject(event.target.value)}><option value="all">Tất cả môn</option>{sortTeachingSubjects(profile?.subjects).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            {tab === 'teacher' && <label>Đề <select aria-label="Trạng thái phát đề" value={publication} onChange={event => setPublication(event.target.value)}><option value="all">Tất cả</option><option value="published">Đã phát</option><option value="unpublished">Chưa phát</option></select></label>}
          </div>
          <div className="teacher-week-choice"><b>Tuần {weeks.join(', ')}</b><details><summary>Chọn nhiều tuần</summary><div>{Array.from({ length: TOTAL_LESSONS }, (_, i) => String(i + 1)).map(week => <label key={week}><input type="checkbox" checked={weeks.includes(week)} onChange={e => { setWeeks(previous => e.target.checked ? [...previous, week].sort((a,b) => Number(a)-Number(b)) : previous.length > 1 ? previous.filter(w => w !== week) : previous); setSelectedId(''); }} />{week}</label>)}</div></details></div>
          {(alertError || seenError) && <p role="alert" className="my-2 text-amber-700">{alertError || seenError}{alertError && <button type="button" className="teacher-quiz-link ml-2" onClick={() => setAlertRetry(n => n + 1)}>Thử lại thông báo</button>}</p>}
          {tab === 'student' ? error ? <p role="alert">{error}</p> : data.loading ? <p role="status">Đang tải bài học sinh nộp...</p> : <TeacherSubmissionInbox rows={scopedInbox} profile={profile} seen={seen} onSeen={mark} onAiGrade={onAiGrade} canAiGrade={canAiGrade} batchScope={JSON.stringify([schoolYear,grade,subject,weeks])}
            renderWork={(row, onClose) => <Submission key={row.key} row={row} onClose={onClose} inlineEssay renderEssayReview={renderEssayReview} />}
            onGrade={row => { const quiz = quizzes.find(item => item.id === row.assignmentId); if (quiz && onOpenQuiz(quiz, 'scores') !== false) setOpen(false); }}>
              {missing.some(row=>row.missing.length) && <details className="teacher-inbox-missing"><summary>Học sinh còn thiếu bài đã giao ({missing.filter(row=>row.missing.length).length})</summary><TeacherMissingWeekWork rows={missing} weeks={weeks} /></details>}
            </TeacherSubmissionInbox> : <>
          {error ? <p role="alert" className="my-3 text-rose-600">{error}</p> : data.loading ? <p role="status" className="my-3 text-slate-500">Đang tải đề, bài nộp và danh sách lớp...</p> : <>
            <div className="teacher-quiz-table-scroll"><table><thead><tr><th>Lớp</th><th>Môn</th><th>Tuần / Đề</th><th>Phát đề</th><th>Đã làm</th><th>Chưa làm</th><th>Chờ chấm</th></tr></thead>
              <tbody>{!filtered.length ? <tr><td colSpan={7}>Chưa có bài kiểm tra theo bộ lọc này.</td></tr> : filtered.map(quiz => <tr key={quiz.id} className={selectedId === quiz.id ? 'is-selected' : ''}>
                <td>{teacherClassLabel(profile, quiz.grade)}</td><td>{quiz.subject}</td><td><button type="button" className="teacher-quiz-link" onClick={() => choose(quiz)}>Tuần {quiz.lesson}</button><span className="teacher-quiz-title">{quiz.title || 'Bài kiểm tra'}</span></td>
                <td>{quiz.available ? 'Đã phát' : quiz.publishAt ? 'Hẹn giờ' : 'Nháp'}</td>
                <td><button type="button" className="teacher-quiz-link" onClick={() => choose(quiz, 'done')}>{quiz.submittedCount}/{quiz.expectedCount}</button></td>
                <td>{quiz.available ? <button type="button" className="teacher-quiz-link is-missing" onClick={() => choose(quiz, 'missing')}>{quiz.missingCount}</button> : '—'}</td>
                <td><button type="button" className="teacher-quiz-link" onClick={() => choose(quiz, 'pending')}>{quiz.pendingCount}</button></td>
              </tr>)}</tbody></table></div>
            {selected && <section ref={rosterRef} className="teacher-quiz-roster" aria-label="Danh sách làm bài">
              <div className="teacher-quiz-roster-heading"><h4>{selected.subject} · {teacherClassLabel(profile, selected.grade)} · Tuần {selected.lesson}</h4><div><button type="button" onClick={() => navigate('compose')}>Mở đề</button><button type="button" onClick={() => navigate('scores')}>Bài nộp & Chấm điểm</button></div></div>
              {!selected.available && <p className="my-2 text-xs text-amber-700">Đề chưa phát. Học sinh chưa được yêu cầu làm bài này.</p>}
              <p className="my-2 text-xs text-slate-500">Mỗi học sinh tính một lần khi có bài trắc nghiệm hoặc tự luận nộp. Bài AI chấm nháp vẫn chờ giáo viên duyệt.</p>
              <div className="teacher-quiz-roster-filters"><div>{[['all', 'Tất cả', selected.expectedCount], ['done', 'Đã làm', selected.submittedCount], ['missing', 'Chưa làm', selected.missingCount], ['pending', 'Chờ chấm', selected.pendingCount]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={studentFilter === value} onClick={() => setStudentFilter(value)}>{label} ({count})</button>)}</div><input aria-label="Tìm học sinh làm bài" placeholder="Tên hoặc mã học sinh" value={search} onChange={event => setSearch(event.target.value)} /></div>
              <div className="teacher-quiz-table-scroll"><table><thead><tr><th>Học sinh</th><th>Mã HS</th><th>Trắc nghiệm</th><th>Tự luận</th><th>Trạng thái</th><th>Bài làm</th></tr></thead>
                <tbody>{!students.length ? <tr><td colSpan={6}>Không có học sinh theo bộ lọc này.</td></tr> : students.map(row => <tr key={row.key}><td>{row.student.fullName}</td><td>{row.student.accessCode || '—'}</td><td>{row.quizScore}</td><td>{row.essayScore}{row.essay?.teacherScore == null && row.essay?.aiScore != null && <small> (AI nháp)</small>}</td><td>{!selected.available && !row.submitted ? 'Chờ phát đề' : row.status}</td><td>{row.submitted ? <button type="button" className="teacher-quiz-link" onClick={() => setWorkKey(row.key)}>Xem bài</button> : '—'}</td></tr>)}</tbody>
              </table></div>
              {work?.submitted && <><Submission row={work} onClose={() => setWorkKey('')} />{work.essay && renderEssayReview?.(work.essay, work.student, selected)}</>}
            </section>}
          </>}
          </>}
          {tab === 'teacher' && !data.loading && !error && <TeacherMissingWeekWork rows={missing} weeks={weeks} />}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
