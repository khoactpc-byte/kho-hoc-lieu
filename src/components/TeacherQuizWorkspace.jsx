import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const TEACHER_QUIZ_TABS = [
  ['compose', 'Soạn đề'], ['publish', 'Phát đề'], ['scores', 'Bài nộp & Chấm điểm']
];
export default function TeacherQuizWorkspace({ activeTab, onTabChange, onClose, context, classLabel, scoreCount = 0, pendingCount = 0, loading = false, compose, work, publish }) {
  const root = useRef(null), body = useRef(null), tabs = useRef([]);
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [activeTab]);
  useEffect(() => {
    const previous = document.activeElement;
    tabs.current.find(tab => tab?.getAttribute('aria-selected') === 'true')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const handleKey = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const elements = [...root.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [contenteditable="true"]')]
      .filter(element => element.tabIndex !== -1 && element.getClientRects().length && !element.closest('[hidden]'));
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const move = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const count = TEACHER_QUIZ_TABS.length;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
    onTabChange(TEACHER_QUIZ_TABS[next][0]); tabs.current[next]?.focus();
  };
  return <section ref={root} className="teacher-quiz-workspace" role="dialog" aria-modal="true" aria-labelledby="teacher-quiz-workspace-title" onKeyDown={handleKey}>
    <header className="teacher-quiz-workspace-header"><div className="teacher-quiz-workspace-heading"><div><h3 id="teacher-quiz-workspace-title">Bài kiểm tra</h3>{classLabel && <span className="teacher-quiz-class-label">{classLabel}</span>}</div><p>{context}</p></div><button type="button" onClick={onClose} aria-label="Đóng bảng bài kiểm tra"><X className="h-5 w-5" /><span>Đóng</span></button></header>
    <div className="teacher-quiz-workspace-tabs" role="tablist" aria-label="Công cụ bài kiểm tra">
      {TEACHER_QUIZ_TABS.map(([key, label], index) => <button key={key} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`teacher-quiz-tab-${key}`}
        aria-selected={activeTab === key} aria-controls={`teacher-quiz-pane-${key}`} tabIndex={activeTab === key ? 0 : -1}
        onKeyDown={event => move(event, index)} onClick={() => onTabChange(key)}>{label}{key === 'scores' && <span> ({scoreCount}){pendingCount ? ` · ${pendingCount} chờ` : ''}</span>}</button>)}
    </div>
    <div ref={body} className="teacher-quiz-workspace-body">
      {loading && <p role="status" className="rounded-lg border bg-white p-4 text-sm text-slate-500">Đang tải bài kiểm tra...</p>}
      <div role="tabpanel" id="teacher-quiz-pane-compose" aria-labelledby="teacher-quiz-tab-compose" hidden={loading || activeTab !== 'compose'}>{compose}</div>
      <div role="tabpanel" id="teacher-quiz-pane-scores" aria-labelledby="teacher-quiz-tab-scores" hidden={loading || activeTab !== 'scores'}>{work}</div>
      <div role="tabpanel" id="teacher-quiz-pane-publish" aria-labelledby="teacher-quiz-tab-publish" hidden={loading || activeTab !== 'publish'}>{publish}</div>
    </div>
  </section>;
}

export function TeacherQuizPublishPanel({ published, publishAt, hasContent, saving, hideLabel = 'Ẩn đề / Hủy lịch', onPreview, onHide, children }) {
  return <section className="teacher-quiz-publish-panel"><h4>Phát đề cho học sinh</h4>
    <p>Trạng thái: <strong>{published ? 'Đang phát' : publishAt ? 'Đã hẹn giờ' : 'Chưa phát'}</strong>{publishAt && !published ? ` · ${String(publishAt).replace('T', ' ')}` : ''}</p>
    <p>Kiểm tra bản học sinh rồi chọn phát ngay hoặc hẹn giờ. Nội dung sẽ được lưu khi phát đề.</p>
    {!hasContent && <p className="text-amber-700">Soạn nội dung đề trước khi phát.</p>}
    <div><button type="button" disabled={!hasContent || saving} onClick={onPreview}>Xem trước</button>
      {(published || publishAt) && <button type="button" disabled={saving} onClick={onHide}>{saving ? 'Đang lưu…' : hideLabel}</button>}</div>
    <fieldset disabled={!hasContent || saving} className="quiz-publish-form">{children}</fieldset>
  </section>;
}
