import { useState } from 'react';
import { editableBatchLessonReview } from '../utils/lessonReviewBatch';

export default function LessonReviewBatchEditor({ row, disabled, onSave, title, description, saveLabel }) {
  const [draft, setDraft] = useState(() => editableBatchLessonReview(row.rawResponse));
  if (!draft) return null;
  const update = (index, changes) => setDraft(previous => ({ ...previous, questions: previous.questions.map((question, i) => i === index ? { ...question, ...changes } : question) }));
  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900';
  return <details className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
    <summary className="cursor-pointer font-semibold text-blue-800">{title || `Chỉnh sửa câu hỏi tuần ${row.week}`}</summary>
    <p className="my-3 text-sm text-slate-600">{description || 'Sửa nội dung, công thức và khóa đáp án. Khi lưu, hệ thống kiểm tra lại công thức. Bộ đã lưu sẽ được cập nhật, giữ nguyên vị trí trong tuần.'}</p>
    <fieldset disabled={disabled}>
      {draft.questions.map((question, index) => <section key={index} className="my-3 rounded-lg border border-blue-100 bg-white p-3">
        <label className="block font-semibold">Nội dung câu {index + 1}<textarea className={fieldClass} rows={2} value={question.text || ''} onChange={event => update(index, { text: event.target.value })} /></label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{['a', 'b', 'c', 'd'].map(id => <label key={id} className="text-sm">Phương án {id.toUpperCase()} câu {index + 1}<textarea className={fieldClass} rows={2} value={question.options?.[id] || ''} onChange={event => update(index, { options: { ...question.options, [id]: event.target.value } })} /></label>)}</div>
        <label className="mt-2 block text-sm">Đáp án câu {index + 1}<select className={fieldClass} value={question.answer || ''} onChange={event => update(index, { answer: event.target.value })}><option value="">Chọn đáp án</option>{['a', 'b', 'c', 'd'].map(id => <option key={id} value={id}>{id.toUpperCase()}</option>)}</select></label>
        <label className="mt-2 block text-sm">Giải thích câu {index + 1}<textarea className={fieldClass} rows={2} value={question.explanation || ''} onChange={event => update(index, { explanation: event.target.value })} /></label>
      </section>)}
      {draft.essays.map((essay, index) => <section key={index} className="my-3 rounded-lg border border-blue-100 bg-white p-3">{['text', 'answer'].map(key => <label key={key} className="block text-sm">{key === 'text' ? 'Nội dung' : 'Lời giải'} tự luận {index + 1}<textarea className={fieldClass} rows={3} value={essay[key] || ''} onChange={event => setDraft(previous => ({ ...previous, essays: previous.essays.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) }))} /></label>)}</section>)}
      <button type="button" className="pdf-import-primary" onClick={() => onSave(row, draft)} disabled={disabled}>{disabled ? 'Đang xử lý…' : saveLabel || 'Kiểm tra và lưu bản sửa'}</button>
    </fieldset>
  </details>;
}
