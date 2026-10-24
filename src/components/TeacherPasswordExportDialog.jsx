import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,Eye,EyeOff,X} from 'lucide-react';
import {downloadTeacherCredentials,TEACHER_EXPORT_SCHOOLS} from '../utils/teacherAccountExport';

export default function TeacherPasswordExportDialog({accounts,issuedPasswords,onClose,onExported,onDownload=downloadTeacherCredentials}) {
  const panel=useRef(null),titleId=useId();
  const [school,setSchool]=useState(''),[includeLocked,setIncludeLocked]=useState(false),[showPasswords,setShowPasswords]=useState(false),[commonPassword,setCommonPassword]=useState(''),[error,setError]=useState('');
  const [selected,setSelected]=useState(()=>new Set(accounts.map(account=>account.id)));
  const [passwords,setPasswords]=useState(()=>Object.fromEntries(accounts.map(account=>[account.id,issuedPasswords.get(account.username)?.password||''])));
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';panel.current?.querySelector('select')?.focus();
    return ()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  const rows=accounts.filter(account=>(!school||account.schoolCode===school)&&(includeLocked||account.isActive!==false)).sort((a,b)=>(a.fullName||a.username).localeCompare(b.fullName||b.username,'vi'));
  const chosen=rows.filter(account=>selected.has(account.id)),missing=chosen.filter(account=>!passwords[account.id]);
  const changePassword=(id,value)=>{setError('');setPasswords(previous=>({...previous,[id]:value}));};
  const fillCommon=()=>{setError('');setPasswords(previous=>{const next={...previous};for(const account of chosen)if(!next[account.id])next[account.id]=commonPassword;return next;});};
  const toggle=id=>setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const exportFile=()=>{
    try{onDownload(chosen,passwords);setError('');onExported?.(chosen.length);}
    catch(failure){setError(failure.message||'Chưa xuất được file Excel.');}
  };
  const onKeyDown=event=>{
    event.stopPropagation();
    if(event.key==='Escape'){if(event.target.tagName==='SELECT')return;event.preventDefault();onClose();}
    if(event.key==='Tab') {
      const nodes=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
      if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}
    }
  };
  return createPortal(<div className="password-export-backdrop" onKeyDown={onKeyDown}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="password-export-dialog">
      <header><h3 id={titleId}>Xuất danh sách mật khẩu giáo viên</h3><button type="button" onClick={onClose} className="password-button account-icon-button" aria-label="Đóng xuất danh sách mật khẩu"><X size={16}/></button></header>
      <div className="password-export-body">
        <p className="password-note">Máy chủ không đọc lại được mật khẩu cũ. Các ô dưới đây lấy mật khẩu vừa cấp trong phiên này hoặc do bạn nhập; xuất file không đổi mật khẩu đăng nhập.</p>
        <div className="password-export-filters">
          <label>Cơ sở<select aria-label="Cơ sở xuất tài khoản" className="password-input" value={school} onChange={event=>setSchool(event.target.value)}><option value="">Tất cả cơ sở</option>{Object.entries(TEACHER_EXPORT_SCHOOLS).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
          <label className="password-export-check"><input type="checkbox" checked={includeLocked} onChange={event=>setIncludeLocked(event.target.checked)}/>Kèm tài khoản đã khóa</label>
          <button type="button" className="password-button" onClick={()=>setShowPasswords(!showPasswords)}>{showPasswords?<EyeOff size={14}/>:<Eye size={14}/>} {showPasswords?'Ẩn mật khẩu':'Hiện mật khẩu'}</button>
        </div>
        <div className="password-export-common">
          <label>Mật khẩu dùng chung (nếu có)<input aria-label="Mật khẩu chung để điền vào file" type={showPasswords?'text':'password'} autoComplete="off" maxLength={256} value={commonPassword} onChange={event=>setCommonPassword(event.target.value)} placeholder="Nhập mật khẩu đã cấp cho giáo viên" className="password-input"/></label>
          <button type="button" className="password-button" onClick={fillCommon} disabled={!commonPassword||!chosen.length}>Điền vào ô trống</button>
        </div>
        <div className="password-export-selection"><span>Đã chọn {chosen.length}/{rows.length} giáo viên · Đã nhập {chosen.length-missing.length} mật khẩu</span><button type="button" className="password-button" disabled={!rows.length} onClick={()=>setSelected(previous=>{const next=new Set(previous),all=rows.every(account=>next.has(account.id));for(const account of rows)if(all)next.delete(account.id);else next.add(account.id);return next;})}>{rows.length&&chosen.length===rows.length?'Bỏ chọn tất cả':'Chọn tất cả'}</button></div>
        <div className="password-export-table-scroll" tabIndex={0} role="region" aria-label="Danh sách tài khoản chuẩn bị xuất">
          <table className="password-export-table"><thead><tr><th>Chọn</th><th>Giáo viên</th><th>Tên đăng nhập</th><th>Mật khẩu đưa vào file</th><th>Cơ sở</th></tr></thead><tbody>{rows.map(account=><tr key={account.id}>
            <td><input type="checkbox" aria-label={`Xuất tài khoản ${account.fullName}`} checked={selected.has(account.id)} onChange={()=>toggle(account.id)}/></td>
            <th scope="row">{account.fullName}{account.isActive===false&&<small>Đã khóa</small>}</th><td>{account.username}</td>
            <td><input aria-label={`Mật khẩu xuất của ${account.fullName}`} type={showPasswords?'text':'password'} autoComplete="off" maxLength={256} disabled={!selected.has(account.id)} className="password-input" value={passwords[account.id]||''} onChange={event=>changePassword(account.id,event.target.value)} placeholder="Chưa nhập"/></td>
            <td>{TEACHER_EXPORT_SCHOOLS[account.schoolCode]||account.schoolCode}</td>
          </tr>)}</tbody></table>{!rows.length&&<p className="account-empty">Không có tài khoản trong phạm vi này.</p>}
        </div>
        {missing.length>0&&<p className="password-note mt-2" role="status">Còn {missing.length} giáo viên chưa có mật khẩu trong file. Nhập bổ sung hoặc bỏ chọn trước khi xuất.</p>}
        {error&&<p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      </div>
      <footer><button type="button" onClick={onClose} className="password-button">Đóng</button><button type="button" onClick={exportFile} disabled={!chosen.length||!!missing.length} className="password-button password-primary"><Download size={14}/>Xuất {chosen.length} tài khoản (.xlsx)</button></footer>
    </section>
  </div>,document.body);
}
