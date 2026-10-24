import { useEffect, useMemo, useRef } from 'react';
import { Layers, Loader2, RefreshCw, X } from 'lucide-react';
import useLessonReviewBatch from '../hooks/useLessonReviewBatch';
import LessonReviewOptions from './LessonReviewOptions';
import LessonReviewBatchEditor from './LessonReviewBatchEditor';
import { teacherLessonHtml } from '../utils/lessonAnswers';
import { typesetMath } from '../utils/mathTypesetting';

const labels = { empty: 'Chưa có bài học', existing: 'Đã có ôn tập · bỏ qua', pending: 'Chưa có ôn tập', working: 'Đang tạo và kiểm tra…', saved: 'Đã tạo và lưu', error: 'Chưa tạo được' };
function GeneratedReview({ result }) {
  const root = useRef(null), html = useMemo(() => teacherLessonHtml(result.content), [result.content]);
  useEffect(() => { typesetMath(root.current); }, [html]);
  return <div ref={root} className="review-batch-preview teacher-content"><div key={html} dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

export default function LessonReviewBatchDialog({ context, service, requestAI, onClose, onOpenSaved, validateMath }) {
  const batch = useLessonReviewBatch({ context, service, requestAI, validateMath });
  const { rows, phase } = batch;
  const root = useRef(null), closeButton = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => previous?.focus?.();
  }, []);
  const targets = rows.filter(row => row.selected && ['pending', 'error'].includes(row.status));
  const eligible = rows.filter(row => ['pending', 'error'].includes(row.status));
  const existing = rows.filter(row => row.status === 'existing').length, saved = rows.filter(row => row.status === 'saved').length;
  const active = rows.find(row => row.id === batch.activeId);
  const close = () => { if (!phase) onClose(); };
  const keyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <div className="pdf-import-backdrop" onKeyDown={keyDown}><section ref={root} role="dialog" aria-modal="true" aria-labelledby="review-batch-title" className="pdf-import-dialog lesson-review-batch-dialog">
    <header><div><h2 id="review-batch-title"><Layers size={21} />Tạo ôn tập cho các tuần còn thiếu</h2><p>Khối {context.grade} · {context.subject} · {context.schoolYear}</p></div><button ref={closeButton} type="button" disabled={!!phase} onClick={close} aria-label="Đóng tạo ôn tập hàng loạt"><X size={20} /></button></header>
    <div className="pdf-import-body">
      <p className="review-batch-description">Chạy lần lượt theo bài học của từng tuần và lưu bộ ôn tập để học sinh làm. Tuần đã có bộ ôn tập sẽ được bỏ qua. Câu hỏi được kiểm tra cấu trúc, đáp án và hiển thị công thức trước khi lưu.</p>
      <LessonReviewOptions count={batch.count} essayCount={batch.essayCount} disabled={!!phase} onChange={batch.changeOptions} />
      <p className="review-batch-note">Tự động chọn 3–10 câu mỗi tuần. Khi thử lại, hệ thống kiểm tra dữ liệu đã nhận trước để hạn chế gọi AI thêm. Lượt chạy dừng nếu 2 tuần liên tiếp không hợp lệ hoặc AI trả nội dung bị cắt.</p>
      <div className="review-batch-summary"><span>{rows.filter(row => row.status !== 'empty').length} tuần có bài học · {existing} đã có ôn tập · {saved} vừa lưu</span><button type="button" disabled={!!phase} onClick={batch.scan}><RefreshCw size={15} />Rà lại danh sách</button></div>
      {batch.error && <p role="alert" className="pdf-import-error">{batch.error}</p>}
      {phase === 'scanning' && <p role="status" className="review-batch-progress"><Loader2 className="animate-spin" size={17} />Đang kiểm tra bài học và bộ ôn tập hiện có…</p>}
      {!!rows.length && <div className="pdf-import-table-wrap"><table className="pdf-import-table review-batch-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả tuần còn thiếu" disabled={!!phase || !eligible.length} checked={!!eligible.length && eligible.every(row => row.selected)} onChange={event => eligible.forEach(row => batch.select(row.id, event.target.checked))} /></th><th>Tuần</th><th>Bài học</th><th>Trạng thái</th><th>Xem</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className={active?.id === row.id ? 'is-active' : ''}>
        <td><input type="checkbox" aria-label={`Tạo ôn tập tuần ${row.week}`} checked={row.selected} disabled={!!phase || !['pending', 'error'].includes(row.status)} onChange={event => batch.select(row.id, event.target.checked)} /></td>
        <td>{row.week}</td><td><span className="review-batch-lesson-title">{row.title || '—'}</span>{row.error && <><p className="review-batch-row-error">{row.error}</p>{row.rawResponse && <details><summary>Xem nội dung AI trả về</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 240, overflow: 'auto' }}>{row.rawResponse}</pre></details>}</>}</td><td><span className={`pdf-import-status status-${row.status}`}>{labels[row.status]}</span></td>
        <td>{(row.result || row.material || row.rawResponse) && <button type="button" aria-label={`Xem ôn tập tuần ${row.week}`} onClick={() => batch.setActiveId(row.id)}>Xem</button>}</td>
      </tr>)}</tbody></table></div>}
      {!phase && rows.length > 0 && !eligible.length && <p className="pdf-import-success">Các tuần có bài học đều đã có ôn tập.</p>}
      {active?.result && <section className="review-batch-result"><h3>Bộ ôn tập tuần {active.week}{active.status === 'saved' ? ' · đã lưu' : ' · chưa lưu'}</h3>{active.result.warnings?.map((warning, index) => <p key={index} className="pdf-import-warnings">{warning}</p>)}<GeneratedReview result={active.result} /></section>}
      {active?.rawResponse && phase !== 'running' && <LessonReviewBatchEditor key={active.id} row={active} disabled={!!phase} onSave={batch.saveEdited} />}
      {active?.material?.id?.startsWith('lesson-review-') && active.material.authorId === context.authorId && !active.rawResponse && <button type="button" disabled={!!phase} onClick={() => batch.editExisting(active)}>Chỉnh sửa bộ ôn tập tuần {active.week}</button>}
      {active?.material && !active.result && <button type="button" disabled={!!phase} onClick={() => { onOpenSaved(active.material); onClose(); }}>Mở bộ ôn tập tuần {active.week}</button>}
    </div>
    <footer><div className="review-batch-footer"><span role="status" className="review-batch-progress">{phase === 'running' && <Loader2 className="animate-spin" size={17} />}{phase === 'running' ? batch.progress : `Đã chọn ${targets.length} tuần còn thiếu`}</span><div className="pdf-import-footer-actions">{phase === 'running' ? <button type="button" onClick={batch.stop}>Dừng sau tuần này</button> : <><button type="button" onClick={close}>Đóng</button><button type="button" className="pdf-import-primary" disabled={!!phase || !targets.length} onClick={batch.run}>Tạo và lưu {targets.length} tuần</button></>}</div></div><small className="review-batch-note">Thầy cô vẫn cần duyệt tính chính xác của đề và đáp án. Tuần bị lỗi được giữ lại để thử tiếp; các tuần đã lưu không bị tạo lại.</small></footer>
  </section></div>;
}
