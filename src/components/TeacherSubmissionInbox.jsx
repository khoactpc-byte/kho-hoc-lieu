import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { SUBMISSION_KINDS, unreadSubmission } from '../utils/teacherSubmissionInbox';
import { teacherClassLabel } from '../utils/teacherPresentation';
import {essayBatchEligibility,essayBatchKey,queueEssayBatch} from '../utils/essayBatch';
import {essayDeliveryState} from '../utils/essayDelivery';

const submissionDateLabel = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : 'Chưa có thời gian';

export default function TeacherSubmissionInbox({ rows, profile, seen, onSeen, renderWork, onGrade, onAiGrade,canAiGrade=true,batchScope='',children }) {
  const [kind, setKind] = useState('all');
  const [state, setState] = useState('all'), [search, setSearch] = useState(''), [workKey, setWorkKey] = useState('');
  const [workOrder, setWorkOrder] = useState([]);
  const dialogRef = useRef(null), listRef = useRef(null);
  const hadReader = useRef(false);
  const [selected,setSelected]=useState(new Set()),[regrade,setRegrade]=useState(false),[batch,setBatch]=useState(null);
  const activeBatch=useRef(null),allCheckbox=useRef(null);
  const filtered = rows.filter(row => (kind === 'all' || row.kind === kind) && (state === 'all' || (state === 'unread' ? unreadSubmission(row, seen) : state === 'ungraded' ? !!row.essay && row.essay.status!=='teacher_reviewed' && row.essay.aiStatus!=='graded' : state === 'pending' ? row.pending : row.status === 'Đã chấm'))
    && `${row.student.fullName} ${row.student.accessCode || ''} ${row.title}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const work = rows.find(row => row.key === workKey);
  const batchEnabled=typeof onAiGrade==='function';
  const eligible=filtered.filter(row=>essayBatchEligibility(row,{regrade}).eligible);
  const selectedRows=eligible.filter(row=>selected.has(essayBatchKey(row)));
  const allSelected=eligible.length>0 && selectedRows.length===eligible.length;
  useEffect(()=>{if(allCheckbox.current)allCheckbox.current.indeterminate=selectedRows.length>0 && !allSelected;},[selectedRows.length,allSelected,work]);
  useEffect(()=>{
    setSelected(new Set());setBatch(null);
    return()=>{if(activeBatch.current)activeBatch.current.cancelled=true;activeBatch.current=null;};
  },[batchScope]);
  const resetSelection=()=>{setSelected(new Set());setBatch(null);};
  const toggleAll=()=>setSelected(allSelected?new Set():new Set(eligible.map(essayBatchKey)));
  const startBatch=async()=>{
    if(activeBatch.current || !canAiGrade || !selectedRows.length)return;
    const job={cancelled:false};activeBatch.current=job;
    setBatch({running:true,completed:0,total:selectedRows.length,accepted:0,failed:0});
    const result=await queueEssayBatch(selectedRows,onAiGrade,{regrade,shouldContinue:()=>!job.cancelled,onProgress:progress=>{if(activeBatch.current===job)setBatch({...progress,running:true});}});
    if(activeBatch.current!==job)return;
    activeBatch.current=null;
    setBatch({...result,running:false,completed:result.accepted.length+result.failed.length,accepted:result.accepted.length,failed:result.failed.length,errors:result.failed});
    setSelected(new Set(result.failed.map(({row})=>essayBatchKey(row))));
  };
  const unreadCount = rows.filter(row => unreadSubmission(row, seen)).length;
  const readyCount=rows.filter(row=>row.pending && row.essay?.aiStatus==='graded').length;
  const waitingCount=rows.filter(row=>row.pending).length-readyCount;
  const workOpen = !!work;
  useEffect(() => {
    if (!workOpen) {
      if(hadReader.current) listRef.current?.querySelector('button:not(:disabled)')?.focus();
      hadReader.current = false;
      return;
    }
    hadReader.current = true;
    const previousOverflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter(node => node !== dialogRef.current && !node.contains(dialogRef.current))
      .map(node => ({ node, hidden: node.getAttribute('aria-hidden'), inert: node.inert }));
    siblings.forEach(({node}) => { node.setAttribute('aria-hidden','true'); node.inert = true; });
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      siblings.forEach(({node,hidden,inert}) => { if(hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden',hidden); node.inert = inert; });
    };
  }, [workOpen]);
  const ordered = workOrder.map(key => rows.find(row => row.key === key)).filter(Boolean);
  const workIndex = ordered.findIndex(row => row.key === workKey);
  const moveWork = step => { const next = ordered[workIndex + step]; if(next) { setWorkKey(next.key); onSeen([next]); } };
  const closeWork = () => setWorkKey('');
  const dialogKeys = event => {
    if(event.key === 'Escape') { event.stopPropagation(); closeWork(); }
    if(event.key !== 'Tab') return;
    const focusable = [...dialogRef.current.querySelectorAll('button,select,input,textarea,summary,a[href]')].filter(node => !node.disabled && node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if(event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if(!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  if (work) return createPortal(<section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="student-paper-title" aria-label="Bài học sinh nộp" className="teacher-submission-inbox teacher-grading-dialog is-grading" onKeyDown={dialogKeys}>
    <header className="teacher-inbox-work-nav"><div className="teacher-grading-identity"><strong id="student-paper-title">{work.student.fullName}</strong><small>{teacherClassLabel(profile,work.grade)} · {work.subject} · Tuần {work.lesson}</small></div>
      <div className="teacher-grading-navigation"><button type="button" disabled={workIndex<=0} title={ordered[workIndex-1]?.student.fullName || 'Đầu danh sách'} onClick={()=>moveWork(-1)}>← Bài trước</button><span>{workIndex+1}/{ordered.length}</span><button type="button" disabled={workIndex<0 || workIndex>=ordered.length-1} title={ordered[workIndex+1]?.student.fullName || 'Cuối danh sách'} onClick={()=>moveWork(1)}>Bài tiếp →</button></div>
      <button type="button" autoFocus className="teacher-grading-close" aria-label="Đóng bài làm" title="Đóng phần chấm điểm (Esc)" onClick={closeWork}><X size={20} /></button>
    </header>
    <div className="teacher-grading-body">
    {work.canGrade && !work.essay && <button type="button" className="teacher-quiz-link" onClick={()=>onGrade(work)}>Mở bảng điểm</button>}
    {renderWork(work,closeWork)}
    </div>
  </section>,document.body);
  return <section ref={listRef} aria-label="Bài học sinh nộp" className="teacher-submission-inbox">
    <div className="teacher-inbox-summary"><p>{rows.length} bài nộp · <b>{unreadCount} chưa xem</b> · {readyCount} chờ duyệt · {waitingCount} chờ AI</p>
      <button type="button" disabled={!unreadCount} onClick={() => onSeen(rows)}>Đánh dấu tất cả đã xem</button></div>
    <details className="teacher-inbox-filter-menu"><summary>Lọc bài nộp</summary><div className="admin-check-filters teacher-inbox-filters">
      <label>Loại bài <select aria-label="Loại bài nộp" value={kind} disabled={batch?.running} onChange={e => {resetSelection();setKind(e.target.value);}}><option value="all">Tất cả loại</option>{SUBMISSION_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Trạng thái <select aria-label="Trạng thái bài nộp" value={state} disabled={batch?.running} onChange={e => {resetSelection();setState(e.target.value);}}><option value="all">Tất cả</option><option value="unread">Chưa xem</option><option value="ungraded">Tự luận chưa chấm AI</option><option value="pending">Chờ giáo viên duyệt</option><option value="graded">Đã chấm</option></select></label>
      <input aria-label="Tìm bài học sinh nộp" placeholder="Tên, mã học sinh hoặc tên đề" value={search} disabled={batch?.running} onChange={e => {resetSelection();setSearch(e.target.value);}} />
    </div></details>
    {batchEnabled && <div className="essay-batch-toolbar"><div className="essay-batch-actions"><label><input type="checkbox" checked={allSelected} disabled={!canAiGrade || !eligible.length || batch?.running} onChange={toggleAll}/> {regrade?'Chọn tất cả bài có thể chấm':'Chọn tự luận chưa chấm AI'} ({eligible.length})</label><span>{batch?.running?`Đang gửi ${batch.completed}/${batch.total} bài…`:`Đã chọn ${selectedRows.length} bài`}</span><button type="button" className="essay-batch-start" disabled={!canAiGrade || !selectedRows.length || batch?.running} onClick={startBatch}>{batch?.running?'Đang gửi AI…':`Chấm AI các bài đã chọn (${selectedRows.length})`}</button>{batch?.running?<button type="button" onClick={()=>{if(activeBatch.current)activeBatch.current.cancelled=true;}}>Dừng gửi thêm</button>:<button type="button" disabled={!selected.size} onClick={resetSelection}>Bỏ chọn</button>}</div>
      <label className="essay-batch-regrade"><input type="checkbox" checked={regrade} disabled={batch?.running} onChange={event=>{resetSelection();setRegrade(event.target.checked);}}/> Chấm lại bài đã có kết quả</label>
      <p className="teacher-inbox-note">{regrade?'Đang bật chấm lại cả bài đã có kết quả.':'Chỉ chọn tự luận chưa có kết quả AI.'} Bài đang chờ hoặc đang chấm không gửi trùng. Chấm AI tạo bản nháp, chưa gửi học sinh.</p>
      {!canAiGrade && <p role="status" className="teacher-inbox-note">Năm học đang khóa chấm điểm.</p>}
      {batch?.running && <p role="status">Đóng danh sách sẽ dừng gửi những bài còn lại. Bài máy chủ đã nhận vẫn tiếp tục được chấm.</p>}
      {batch && !batch.running && <p role="status">Máy chủ đã nhận {batch.accepted}/{batch.total} bài để chấm AI.{batch.failed>0?` ${batch.failed} bài chưa gửi được; vẫn được chọn để thử lại.`:''}{batch.remaining>0?` Đã dừng, còn ${batch.remaining} bài chưa gửi.`:''} Kết quả cập nhật trong danh sách khi AI chấm xong.</p>}
      {!!batch?.errors?.length && <details><summary>Xem bài chưa gửi được ({batch.errors.length})</summary>{batch.errors.map(({row,message})=><p key={row.key}>{row.student.fullName}: {message}</p>)}</details>}
    </div>}
    <div className="teacher-quiz-table-scroll"><table><thead><tr>{batchEnabled && <th className="essay-batch-check"><input ref={allCheckbox} type="checkbox" aria-label="Chọn tất cả bài tự luận theo bộ lọc" checked={allSelected} disabled={!canAiGrade || !eligible.length || batch?.running} onChange={toggleAll}/></th>}<th>Học sinh</th><th>Bài nộp</th><th>Điểm</th><th>Trạng thái</th><th>Bài làm</th></tr></thead>
      <tbody>{!filtered.length ? <tr><td colSpan={batchEnabled?6:5}>Chưa có bài nộp theo bộ lọc này.</td></tr> : filtered.map(row => <tr key={row.key} className={unreadSubmission(row, seen) ? 'is-unread' : ''}>
        {batchEnabled && <td className="essay-batch-check"><input type="checkbox" aria-label={`Chọn bài của ${row.student.fullName}`} title={essayBatchEligibility(row,{regrade}).reason || 'Chọn để chấm nháp AI'} checked={selected.has(essayBatchKey(row))} disabled={!canAiGrade || !essayBatchEligibility(row,{regrade}).eligible || batch?.running} onChange={event=>{const checked=event.target.checked;setSelected(current=>{const next=new Set(current);if(checked)next.add(essayBatchKey(row));else next.delete(essayBatchKey(row));return next;});}}/></td>}
        <td><strong>{row.student.fullName}</strong><small>{row.student.accessCode || 'Chưa có mã'} · {teacherClassLabel(profile,row.grade)}{unreadSubmission(row, seen) ? ' · Mới' : ''}</small></td>
        <td>{row.subject} · {row.kindLabel}<small>{row.lesson !== 'undefined' && row.lesson ? `Tuần ${row.lesson} · ` : ''}{row.title}</small><small>{submissionDateLabel(row.submittedAt)}{row.late?' · Sau hạn':''}</small></td>
        <td>{row.result && <span>TN: {row.quizScore}</span>}{row.essay && <small>TL: {row.essayScore}{row.pending && row.essay.aiScore != null ? ' (AI nháp)' : ''}</small>}</td>
        <td>{row.status}{!!row.essay?.reviewedAt && <small className={`essay-delivery-state is-${essayDeliveryState(row.essay).state}`}>{essayDeliveryState(row.essay).label}</small>}</td><td><button type="button" className="teacher-quiz-link" onClick={() => { setWorkOrder(filtered.map(item=>item.key)); setWorkKey(row.key); onSeen([row]); }}>Xem bài</button></td>
      </tr>)}</tbody></table></div>
    {children}
  </section>;
}
