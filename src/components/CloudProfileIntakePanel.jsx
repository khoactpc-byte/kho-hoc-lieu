import { useEffect,useState } from 'react';
import { requestProfileIntake } from '../services/profileIntake';

export default function CloudProfileIntakePanel({schoolYear,educationLevel,fields=[]}){
  const [state,setState]=useState({loading:true,rows:[],total:0}),[cursor,setCursor]=useState(0),[attempt,setAttempt]=useState(0);
  useEffect(()=>{setCursor(0);},[schoolYear,educationLevel]);
  useEffect(()=>{
    const controller=new AbortController();setState({loading:true,rows:[],total:0});
    requestProfileIntake('list',{schoolYear,level:educationLevel,cursor},{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setState({...result,rows:result.requests || [],loading:false});})
      .catch(error=>{if(!controller.signal.aborted)setState({loading:false,error:error.message,rows:[],total:0});});
    return()=>controller.abort();
  },[schoolYear,educationLevel,cursor,attempt]);
  const download=()=>{
    const bytes=JSON.stringify({version:1,source:'cloudflare-profile-intake',schoolYear,exportedAt:new Date().toISOString(),pageOffset:cursor,total:state.total,requests:state.rows},null,2);
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/json;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`ho-so-tiep-nhan-${schoolYear}-${cursor+1}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const labels=Object.fromEntries(fields.map(field=>[field.key,field.label]));
  return <section className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm" aria-label="Hồ sơ tiếp nhận trên Cloudflare">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-blue-900">Hồ sơ tiếp nhận trên Cloudflare {state.loading?'':state.error?'':`(${state.total})`}</h3><div className="flex gap-2"><button type="button" className="rounded border bg-white px-3 py-2" onClick={()=>setAttempt(value=>value+1)}>Tải lại</button><button type="button" className="rounded border bg-white px-3 py-2 disabled:opacity-40" disabled={state.loading || !state.rows.length} onClick={download}>Tải danh sách đang xem</button></div></div>
    <p className="my-2 text-xs leading-relaxed text-slate-600">Các yêu cầu mới đã được lưu riêng để học sinh tiếp tục gửi khi Firestore hết hạn mức. Chờ quản trị viên xử lý và cập nhật hồ sơ chính; chưa tự duyệt hoặc ghi vào sổ điểm.</p>
    {state.loading?<p role="status">Đang tải hồ sơ tiếp nhận…</p>:state.error?<p role="alert" className="text-rose-700">{state.error}</p>:!state.rows.length?<p>Chưa có yêu cầu mới trong năm/cấp học đang chọn.</p>:<ul className="space-y-2">{state.rows.map(row=><li key={row.id} className="rounded-lg border bg-white p-3"><strong>{row.studentName} · {row.accessCode}</strong><p className="text-xs text-slate-500">{row.schoolCode} · {row.className} · {new Date(row.createdAt).toLocaleString('vi-VN')} · Chờ xử lý</p><details className="mt-2"><summary>Xem {Object.keys(row.changes).length} thông tin đề nghị sửa</summary><dl className="mt-2 space-y-2">{Object.entries(row.changes).map(([key,value])=><div key={key}><dt className="text-xs font-semibold text-slate-500">{labels[key] || key}</dt><dd className="whitespace-pre-wrap break-words">{value || '(để trống)'}</dd></div>)}</dl></details></li>)}</ul>}
    {!state.loading && !state.error && (cursor>0 || state.nextCursor!=null) && <div className="mt-3 flex gap-2"><button type="button" disabled={!cursor} onClick={()=>setCursor(Math.max(0,cursor-100))}>Trang trước</button><span>{cursor+1}–{cursor+state.rows.length}/{state.total}</span><button type="button" disabled={state.nextCursor==null} onClick={()=>setCursor(state.nextCursor)}>Trang sau</button></div>}
  </section>;
}
