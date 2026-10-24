import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isStructuredLessonReview, prepareAiLessonReview } from '../utils/aiLessonReview';
import LessonReviewBatchEditor from './LessonReviewBatchEditor';
import { normalizeMathHtml, splitQuizHtml } from '../utils/quizContent';
import { renderedQuizMathIssue } from '../utils/quizQuality';

export default function AiQuestionResult({ response, html, previewRef, editable, count = 'auto', essayCount = 0, disabled, onChange, onRepair }) {
  const prepared = useMemo(() => editable && response ? prepareAiLessonReview(response, count, essayCount) : null, [response, editable, count, essayCount]);
  const [renderError, setRenderError] = useState('');
  useEffect(() => {
    const root = previewRef?.current;
    setRenderError('');
    if (!root) return;
    const observer = new root.ownerDocument.defaultView.MutationObserver(() => setRenderError(renderedQuizMathIssue(root)));
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [response, html, prepared, previewRef]);
  return <>
    {editable && isStructuredLessonReview(response) ? <LessonReviewBatchEditor key={response} row={{ rawResponse: response }} disabled={disabled}
      title="Chỉnh sửa từng câu và đáp án" description="Sửa câu hỏi, chọn đáp án và đối chiếu lời giải. Bấm Áp dụng bản sửa để xem lại trước khi lưu."
      saveLabel="Áp dụng bản sửa" onSave={(_row, draft) => onChange(JSON.stringify(draft))} /> : editable && <details className="quiz-advanced"><summary>Dán / chỉnh sửa kết quả</summary>
      <textarea aria-label="Kết quả câu hỏi ôn tập" value={response} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="Dán kết quả AI hoặc sửa nội dung tại đây…" className="mt-3 min-h-48 w-full rounded-lg border p-3 text-sm" />
    </details>}
    {response && <section className="space-y-4 border-t pt-4"><p className="text-sm text-slate-500">Kiểm tra nội dung và đáp án trước khi sử dụng.{editable && ' Bản dưới đây là câu hỏi sau khi nhập, giống dữ liệu học sinh sẽ làm. Khi lưu, học sinh có thể mở làm ngay.'}</p>
      {(prepared?.error || renderError) && <p role="alert" className="whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Chưa thể lưu: {prepared?.error || renderError}</p>}
      {editable && onRepair && <button type="button" disabled={disabled} onClick={onRepair} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Nhờ AI kiểm tra / sửa đáp án</button>}
      {prepared ? <div ref={previewRef} className="ai-response-content">
        {(prepared.parsed.questions || []).map((question, index) => <article key={question.id} className="mb-4 rounded-xl border p-4">
          <p className="whitespace-pre-wrap font-semibold">Câu {index + 1}. {question.text}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{question.options.map(option => <p key={option.id} className={`whitespace-pre-wrap rounded-lg p-2 ${option.id === question.correctOptionId ? 'bg-rose-50 font-bold text-red-700' : 'bg-slate-50'}`}>{option.id.toUpperCase()}. {option.text || '(trống)'}{option.id === question.correctOptionId && <span className="ml-2 text-xs">✓ Đáp án đúng</span>}</p>)}</div>
          <p className={`mt-2 text-sm ${question.correctOptionId ? 'text-red-700' : 'text-amber-800'}`}>Đáp án: {question.correctOptionId?.toUpperCase() || 'Chưa có'}</p>
        </article>)}
        {prepared.parsed.essayQuestions.map((question, index) => <p key={question.id} className="mb-3 whitespace-pre-wrap">Bài tự luận {index + 1}. {question.text}</p>)}
        <details><summary className="cursor-pointer text-sm">Nội dung gốc và hướng dẫn giải để đối chiếu</summary><div dangerouslySetInnerHTML={{ __html: html }} /></details>
        <div className="mt-4 border-t pt-3" dangerouslySetInnerHTML={{ __html: normalizeMathHtml(splitQuizHtml(prepared.content).answer) }} />
      </div> : <div ref={previewRef} className="ai-response-content" dangerouslySetInnerHTML={{ __html: html }} />}
      {editable && <p className="text-xs text-slate-500">Đối chiếu đáp án với lời giải bên trên. Thầy cô vẫn cần duyệt tính chính xác của đề và đáp án sau khi AI kiểm tra.</p>}
    </section>}
  </>;
}

export function AiQuestionSaveBar({ saving, disabled, error, onSave, label }) {
  return <footer className="ai-question-save-bar shrink-0 border-t bg-white px-5 py-3">
    {error && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    <button type="button" disabled={saving || disabled} onClick={onSave} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Đang lưu…' : label}</button>
    {saving && <span role="status" className="ml-3 text-sm text-slate-600">Đang lưu bộ câu hỏi, thầy cô chờ một chút…</span>}
  </footer>;
}
