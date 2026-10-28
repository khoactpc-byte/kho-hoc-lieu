import { useEffect,useRef,useState } from 'react';
import { requestProfileIntake } from '../services/profileIntake';
import { intakeReviewSummary } from '../utils/profileIntakeReview';
import { getStudentSchoolCode } from '../utils/schoolClasses';
import { PROFILE_DOCUMENT_FIELDS } from '../utils/profileDocumentFiles';
import ProfileChangeTable from './ProfileChangeTable';

const button='rounded border bg-white px-3 py-2 disabled:opacity-40';
export default function CloudProfileIntakePanel({schoolYear,educationLevel,fields=[],students=[],onApply}){
  const [state,setState]=useState({loading:true,rows:[],total:0}),[cursor,setCursor]=useState(0),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const running=useRef(false);
  useEffect(()=>{setCursor(0);},[schoolYear,educationLevel]);
  useEffect(()=>{
    const controller=new AbortController();setState({loading:true,rows:[],total:0});
    requestProfileIntake('list',{schoolYear,level:educationLevel,cursor},{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setState({...result,rows:result.requests || [],loading:false});})
      .catch(error=>{if(!controller.signal.aborted)setState({loading:false,error:error.message,rows:[],total:0});});
    return()=>controller.abort();
  },[schoolYear,educationLevel,cursor,attempt]);
  const replace=row=>setState(previous=>({...previous,rows:previous.rows.map(item=>item.id===row.id?row:item)}));
  const apply=async row=>{
    if(!onApply)throw new Error('Chưa kết nối được nơi cập nhật hồ sơ chính.');
    const current=students.find(item=>item.accessCode===row.accessCode && item.schoolYear===row.schoolYear && getStudentSchoolCode(item)===row.schoolCode);
    const result=await onApply(row,current);
    if(!result?.saved)throw new Error('Chưa xác nhận được hồ sơ chính đã lưu.');
    if(result.request){replace(result.request);return result.request;}
    const response=await requestProfileIntake('applied',{id:row.id,expectedHash:row.payloadHash,fields:result.fields});
    replace(response.request);return response.request;
  };
  const decide=async(row,decision,field)=>{
    const response=await requestProfileIntake('review',{id:row.id,expectedHash:row.payloadHash,expectedVersion:row.review?.version || 0,decision,field});
    replace(response.request);
    if(decision==='approve'){
      try{await apply(response.request);return 'Đã duyệt và lưu cập nhật hồ sơ trên Cloudflare.';}
      catch(error){return `Đã ghi nhận quyết định duyệt trên Cloudflare, chưa áp dụng được cập nhật. ${error.message}`;}
    }
    return 'Đã từ chối các mục đã chọn. Hồ sơ chính không bị thay đổi.';
  };
  const run=async work=>{
    if(running.current)return;
    running.current=true;setBusy(true);setMessage('Đang xử lý…');
    try{setMessage(await work());}catch(error){setMessage(error.message);}finally{running.current=false;setBusy(false);}
  };
  const bulkApprove=()=>run(async()=>{
    let count=0,waiting=0;const errors=[];
    for(const row of state.rows.filter(item=>intakeReviewSummary(item).pending.length)){
      try{const result=await decide(row,'approve');count++;if(result.includes('chưa áp dụng'))waiting++;}catch(error){errors.push(error.message);}
    }
    return `Đã duyệt ${count} yêu cầu; ${waiting} yêu cầu chưa áp dụng được trên Cloudflare.${errors.length?` Còn ${errors.length} yêu cầu chưa xử lý: ${errors[0]}`:''}`;
  });
  const download=()=>{
    const bytes=JSON.stringify({version:2,source:'cloudflare-profile-intake',schoolYear,exportedAt:new Date().toISOString(),pageOffset:cursor,total:state.total,requests:state.rows},null,2);
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/json;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`ho-so-tiep-nhan-${schoolYear}-${cursor+1}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const labels=Object.fromEntries(fields.map(field=>[field.key,field.label]));
  return <section className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm" aria-label="Hồ sơ tiếp nhận trên Cloudflare" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-blue-900">Hồ sơ tiếp nhận trên Cloudflare {state.loading || state.error?'':`(${state.total})`}</h3><div className="flex flex-wrap gap-2">
      <button type="button" className={`${button} border-emerald-300 text-emerald-800`} disabled={busy || !state.rows.some(row=>intakeReviewSummary(row).pending.length)} onClick={bulkApprove}>Đồng ý tất cả đang hiển thị</button>
      <button type="button" className={button} disabled={busy} onClick={()=>setAttempt(value=>value+1)}>Tải lại</button><button type="button" className={button} disabled={busy || state.loading || !state.rows.length} onClick={download}>Tải danh sách đang xem</button>
    </div></div>
    <p className="my-2 text-xs leading-relaxed text-slate-600">Học sinh chỉ gửi đề nghị. Thầy cô duyệt từng mục hoặc cả yêu cầu bên dưới. Mục đã duyệt được lưu trên Cloudflare và gộp vào hồ sơ hiển thị; Firebase vẫn giữ bản dữ liệu cũ trong giai đoạn chuyển đổi.</p>
    {message && <p role="status" className="my-2 rounded border border-amber-200 bg-amber-50 p-2 whitespace-pre-wrap">{message}</p>}
    {state.loading?<p role="status">Đang tải hồ sơ tiếp nhận…</p>:state.error?<p role="alert" className="text-rose-700">{state.error}</p>:!state.rows.length?<p>Chưa có yêu cầu mới trong năm/cấp học đang chọn.</p>:<ul className="space-y-2">{state.rows.map(row=>{
      const review=intakeReviewSummary(row),current=students.find(item=>item.accessCode===row.accessCode && item.schoolYear===row.schoolYear && getStudentSchoolCode(item)===row.schoolCode);
      const status=review.pending.length?'Chờ thầy cô duyệt':review.approved.length?'Đã duyệt, chờ cập nhật Cloudflare':review.applied.length?'Đã cập nhật trên Cloudflare':'Đã từ chối';
      return <li key={row.id} className="rounded-lg border bg-white p-3">
        <strong>{row.studentName} · {row.accessCode}</strong><p className="text-xs text-slate-500">{row.schoolCode} · {row.className} · {new Date(row.createdAt).toLocaleString('vi-VN')} · {status}</p>
        {review.approved.length>0 && <p className="my-2 text-amber-800">{review.approved.length} mục đã duyệt, chờ cập nhật Cloudflare.</p>}
        <div className="my-2 flex flex-wrap gap-2">
          {review.pending.length>0 && <><button type="button" className={`${button} border-emerald-300 text-emerald-800`} disabled={busy} onClick={()=>run(()=>decide(row,'approve'))}>Đồng ý yêu cầu này</button><button type="button" className={`${button} border-rose-300 text-rose-700`} disabled={busy} onClick={()=>run(()=>decide(row,'reject'))}>Từ chối các mục chưa duyệt</button></>}
          {review.approved.length>0 && <button type="button" className={button} disabled={busy} onClick={()=>run(async()=>{await apply(row);return 'Đã cập nhật hồ sơ trên Cloudflare theo các mục thầy cô đã duyệt.';})}>Cập nhật trên Cloudflare</button>}
        </div>
        {review.pending.length>0 && <details className="mt-2" open><summary>Xem {review.pending.length} thông tin chờ duyệt</summary>
          {!current && <p className="my-2 text-xs text-amber-800">Chưa tải được giá trị hồ sơ chính để đối chiếu. Khi cập nhật, hệ thống sẽ đọc lại hồ sơ chính theo đúng mã, trường và năm học.</p>}
          <ProfileChangeTable label={`Thay đổi của ${row.accessCode}`} disabled={busy} allowFileCleanup={false} rows={review.pending.map(key=>({key,label:labels[key] || key,currentValue:current?String(current[key] ?? ''):'(chưa tải được)',nextValue:row.changes[key],isDocument:PROFILE_DOCUMENT_FIELDS.includes(key)}))} onApprove={key=>run(()=>decide(row,'approve',key))} onReject={key=>run(()=>decide(row,'reject',key))} />
        </details>}
        {(review.rejected.length>0 || review.approved.length>0 || review.applied.length>0) && <details className="mt-2"><summary>Các mục đã xử lý</summary><dl className="mt-2 space-y-2">{Object.entries(row.review.decisions).map(([key,decision])=><div key={key}><dt className="text-xs font-semibold text-slate-500">{labels[key] || key} · {decision==='reject'?'Đã từ chối':row.review.appliedFields.includes(key)?'Đã cập nhật trên Cloudflare':'Đã duyệt, chờ cập nhật Cloudflare'}</dt><dd className="whitespace-pre-wrap break-words">{row.changes[key] || '(để trống)'}</dd></div>)}</dl></details>}
      </li>;
    })}</ul>}
    {!state.loading && !state.error && (cursor>0 || state.nextCursor!=null) && <div className="mt-3 flex gap-2"><button type="button" disabled={busy || !cursor} onClick={()=>setCursor(Math.max(0,cursor-100))}>Trang trước</button><span>{cursor+1}–{cursor+state.rows.length}/{state.total}</span><button type="button" disabled={busy || state.nextCursor==null} onClick={()=>setCursor(state.nextCursor)}>Trang sau</button></div>}
  </section>;
}
