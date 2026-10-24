import { essayReviewNumberText } from '../utils/essayGrading';
export default function TeacherEssayReview({ submission, draft = {}, busy, canWrite, onChange, onSave, onSend, onAi, onExternalAi }) {
  const score = draft.teacherScore ?? submission.teacherScore ?? submission.aiScore ?? '';
  const maximum = draft.teacherMaxScore ?? submission.teacherMaxScore ?? submission.aiMaxScore ?? '10';
  const comment = String(draft.teacherComment ?? submission.teacherComment ?? submission.aiComment ?? '').slice(0, 10000);
  const changed = essayReviewNumberText(score) !== essayReviewNumberText(submission.teacherScore) || essayReviewNumberText(maximum) !== essayReviewNumberText(submission.teacherMaxScore) || comment.trim() !== String(submission.teacherComment ?? '').trim();
  const sent = !!submission.reviewedAt && submission.feedbackSentReviewAt === submission.reviewedAt && !changed;
  const aiBusy = submission.aiStatus === 'grading' || submission.aiStatus === 'queued' && !!submission.aiAutoRequestedAt;
  return <section className="teacher-essay-review" aria-label="Duyệt nhận xét tự luận"><h4>Giáo viên duyệt bài chấm</h4>
    <p className="teacher-inbox-note">AI chỉ chấm nháp. Kiểm tra từng bước và sửa nhận xét trước khi gửi vào hộp thư học sinh.</p>
    <div className="teacher-essay-actions"><span>{submission.aiStatus === 'graded' ? 'AI đã chấm nháp' : submission.aiStatus === 'error' ? 'AI chưa chấm được' : aiBusy ? 'AI đang chấm / chờ xử lý' : 'Chưa chấm AI'}</span>
      <button type="button" disabled={busy || aiBusy || !canWrite || !submission.fileId} onClick={onAi}>{submission.aiStatus === 'error' || submission.aiStatus === 'graded' ? 'Chấm lại AI' : 'Chấm AI'}</button></div>
    {submission.aiNeedsReview && <p className="text-amber-700 text-sm">AI chưa đủ căn cứ cho điểm. Giáo viên cần kiểm tra bài và nhập điểm.</p>}
    {submission.aiError && submission.aiStatus === 'error' && <p role="alert" className="text-amber-700 text-sm">{submission.aiError}</p>}
    {submission.aiStatus === 'error' && onExternalAi && <details className="teacher-external-ai"><summary>Dùng AI khác</summary><p>Mở AI, dán yêu cầu đã sao chép và đính kèm đề, biểu điểm cùng tệp bài làm. Sau đó dán kết quả vào ô nhận xét để kiểm tra và gửi.</p><div className="teacher-essay-actions"><button type="button" onClick={() => onExternalAi('chatgpt')}>Mở ChatGPT</button><button type="button" onClick={() => onExternalAi('gemini')}>Mở Gemini</button></div></details>}
    <div className="teacher-essay-grade-fields"><label>Điểm<input aria-label="Điểm tự luận giáo viên duyệt" inputMode="decimal" value={score} disabled={busy || !canWrite} onChange={e => onChange('teacherScore', e.target.value)} /></label><label>Điểm tối đa<input aria-label="Điểm tối đa tự luận" inputMode="decimal" value={maximum} disabled={busy || !canWrite} onChange={e => onChange('teacherMaxScore', e.target.value)} /></label></div>
    <label>Nhận xét và hướng dẫn từng bước<textarea aria-label="Nhận xét tự luận gửi học sinh" rows={6} maxLength={10000} value={comment} disabled={busy || !canWrite} onChange={e => onChange('teacherComment', e.target.value)} /></label>
    <div className="teacher-essay-actions"><button type="button" disabled={busy || !canWrite} onClick={onSave}>Lưu điểm</button><button type="button" className="teacher-essay-send" disabled={busy || !canWrite || sent} onClick={onSend}>{busy ? 'Đang xử lý…' : sent ? 'Đã gửi hộp thư' : 'Duyệt và gửi'}</button></div>
  </section>;
}
