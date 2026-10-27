import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Columns, Maximize, Minimize, X } from 'lucide-react';
import { observeTeachingLesson } from '../services/teachingLesson';
import { teacherHasContentScope } from '../utils/teacherAccess';
import { sortTeachingSubjects, teacherClassLabel } from '../utils/teacherPresentation';
import { TOTAL_LESSONS } from '../config/learningDomain';
import { teacherLessonHtml } from '../utils/lessonAnswers';
import { normalizeMathHtml } from '../utils/quizContent';
import { typesetMath } from '../utils/mathTypesetting';
import { lessonUsesMath } from '../utils/lessonSubject';
import { getEmbedUrl } from '../utils/helpers';
import { isFirestoreQuotaError } from '../utils/firestoreErrors';
import { sanitizeHtml } from '../utils/safeHtml';

const emptyLesson = { notes: [], materials: [], quizzes: [], loading: true };
const assignedSubjects = (profile, grade) => sortTeachingSubjects(profile?.subjects).filter(subject => teacherHasContentScope(profile, { schoolCode: profile.schoolCode, grade, subject }));
const gradesFor = profile => [...new Set((profile?.grades || []).map(String))].filter(grade => assignedSubjects(profile, grade).length).sort((a, b) => Number(a) - Number(b));
const selectionFor = (profile, preferred = {}, fallbackGrade) => {
  const grades = gradesFor(profile), grade = grades.includes(String(preferred.grade)) ? String(preferred.grade) : fallbackGrade || grades[0] || '';
  const subjects = assignedSubjects(profile, grade);
  return { grade, subject: subjects.includes(preferred.subject) ? preferred.subject : subjects[0] || '', lesson: String(preferred.lesson || 1) };
};

export default function TeacherSplitScreen({ profile, subscriptionScope, schoolYear, currentContext, observeLesson = observeTeachingLesson }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="teacher-split-trigger" onClick={() => setOpen(true)} disabled={!gradesFor(profile).length} title="Dạy hai lớp trên cùng màn hình"><Columns size={16} /><span>Chia đôi</span></button>
    {open && <SplitWorkspace key={JSON.stringify([profile, schoolYear])} profile={profile} subscriptionScope={subscriptionScope} schoolYear={schoolYear} currentContext={currentContext} observeLesson={observeLesson} onClose={() => setOpen(false)} />}
  </>;
}

function SplitWorkspace({ profile, subscriptionScope, schoolYear, currentContext, observeLesson, onClose }) {
  const grades = gradesFor(profile);
  const [panes, setPanes] = useState(() => {
    const left = selectionFor(profile, currentContext);
    return [left, selectionFor(profile, { subject: left.subject, lesson: left.lesson }, grades.find(grade => grade !== left.grade) || left.grade)];
  });
  const [data, setData] = useState({}), [revision, setRevision] = useState(0), [fullscreen, setFullscreen] = useState(false), [screenError, setScreenError] = useState('');
  const root = useRef(null);
  const subscriptions = useRef(new Map());
  const contextKey = JSON.stringify([...new Set(panes.map(pane => JSON.stringify(pane)))].sort());
  const scopeKey = JSON.stringify({ ...subscriptionScope, profile, schoolYear });
  useEffect(() => {
    const wanted = JSON.parse(contextKey).map(key => ({ key, id: JSON.stringify([scopeKey, revision, key]) }));
    for (const [id, job] of subscriptions.current) if (!wanted.some(item => item.id === id)) {
      job.active = false; job.unsubscribe?.(); subscriptions.current.delete(id);
    }
    for (const { key, id } of wanted) {
      if (subscriptions.current.has(id)) continue;
      const job = { active: true };
      subscriptions.current.set(id, job);
      setData(previous => ({ ...previous, [key]: { ...emptyLesson, subscriptionId: id } }));
      const update = value => { if (job.active) setData(previous => ({ ...previous, [key]: { ...value, subscriptionId: id } })); };
      job.unsubscribe = observeLesson({ ...JSON.parse(scopeKey), ...JSON.parse(key) }, update,
        error => update({ ...emptyLesson, loading: false, error: isFirestoreQuotaError(error) ? 'Hệ thống dữ liệu đã chạm hạn mức. Vui lòng báo quản trị viên kiểm tra Firestore.' : error?.message || 'Chưa tải được bài học.' }));
    }
  }, [contextKey, scopeKey, revision, observeLesson]);
  useEffect(() => {
    const jobs = subscriptions.current;
    return () => { for (const job of jobs.values()) { job.active = false; job.unsubscribe?.(); } jobs.clear(); };
  }, []);
  useEffect(() => {
    const previousFocus = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector('button')?.focus();
    const sync = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', sync);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('fullscreenchange', sync); previousFocus?.focus?.(); };
  }, []);
  const close = async () => { if (document.fullscreenElement === root.current) { try { await document.exitFullscreen(); } catch { /* Closing remains available. */ } } onClose(); };
  const toggleFullscreen = async () => {
    setScreenError('');
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setScreenError('Trình duyệt này chưa hỗ trợ nút toàn màn hình. Có thể dùng F11.');
    } catch { setScreenError('Chưa bật được toàn màn hình. Có thể dùng F11.'); }
  };
  const keydown = event => {
    if (event.key === 'Escape' && !document.fullscreenElement) { event.stopPropagation(); void close(); }
    if (event.key !== 'Tab') return;
    const items = [...root.current.querySelectorAll('button:not(:disabled), select, summary, a[href], iframe')], first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return createPortal(<section ref={root} className="teacher-split-workspace" role="dialog" aria-modal="true" aria-labelledby="teacher-split-title" onKeyDown={keydown}>
    <header className="teacher-split-header"><div><h2 id="teacher-split-title">Dạy hai lớp</h2><p>Chọn lớp, môn và tuần riêng ở mỗi bên · {schoolYear}</p></div><div className="teacher-split-actions"><button type="button" onClick={toggleFullscreen}>{fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}<span>{fullscreen ? 'Thu màn hình' : 'Toàn màn hình'}</span></button><button type="button" onClick={() => void close()} aria-label="Đóng chia đôi màn hình"><X size={18} /><span>Đóng</span></button></div></header>
    {screenError && <p role="status" className="teacher-split-notice">{screenError}</p>}
    <div className="teacher-split-panes">{panes.map((pane, index) => {
      const value = data[JSON.stringify(pane)], id = JSON.stringify([scopeKey, revision, JSON.stringify(pane)]);
      return <TeachingPane key={index} index={index} profile={profile} grades={grades} selection={pane} data={value?.subscriptionId === id && subscriptions.current.has(id) ? value : emptyLesson} onRetry={() => setRevision(value => value + 1)} onChange={next => setPanes(previous => previous.map((item, i) => i === index ? next : item))} />;
    })}</div>
  </section>, document.body);
}

function TeachingPane({ index, profile, grades, selection, data, onChange, onRetry }) {
  const { grade, subject, lesson } = selection, side = index === 0 ? 'trái' : 'phải';
  const root = useRef(null), [material, setMaterial] = useState(null);
  const contextKey = JSON.stringify(selection), mathEnabled = lessonUsesMath(subject);
  const html = useMemo(() => {
    const source = data.notes.map(note => note.content || '').join('\n');
    return teacherLessonHtml(mathEnabled ? normalizeMathHtml(source) : sanitizeHtml(source));
  }, [data.notes, mathEnabled]);
  useEffect(() => { setMaterial(null); root.current?.scrollTo?.({ top: 0 }); }, [contextKey]);
  useEffect(() => { if (mathEnabled && !data.loading) typesetMath(root.current); }, [html, data.quizzes, mathEnabled, data.loading]);
  const change = patch => onChange({ ...selection, ...patch });
  return <section className="teacher-split-pane" aria-label={`Lớp bên ${side}`}>
    <div className="teacher-split-selectors">
      <label>Lớp<select aria-label={`Lớp bên ${side}`} value={grade} onChange={event => change({ grade: event.target.value, subject: assignedSubjects(profile, event.target.value).includes(subject) ? subject : assignedSubjects(profile, event.target.value)[0] })}>{grades.map(value => <option key={value} value={value}>{teacherClassLabel(profile, value)}</option>)}</select></label>
      <label>Môn<select aria-label={`Môn bên ${side}`} value={subject} onChange={event => change({ subject: event.target.value })}>{assignedSubjects(profile, grade).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Tuần<select aria-label={`Tuần bên ${side}`} value={lesson} onChange={event => change({ lesson: event.target.value })}>{Array.from({ length: TOTAL_LESSONS }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
    </div>
    <div ref={root} className="teacher-split-content teacher-content" onToggleCapture={event => { if (mathEnabled && event.target.open) typesetMath(event.target); }}>
      {data.error ? <p role="alert">{data.error} <button type="button" onClick={onRetry}>Thử tải lại</button></p> : data.loading ? <p role="status">Đang tải bài học…</p> : <>
        <div key={contextKey + html} className="lesson-column-content" data-columns="1" dangerouslySetInnerHTML={{ __html: html }} />
        {!data.notes.length && <p>Tuần này chưa có nội dung bài học.</p>}
        {!!data.materials.length && <div className="teacher-split-materials"><h3>Tài liệu</h3>{data.materials.filter(item => /^https?:\/\//i.test(item.url || '')).map(item => <button type="button" key={item.id} onClick={() => setMaterial(item)}>{item.title || 'Mở tài liệu'}</button>)}</div>}
        {material && <div className="teacher-split-media"><button type="button" onClick={() => setMaterial(null)}>Đóng tài liệu · {material.title}</button><iframe src={getEmbedUrl(material.url)} title={material.title || `Tài liệu bên ${side}`} allowFullScreen /></div>}
        {data.quizzes.map(quiz => <details key={quiz.id}><summary>{quiz.title || 'Bài kiểm tra'}</summary><div className="lesson-column-content" dangerouslySetInnerHTML={{ __html: teacherLessonHtml(mathEnabled ? normalizeMathHtml(quiz.content || quiz.quizHtml || '') : sanitizeHtml(quiz.content || quiz.quizHtml || '')) }} /></details>)}
      </>}
    </div>
  </section>;
}
