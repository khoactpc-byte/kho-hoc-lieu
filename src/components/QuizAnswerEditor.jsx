import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2, Pencil, Sparkles } from 'lucide-react';
import { normalizeMathHtml } from '../utils/quizContent';
import { typesetMath } from '../utils/mathTypesetting';

export default function QuizAnswerEditor({ html = '', editorRef, onInput, onPaste, onGenerate, generating = false, active = true }) {
  const [editing, setEditing] = useState(false);
  const previewRef = useRef(null);
  const previewHtml = useMemo(() => normalizeMathHtml(html), [html]);
  const showEditor = editing || !html.trim();

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== html) editor.innerHTML = html;
  }, [html, editorRef]);
  useEffect(() => {
    if (active && !showEditor) typesetMath(previewRef.current);
  }, [previewHtml, showEditor, active]);
  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing, editorRef]);

  const generate = async () => {
    const result = await onGenerate();
    if (result) setEditing(false);
  };
  const toggleEditing = () => {
    if (showEditor) onInput();
    setEditing(!showEditor);
  };
  return <section className="quiz-answer-pane">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="text-[10px] sm:text-xs font-black uppercase text-rose-700">Đáp án và biểu điểm</span>
      <div className="flex flex-wrap items-center gap-2">
        {html.trim() && <button type="button" onClick={toggleEditing} className="px-3 py-2 rounded-xl bg-white text-slate-700 border border-slate-200 text-[10px] font-bold flex items-center gap-1.5">
          {showEditor ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          {showEditor ? 'Xem công thức' : 'Chỉnh sửa đáp án'}
        </button>}
        <button type="button" onClick={generate} disabled={generating} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase flex items-center gap-1.5 disabled:opacity-50">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {generating ? 'Đang tạo đáp án...' : 'Tạo đáp án bằng AI'}
        </button>
      </div>
    </div>
    {/* Keep editable TeX mounted separately: rendered MathJax must never enter saved content. */}
    <div ref={editorRef} hidden={!showEditor} role="textbox" aria-label="Chỉnh sửa đáp án và biểu điểm" aria-multiline="true" contentEditable suppressContentEditableWarning
      onInput={() => { setEditing(true); onInput(); }} onPaste={event => { setEditing(true); onPaste(event); }}
      data-placeholder="Dán đáp án ở đây. Nếu chưa có, bấm Tạo đáp án bằng AI..."
      className="quiz-answer-source quiz-editor rich-editor teacher-content min-h-[220px] p-4 sm:p-7 text-base sm:text-lg leading-relaxed focus:outline-none overflow-y-auto border border-rose-100 rounded-2xl bg-white shadow-inner" />
    {!showEditor && <div ref={previewRef} role="region" aria-label="Đáp án và biểu điểm đã định dạng" className="quiz-answer-preview teacher-content min-h-[220px] p-4 sm:p-7 text-base sm:text-lg leading-relaxed overflow-x-auto border border-rose-100 rounded-2xl bg-white shadow-inner"
      dangerouslySetInnerHTML={{ __html: previewHtml }} />}
  </section>;
}
