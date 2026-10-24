import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import useLessonAssistant from '../hooks/useLessonAssistant';
import LessonSelectionPreview from './LessonSelectionPreview';
import LessonAiTools, { LessonAiToolbar } from './LessonAiTools';
import LessonAiPopup from './LessonAiPopup';
import { LESSON_PRACTICE_LIMIT, LESSON_PRACTICE_DIFFICULTIES } from '../utils/lessonPractice';

export default function LessonNormalizeDialog({ normalizer }) {
  return normalizer.preview ? <LessonNormalizationWorkspace key={normalizer.preview.contextKey} normalizer={normalizer}/> : null;
}

function LessonNormalizationWorkspace({normalizer}) {
  const root = useRef(null), dialog = useRef(null), reviewButton = useRef(null);
  const [renderError, setRenderError] = useState(''), [reviewOpen, setReviewOpen] = useState(false), [reviewInstruction, setReviewInstruction] = useState('');
  const [practiceCount, setPracticeCount] = useState(''), [practiceDifficulty, setPracticeDifficulty] = useState('');
  const preview = normalizer.preview;
  const assistant=useLessonAssistant(normalizer);
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current?.focus();
    return ()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus?.();};
  },[]);
  useEffect(() => {
    const onKey = event => {
      if(event.key==='Escape'&&event.target.tagName==='SELECT')return;
      if(event.key==='Escape') {event.preventDefault();if(reviewOpen){setReviewOpen(false);reviewButton.current?.focus();}else if(assistant.more)assistant.setMore(false);else if(assistant.busy)assistant.cancel();else normalizer.close();}
      if(event.key==='Tab') {
        const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);
        if(!nodes.length)return;
        if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}
        else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [normalizer,assistant,reviewOpen]);
  const selectedCount = preview.changes.filter(change => change.selected).length;
  const popupOpen=reviewOpen||!!assistant.selection&&(assistant.form||assistant.more);
  return <div className="lesson-normalize-backdrop">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-hidden={popupOpen?true:undefined} inert={popupOpen?'':undefined} aria-labelledby="lesson-normalize-title" className="lesson-normalize-dialog">
      <header><div className="lesson-normalize-heading"><h3 id="lesson-normalize-title">Chuẩn hóa và bổ sung bài học</h3><span title={assistant.mathEnabled ? 'Bôi đen đoạn chữ hoặc bấm vào dòng công thức để nhờ AI bổ sung.' : 'Bôi đen đoạn chữ để nhờ AI bổ sung.'}>(Bôi đen hoặc chọn dòng để nhờ AI)</span></div><button type="button" onClick={normalizer.close} aria-label="Đóng chuẩn hóa bài học"><X size={18} /></button><LessonAiToolbar assistant={assistant} normalizerBusy={normalizer.busy} previewRef={root}/></header>
      <div className="lesson-normalize-body">
        {(normalizer.error || renderError) && <p role="alert" className="lesson-normalize-error">{normalizer.error || renderError}</p>}
        {assistant.mathEnabled && preview.cleanups?.length > 0 && <p className="text-sm text-slate-600">Đã dọn chữ tiếng Anh thừa trong {preview.cleanups.length} đoạn công thức. Các số và dấu phép tính được giữ nguyên; công thức chưa đầy đủ vẫn được báo bên dưới.</p>}
        {preview.warnings.length > 0 && <aside className="lesson-normalize-warnings"><strong>Cần kiểm tra</strong><ul>{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}
        {preview.aiChecked && <section className="lesson-normalize-changes"><h4>AI đề xuất {preview.changes.length} chỉnh sửa · Đã chọn {selectedCount}</h4><p className="text-sm text-slate-600">{assistant.mathEnabled ? 'Các sửa đổi công thức hoặc số liệu cần được chọn riêng sau khi đối chiếu bài gốc.' : 'Các sửa đổi số liệu hoặc dữ kiện cần được chọn riêng sau khi đối chiếu bài gốc.'}</p>{preview.changes.map(change => <article key={change.id}><label className="flex items-center gap-2"><input type="checkbox" checked={!!change.selected} disabled={normalizer.busy||assistant.busy} onChange={() => normalizer.toggleChange(change.id)} aria-label={`Chọn chỉnh sửa ${change.id}`} /><strong>{!assistant.mathEnabled && change.kind === 'Công thức / dữ kiện' ? 'Số liệu / dữ kiện' : change.kind}</strong></label><p><span>Trước:</span> {change.before}</p><p><span>Sau:</span> {change.after || '(Bỏ đoạn thừa)'}</p>{change.reason && <small>{change.reason}</small>}</article>)}</section>}
        <LessonAiTools assistant={assistant} normalizerBusy={normalizer.busy}/>
        <LessonSelectionPreview assistant={assistant} rootRef={root} onRenderError={setRenderError} disabled={normalizer.busy}/>
      </div>
      <footer>
        <div className="lesson-normalize-review-controls">
          <button ref={reviewButton} type="button" className="lesson-normalize-review-toggle" aria-expanded={reviewOpen} aria-controls="lesson-normalize-review-request" disabled={normalizer.busy||assistant.busy} onClick={()=>setReviewOpen(!reviewOpen)}>{normalizer.busy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}{normalizer.busy ? 'AI đang hỗ trợ…' : 'Nhờ AI hỗ trợ'}</button>
        </div>
        {assistant.canUndo&&<button type="button" disabled={normalizer.busy||assistant.busy} onClick={assistant.undo}>Hoàn tác lần chèn</button>}
        <button type="button" onClick={normalizer.close}>Hủy</button>
        <button type="button" className="lesson-normalize-apply" title="Đưa vào bài đang soạn; dùng nút Lưu để lưu bài." disabled={normalizer.busy || assistant.busy || !!renderError} onClick={normalizer.apply}>Áp dụng{selectedCount ? ` ${selectedCount} chỉnh sửa` : assistant.canUndo?' vào bài':' trình bày'}</button>
      </footer>
    </section>
    {reviewOpen&&<LessonAiPopup title="Nhờ AI hỗ trợ" closeLabel="Đóng yêu cầu hỗ trợ AI" onClose={()=>setReviewOpen(false)}><form id="lesson-normalize-review-request" className="lesson-normalize-review-request" aria-label="Nhờ AI hỗ trợ toàn bài" onSubmit={event=>{event.preventDefault();void normalizer.revise(reviewInstruction,{practiceCount,practiceDifficulty});setReviewOpen(false);}}>
      <div className="lesson-normalize-practice-options">
        <label>Câu hỏi ôn tập<select aria-label="Số câu hỏi ôn tập" value={practiceCount} disabled={normalizer.busy||assistant.busy} onChange={event=>setPracticeCount(event.target.value)}><option value="">Không thêm</option>{Array.from({length:LESSON_PRACTICE_LIMIT},(_,index)=>index+1).map(count=><option key={count} value={count}>{count} câu</option>)}</select></label>
        <label>Mức độ<select aria-label="Mức độ câu hỏi ôn tập" value={practiceDifficulty} disabled={normalizer.busy||assistant.busy} onChange={event=>setPracticeDifficulty(event.target.value)}><option value="">Không chọn</option>{LESSON_PRACTICE_DIFFICULTIES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <label>Yêu cầu riêng (không bắt buộc)<textarea aria-label="Yêu cầu riêng khi nhờ AI hỗ trợ" maxLength={3000} rows={3} value={reviewInstruction} disabled={normalizer.busy||assistant.busy} onChange={event=>setReviewInstruction(event.target.value)} placeholder="Ví dụ: Thêm 5 bài tập tự luyện từ dễ đến khó, kèm lời giải."/></label>
      <p>Chọn số câu để ôn tập cả tuần trong mục Bài tập tự luyện. Không chọn thì AI làm theo yêu cầu riêng; để trống tất cả để {assistant.mathEnabled ? 'rà chính tả và công thức' : 'rà chính tả và cách diễn đạt'}.</p>
      <div className="lesson-ai-inline-actions lesson-ai-popup-actions"><button type="button" onClick={()=>setReviewOpen(false)}>Hủy yêu cầu</button><button type="submit" className="is-primary" disabled={normalizer.busy||assistant.busy}>OK</button></div>
    </form></LessonAiPopup>}
  </div>;
}
