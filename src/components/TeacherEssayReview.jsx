import { useEffect, useState } from 'react';
import { essayReviewNumberText, ESSAY_ASSESSMENT_LEVELS, essayReviewValues } from '../utils/essayGrading';
import { essayDraftStudentComment, studentEssayComment } from '../utils/essayFeedback';
import { quickEssayScores } from '../utils/essayAnnotations';
import TeacherEssayAnalysis from './TeacherEssayAnalysis';
import EssayGradeStamp from './EssayGradeStamp';
import EssayFeedbackText from './EssayFeedbackText';
import {essayDeliveryState} from '../utils/essayDelivery';
export default function TeacherEssayReview({ submission, draft = {}, busy, canWrite, onChange, onSave, onSend, onAi, onAiStatus, onExternalAi, compact = false, annotationChanged = false, aiNotice = '', reviewNotice = '' }) {
  const [aiRequest,setAiRequest]=useState({status:'',message:''});
  const [analysisOpen,setAnalysisOpen]=useState(false);
  const [editing,setEditing]=useState(false);
  const {score,maximum,mode,assessment}=essayReviewValues(submission,draft);
  const comment = essayDraftStudentComment(submission,draft);
  const changed = (mode==='qualitative' ? assessment!==submission.teacherAssessment : !!submission.teacherAssessment || essayReviewNumberText(score) !== essayReviewNumberText(submission.teacherScore) || essayReviewNumberText(maximum) !== essayReviewNumberText(submission.teacherMaxScore)) || comment.trim() !== studentEssayComment(submission.teacherComment).trim();
  const delivery=essayDeliveryState(submission,{changed:changed || annotationChanged});
  const sent = delivery.confirmed && !changed && !annotationChanged;
  const retryAllowed=!!aiRequest.retryAllowed;
  const aiBusy = !retryAllowed && (submission.aiStatus === 'grading' || submission.aiStatus === 'queued' && !!submission.aiAutoRequestedAt);
  const waiting = !retryAllowed && aiRequest.status === 'queued' && !['graded','error'].includes(submission.aiStatus);
  useEffect(()=>{
    if(!onAiStatus || !['queued','grading'].includes(submission.aiStatus) && aiRequest.status!=='queued')return;
    let active=true,timer;const controller=new AbortController();
    const poll=async()=>{
      try {const result=await onAiStatus(controller.signal);if(active)setAiRequest(result);}
      catch(error){if(active && error.name!=='AbortError')setAiRequest({status:'error',retryAllowed:true,message:error.message || 'Chưa đọc được trạng thái chấm. Bài và bản nháp vẫn được giữ.'});}
      if(active)timer=setTimeout(poll,5000);
    };
    timer=setTimeout(poll,1000);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[onAiStatus,submission.aiStatus,aiRequest.status]);
  const requestAi = async () => {
    if(aiRequest.status === 'requesting' || waiting || aiBusy)return;
    setAiRequest({status:'requesting',message:'Đang gửi bài để chấm AI…'});
    try {
      const result = await onAi();
      if(result?.status === 'error') throw new Error(result.message || 'AI chưa nhận được bài. Hãy thử lại.');
      setAiRequest({...result,status:result?.status || 'queued',message:result?.message || (result?.status === 'done' ? 'Bài đã được xử lý. Kiểm tra điểm và nhận xét.' : 'Máy chủ đã nhận bài để chấm AI.')});
    } catch(error) { setAiRequest({status:'error',message:error.message || 'Chưa kết nối được AI. Điểm và nét chấm đang nhập được giữ lại.'}); }
  };
  const aiTools = <><div className="teacher-essay-actions"><span>{submission.aiStatus === 'graded' ? 'AI đã chấm nháp' : submission.aiStatus === 'error' ? 'AI chưa chấm được' : aiBusy ? 'AI đang chấm / chờ xử lý' : 'Chưa chấm AI'}</span>
      <button type="button" disabled={busy || aiBusy || waiting || !canWrite || !submission.fileId} onClick={requestAi}>{retryAllowed?'Thử xử lý lại':submission.aiStatus === 'error' || submission.aiStatus === 'graded' ? 'Chấm lại AI' : 'Chấm AI'}</button></div>
    {aiRequest.message && <p role={aiRequest.status==='error'?'alert':'status'} className="essay-ai-message">{aiRequest.message}</p>}
    {submission.aiNeedsReview && <p className="text-amber-700 text-sm">{submission.aiAssessmentMode==='qualitative'?'AI chưa đủ dữ kiện để đề xuất mức nhận xét. Giáo viên cần kiểm tra phần chưa rõ.':'AI chưa đủ căn cứ cho điểm. Giáo viên cần kiểm tra bài và nhập điểm.'}</p>}
    {submission.aiError && submission.aiStatus === 'error' && <p role="alert" className="text-amber-700 text-sm">{submission.aiError}</p>}
    {submission.aiStatus === 'error' && onExternalAi && <details className="teacher-external-ai"><summary>Dùng AI khác</summary><p>Mở AI, dán yêu cầu đã sao chép và đính kèm đề, biểu điểm cùng tệp bài làm. Sau đó dán kết quả vào ô nhận xét để kiểm tra và gửi.</p><div className="teacher-essay-actions"><button type="button" onClick={() => onExternalAi('chatgpt')}>Mở ChatGPT</button><button type="button" onClick={() => onExternalAi('gemini')}>Mở Gemini</button></div></details>}</>;
  const gradingFields=<div className="essay-review-grade-options">
    <label>Hình thức<select aria-label="Hình thức nhận xét" value={mode} disabled={busy || !canWrite} onChange={e=>onChange('teacherAssessmentMode',e.target.value)}><option value="numeric">Điểm số</option><option value="qualitative">Mức chữ · ôn tập</option></select></label>
    {mode==='qualitative' ? <label>Mức duyệt<select aria-label="Mức nhận xét giáo viên duyệt" value={assessment} disabled={busy || !canWrite} onChange={e=>onChange('teacherAssessment',e.target.value)}><option value="">Chọn mức</option>{ESSAY_ASSESSMENT_LEVELS.map(level=><option key={level} value={level}>{level}</option>)}</select></label> : <div className="teacher-essay-grade-fields"><label>Điểm<input aria-label="Điểm tự luận giáo viên duyệt" inputMode="decimal" value={score} disabled={busy || !canWrite} onChange={e => onChange('teacherScore', e.target.value)} /></label><label>Tối đa<input aria-label="Điểm tối đa tự luận" inputMode="decimal" value={maximum} disabled={busy || !canWrite} onChange={e => onChange('teacherMaxScore', e.target.value)} /></label></div>}
  </div>;
  const commentField=<div className="essay-review-comment"><div className="essay-comment-heading"><span>Nhận xét gửi học sinh</span><button type="button" aria-pressed={editing} onClick={()=>setEditing(value=>!value)}>{editing?'Xem bản dễ đọc':'Sửa nhận xét'}</button></div><EssayFeedbackText hidden={editing} label="Nhận xét dễ đọc gửi học sinh" text={comment || 'Chưa có nhận xét. Bấm Sửa nhận xét để nhập.'}/><textarea hidden={!editing} spellCheck={false} aria-label="Nhận xét tự luận gửi học sinh" rows={compact?18:6} maxLength={10000} value={comment} disabled={busy || !canWrite} onChange={e => onChange('teacherComment', e.target.value)} /></div>;
  return <section className={`teacher-essay-review${compact?' essay-review-compact':''}`} aria-label="Duyệt nhận xét tự luận"><h4>{compact?'Nhận xét bài làm':'Giáo viên duyệt bài chấm'}</h4>
    {compact ? <div className="essay-ai-direct"><button type="button" className="essay-ai-button" disabled={busy || aiBusy || waiting || aiRequest.status==='requesting' || !canWrite || !submission.fileId || !onAi} onClick={requestAi}>
      {aiBusy || waiting ? submission.aiStatus==='grading' || aiRequest.phase==='processing' ? 'AI đang chấm…' : 'Đang nhận bài…' : aiRequest.status==='requesting' ? 'Đang gửi AI…' : retryAllowed ? 'Thử xử lý lại' : submission.aiStatus==='graded' ? 'Chấm lại bằng AI' : 'Chấm bằng AI'}</button>
      {aiNotice && <p className="teacher-inbox-note">{aiNotice}</p>}
      {(aiRequest.message || aiBusy || submission.aiStatus==='graded' || submission.aiError) && <p role={aiRequest.status==='error' || submission.aiStatus==='error'?'alert':'status'} aria-live="polite" className="essay-ai-message">{submission.aiStatus==='error' && submission.aiError ? submission.aiError : submission.aiStatus==='graded' ? 'AI đã chấm nháp. Giáo viên kiểm tra trước khi lưu.' : submission.aiStatus==='grading' && !retryAllowed ? 'AI đang đọc và chấm bài. Thầy cô có thể chuyển sang bài khác.' : aiRequest.message || 'Máy chủ đang nhận bài để chấm AI.'}</p>}
      {!canWrite && <p className="teacher-inbox-note">Năm học đang khóa chấm điểm.</p>}
      {(submission.aiStatus==='error' || aiRequest.status==='error') && onExternalAi && <details className="teacher-external-ai"><summary>Dùng AI khác</summary><div className="teacher-essay-actions"><button type="button" onClick={()=>onExternalAi('chatgpt')}>Mở ChatGPT</button><button type="button" onClick={()=>onExternalAi('gemini')}>Mở Gemini</button></div></details>}
    </div> : <><p className="teacher-inbox-note">AI chỉ chấm nháp. Kiểm tra từng bước và sửa nhận xét trước khi gửi vào hộp thư học sinh.</p>{aiTools}</>}
    {compact && commentField}
    {gradingFields}
    <details className="essay-student-send-preview"><summary>Xem nội dung sẽ gửi học sinh</summary><div className="essay-feedback-card"><EssayGradeStamp review={mode==='qualitative'?{teacherAssessment:assessment}:{teacherScore:score,teacherMaxScore:maximum}}/><EssayFeedbackText text={studentEssayComment(comment) || 'Em xem kết quả và các ghi chú trên bài đã chấm.'}/></div></details>
    <details className="essay-review-extra"><summary>Gợi ý AI và tùy chọn chấm</summary>
    {submission.aiStatus==='graded' && submission.aiAssessment && <p className="teacher-inbox-note">Mức AI đề xuất: <strong>{submission.aiAssessment}</strong> · Bài ôn tập không quy đổi thành điểm. Giáo viên kiểm tra trước khi lưu.</p>}
    {submission.aiStatus === 'graded' && (submission.aiComment || submission.aiFeedbackVersion===2) && <details className="teacher-external-ai" onToggle={event=>setAnalysisOpen(event.currentTarget.open)}>
      <summary>Phân tích riêng cho giáo viên · không gửi</summary>
      <p className="teacher-inbox-note">Điểm và nhận xét giáo viên đã lưu vẫn được giữ nguyên.</p>
      {submission.aiScore !== '' && submission.aiScore != null && <p>Điểm AI đề xuất: {submission.aiScore}/{submission.aiMaxScore}</p>}
      <TeacherEssayAnalysis submission={submission} open={analysisOpen}/>
      <button type="button" disabled={busy || !canWrite} onClick={()=>onChange('teacherComment',studentEssayComment(submission.aiStudentComment ?? submission.aiComment))}>Dùng nhận xét AI trong bản nháp</button>
    </details>}
    {mode==='qualitative' ? <p className="teacher-inbox-note">Chỉ lưu mức nhận xét, không cập nhật sổ điểm.</p> : <>
    {compact && <div className="essay-quick-scores" role="group" aria-label="Chọn nhanh điểm tự luận">{quickEssayScores(maximum).map(value=><button type="button" key={value} disabled={busy || !canWrite} aria-pressed={String(score).replace(',','.')===String(value)} onClick={()=>onChange('teacherScore',String(value))}>{value}</button>)}</div>}
    {compact && submission.teacherScore == null && draft.teacherScore === undefined && submission.aiScore != null && <p className="teacher-inbox-note">Điểm đang gợi ý từ AI. Giáo viên cần kiểm tra và xác nhận.</p>}
    </>}
    </details>
    {!compact && commentField}
    <div className="essay-review-save-state" role="status"><p className="teacher-inbox-note" title="Nháp được giữ khi quay lại danh sách trong phiên này.">{changed || annotationChanged ? 'Có thay đổi chưa lưu.' : submission.reviewedAt ? 'Đã lưu bài chấm.' : 'Kiểm tra nhận xét và mức duyệt trước khi lưu.'}</p><p className={`essay-delivery-state is-${delivery.state}`}>{delivery.label}</p></div>
    <div className="teacher-essay-actions"><button type="button" disabled={busy || !canWrite} onClick={onSave}>{compact?'Lưu bài chấm':'Lưu điểm'}</button><button type="button" className="teacher-essay-send" disabled={busy || !canWrite || sent} onClick={onSend}>{busy ? 'Đang xử lý…' : sent ? 'Đã gửi hộp thư' : compact ? 'Đồng ý và gửi học sinh' : 'Duyệt và gửi'}</button></div>
    {compact && reviewNotice && <p className="teacher-inbox-note" role="status">{reviewNotice}</p>}
  </section>;
}
