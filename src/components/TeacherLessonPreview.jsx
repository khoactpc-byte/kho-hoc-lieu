import { useEffect, useMemo, useRef } from 'react';
import { normalizeMathHtml } from '../utils/quizContent';
import { typesetMath } from '../utils/mathTypesetting';
import { teacherLessonHtml } from '../utils/lessonAnswers';
import { sanitizeHtml } from '../utils/safeHtml';

export default function TeacherLessonPreview({ html, columns, expanded = false, loading = false, mathEnabled = true }) {
  const root = useRef(null);
  const previewHtml = useMemo(() => teacherLessonHtml(mathEnabled ? normalizeMathHtml(html) : sanitizeHtml(html)), [html, mathEnabled]);
  useEffect(() => { if (mathEnabled && !loading) typesetMath(root.current); }, [previewHtml, loading, mathEnabled]);

  return <div id="teacher-lesson-preview" ref={root} role="region" aria-label={mathEnabled ? 'Bài học đã hiển thị công thức' : 'Bản xem bài học'}
    onToggleCapture={event => { if (mathEnabled && event.target.open) typesetMath(event.target); }}
    className={`lesson-layout-scroll lesson-editor-viewport teacher-content ${expanded ? 'is-expanded' : ''} overflow-y-auto`}>
    {loading ? <p role="status" className="p-4 text-slate-400">Đang tải dữ liệu bài học...</p>
      : <div key={previewHtml} className="lesson-column-content" data-columns={columns} dangerouslySetInnerHTML={{ __html: previewHtml }} />}
  </div>;
}
