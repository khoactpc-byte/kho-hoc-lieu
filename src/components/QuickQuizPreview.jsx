import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { normalizeMathHtml, splitQuizHtml } from '../utils/quizContent';
import { extractEssayTextFromHtml } from '../utils/selfQuiz';
import { typesetMath } from '../utils/mathTypesetting';

export default function QuickQuizPreview({ content, quizData, deliveryMode = 'manual', onClose }) {
  const root = useRef(null);
  const [view, setView] = useState('student');
  const html = useMemo(() => normalizeMathHtml(view === 'student' ? splitQuizHtml(content).question : content), [content, view]);
  const automatic = deliveryMode === 'auto' && quizData?.questions?.length > 0;
  const essay = useMemo(() => extractEssayTextFromHtml(splitQuizHtml(content).question), [content]);
  useEffect(() => { typesetMath(root.current); }, [html, quizData, view, automatic, essay]);
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-[95] animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-labelledby="quick-quiz-preview-title" className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden border border-white/20">
        <div className="px-4 sm:px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id="quick-quiz-preview-title" className="font-black text-emerald-900 text-base sm:text-xl flex items-center gap-2"><FileText className="w-5 h-5" /> Xem trước bài kiểm tra</h3>
            <p className="text-xs text-emerald-700">{view === 'student' ? 'Bản học sinh · Không hiển thị đáp án' : 'Bản giáo viên · Có đáp án và biểu điểm'}</p>
          </div>
          <button type="button" aria-label="Đóng xem đề nhanh" onClick={onClose} className="p-3 rounded-full bg-white border border-emerald-100 text-slate-500 hover:bg-rose-500 hover:text-white shadow-sm transition-colors shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-2 border-b px-4 py-3" role="group" aria-label="Chọn bản xem trước">
          {[['student', 'Bản học sinh'], ['teacher', 'Bản giáo viên']].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className="rounded-lg border px-3 py-2 text-sm">{label}</button>)}
        </div>
        <div ref={root} className="teacher-content quick-quiz-preview min-h-0 p-4 sm:p-7 text-base leading-relaxed overflow-y-auto">
          {automatic ? <>
            <p className="mb-4 text-sm text-slate-500">Trắc nghiệm trực tuyến{quizData.shuffleQuestions || quizData.shuffleOptions ? ' · Thứ tự có thể thay đổi khi học sinh làm bài' : ''}</p>
            {quizData.questions.map((q, index) => <article key={q.id || index} className="mb-4 rounded-xl border p-4">
              <p className="whitespace-pre-wrap font-semibold">Câu {index + 1}. {q.text}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{(q.options || []).map(opt => <p key={opt.id} className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2">{opt.id.toUpperCase()}. {opt.text}</p>)}</div>
              {view === 'teacher' && <p className="mt-2 text-emerald-700">Đáp án: {q.correctOptionId?.toUpperCase() || 'Chưa chọn'}</p>}
            </article>)}
            {essay && <section className="whitespace-pre-wrap border-t pt-4"><h4 className="font-semibold">Tự luận</h4>{essay}</section>}
            {view === 'teacher' && <div className="mt-4 border-t pt-4" dangerouslySetInnerHTML={{ __html: normalizeMathHtml(splitQuizHtml(content).answer) }} />}
          </> : <div dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </div>
  );
}
