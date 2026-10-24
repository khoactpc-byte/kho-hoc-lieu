import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { normalizeMathHtml } from '../utils/quizContent';
import { typesetMath } from '../utils/mathTypesetting';

export default function LearningWeekPreview({ row, lesson, onClose }) {
  const root = useRef(null);
  const week = row.weeks.find(item => item.lesson === String(lesson));
  useEffect(() => { typesetMath(root.current); }, [row, lesson]);
  useEffect(() => {
    const previous = document.activeElement;
    const close = root.current?.querySelector('button');
    close?.focus();
    const keydown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const elements = [...root.current.querySelectorAll('button, a[href]')];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, [onClose]);
  return createPortal(<div className="learning-week-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={root} role="dialog" aria-modal="true" aria-labelledby="learning-week-title" className="learning-week-preview">
      <header><h3 id="learning-week-title">{row.subject} · Khối {row.grade} · Tuần {lesson}</h3><button type="button" onClick={onClose} aria-label="Đóng học liệu"><X /></button></header>
      <div className="learning-week-preview-body">
        {week?.notes.map((note, i) => <article key={note.id || i} className="student-content" dangerouslySetInnerHTML={{ __html: normalizeMathHtml(note.content) }} />)}
        {!!week?.materials.length && <section><h4>Tài liệu</h4>{week.materials.map((item, i) => /^https?:\/\//i.test(item.url || '') ? <a key={item.id || i} href={item.url} target="_blank" rel="noopener noreferrer">{item.title || 'Mở tài liệu'}</a> : null)}</section>}
        {!!week?.quizzes.length && <section><h4>Bài kiểm tra</h4>{week.quizzes.map((item, i) => <article key={item.id || i}><h5>{item.title || 'Đề kiểm tra'}</h5><div dangerouslySetInnerHTML={{ __html: normalizeMathHtml(item.content || item.quizHtml || '') }} /></article>)}</section>}
        {!week && <p>Tuần này chưa có học liệu.</p>}
      </div>
    </section>
  </div>, document.body);
}
