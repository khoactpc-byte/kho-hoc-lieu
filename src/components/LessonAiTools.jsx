import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { LESSON_AI_GROUPS, LESSON_AI_PRIMARY, lessonAssistantLabel } from '../utils/lessonAssistant';
import useLessonRenderedPreview from '../hooks/useLessonRenderedPreview';
import LessonAiPopup from './LessonAiPopup';
import { LESSON_PRACTICE_LIMIT } from '../utils/lessonPractice';

function FigureEditor({figure,onApply,disabled}) {
  const [width,setWidth]=useState(figure.width),[caption,setCaption]=useState(figure.caption);
  return <form className="lesson-ai-figure-editor" onSubmit={event=>{event.preventDefault();onApply({width,caption});}}>
    <strong>Hình đã chọn</strong><label>Kích thước {width}%<input aria-label="Kích thước hình đã chọn" type="range" min="25" max="100" step="5" value={width} disabled={disabled} onChange={event=>setWidth(Number(event.target.value))}/></label>
    <label>Chú thích<input aria-label="Chú thích hình đã chọn" maxLength={500} value={caption} disabled={disabled} onChange={event=>setCaption(event.target.value)}/></label>
    <div className="lesson-ai-inline-actions"><button type="submit" disabled={disabled}>Áp dụng hình</button><button type="button" disabled={disabled} onClick={()=>onApply({remove:true})}>Xóa hình</button></div>
  </form>;
}

function AiResult({assistant,disabled}) {
  const {result}=assistant,root=useRef(null),panel=useRef(null),[renderError,setRenderError]=useState(''),[imageReady,setImageReady]=useState(!result.diagram);
  const rendering=useLessonRenderedPreview(root,result.html,setRenderError,assistant.mathEnabled);
  useEffect(()=>{panel.current?.scrollIntoView?.({block:'nearest',behavior:'smooth'});},[result.requestId]);
  const patchFigure = (name,value) => assistant.changeResultFigure({[name]:value});
  return <section ref={panel} className="lesson-ai-result" aria-label="Kết quả AI để xem trước">
    <div className="lesson-ai-result-heading"><h4>{result.label} · Kết quả đề xuất</h4><button type="button" disabled={disabled} onClick={()=>void assistant.run(result.action)}><Sparkles size={14}/> Tạo lại</button></div>
    {result.warnings.length>0&&<aside className="lesson-normalize-warnings"><strong>AI cần thầy cô kiểm tra</strong><ul>{result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></aside>}
    {result.html&&<div ref={root} className="lesson-ai-result-preview teacher-content" onLoadCapture={()=>setImageReady(true)} onErrorCapture={()=>setRenderError('Hình minh họa chưa hiển thị được. Thầy cô tạo lại trước khi chèn.')} dangerouslySetInnerHTML={{__html:result.html}}/>}
    {(rendering||!imageReady)&&<p role="status" className="lesson-ai-help">{assistant.mathEnabled ? 'Đang hiển thị công thức và hình minh họa…' : 'Đang hiển thị nội dung và hình minh họa…'}</p>}
    {renderError&&<p role="alert" className="lesson-normalize-error">{renderError}</p>}
    {result.diagram&&<div className="lesson-ai-result-figure-options"><label>Chú thích hình<input aria-label="Chú thích hình đề xuất" maxLength={500} value={result.diagram.caption} disabled={disabled} onChange={event=>patchFigure('caption',event.target.value)}/></label><label>Kích thước {result.diagram.width||100}%<input aria-label="Kích thước hình đề xuất" type="range" min="25" max="100" step="5" value={result.diagram.width||100} disabled={disabled} onChange={event=>patchFigure('width',Number(event.target.value))}/></label></div>}
    {result.html&&<div className="lesson-ai-insert-actions" role="group" aria-label="Chèn kết quả vào bản xem trước">
      {[['before','Chèn trước'],['after','Chèn sau'],['replace','Thay phần đã chọn']].map(([value,label])=><button type="button" key={value} disabled={disabled||!!renderError||rendering||!imageReady} className={result.defaultPosition===value?'is-primary':''} onClick={()=>assistant.insert(value)}>{label}</button>)}
      <span>Nội dung được đưa vào bản xem trước để thầy cô đối chiếu.</span>
    </div>}
  </section>;
}

export function LessonAiToolbar({assistant,normalizerBusy,previewRef}) {
  const a=assistant,disabled=a.busy||normalizerBusy;
  if(!a.selection)return null;
  const mathCount=a.selected.filter(item=>item.kind==='math').length;
  const chooseRequest=value=>{
    if(value==='commands'){a.setMore(true);a.setForm(false);return;}
    if(value==='new-command'){a.newCommand();return;}
    if(value.startsWith('saved:')){const command=a.commands.find(item=>item.id===value.slice(6));if(command){a.openCommand(command);void a.run('custom',command.instruction);}return;}
    if(value)a.chooseAction(value);
  };
  return <div className="lesson-ai-toolbar" role="region" aria-label="AI cho nội dung đã chọn">
      <div className="lesson-ai-toolbar-row">
        <strong className="lesson-ai-selection-count" title={`${a.subject} ${a.grade}`} aria-live="polite">{mathCount?`Đã chọn ${mathCount} bước`:`Đã chọn ${a.figure?'hình':'đoạn chữ'}`}</strong>
        <div className="lesson-ai-request-controls" role="group" aria-label="Yêu cầu AI">
          <label><Sparkles size={14}/><select aria-label="Yêu cầu AI cho vùng chọn" disabled={disabled} value="" onChange={event=>chooseRequest(event.target.value)}>
            <option value="" disabled>Yêu cầu AI…</option>
            <optgroup label="Yêu cầu chính">{LESSON_AI_PRIMARY.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
            {LESSON_AI_GROUPS.map(group=><optgroup key={group.label} label={group.label}>{group.items.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}
            <optgroup label="Lệnh của tôi">{a.commands.map(command=><option key={command.id} value={`saved:${command.id}`}>{command.label}</option>)}<option value="new-command">Tạo lệnh riêng</option><option value="commands">Quản lý lệnh riêng</option></optgroup>
          </select></label>
          <select aria-label="Mức diễn giải AI" disabled={disabled} value={a.options.detail} onChange={event=>a.setOptions({...a.options,detail:event.target.value})}><option value="short">Ngắn, đủ bước</option><option value="detailed">Chi tiết từng bước</option></select>
        </div>
        <div className="lesson-ai-selection-controls" role="group" aria-label="Chọn nội dung">
        <button type="button" disabled={normalizerBusy} aria-pressed={a.addSelection} onClick={()=>a.setAddSelection(!a.addSelection)}>Chọn thêm dòng</button>
        {a.selected[0]?.group&&<button type="button" disabled={disabled} onClick={a.selectGroup}>Chọn cả cụm</button>}
        <button type="button" onClick={()=>previewRef.current?.querySelector('.is-ai-selected')?.scrollIntoView?.({block:'center',behavior:'smooth'})}>Đến vùng chọn</button>
        <button type="button" aria-label="Bỏ chọn nội dung" disabled={disabled} onClick={a.clearSelection}><X size={14}/>Bỏ chọn</button>
        </div>
      </div>
      {a.busy&&<div className="lesson-ai-processing" role="status"><Loader2 size={16} className="animate-spin"/> Đang xử lý đoạn đã chọn…<button type="button" onClick={()=>a.cancel()}>Dừng AI</button></div>}
    </div>;
}

export default function LessonAiTools({assistant,normalizerBusy}) {
  const a=assistant,disabled=a.busy||normalizerBusy;
  if(!a.selection)return <>{a.error&&<p role="alert" className="lesson-normalize-error">{a.error}</p>}{a.notice&&<p role="status" className="lesson-ai-notice">{a.notice}</p>}</>;
  return <>
    {a.more&&<LessonAiPopup title="Lệnh của tôi" closeLabel="Đóng quản lý lệnh riêng" onClose={()=>a.setMore(false)}><section className="lesson-ai-command-manager">
        {!a.commands.length&&<p>Chưa có lệnh đã lưu trên trình duyệt này.</p>}{a.commands.map(command=><div className="lesson-ai-saved-command" key={command.id}>
          <button type="button" onClick={()=>{a.openCommand(command);void a.run('custom',command.instruction);}}>{command.label}</button><button type="button" aria-label={`Sửa lệnh ${command.label}`} onClick={()=>a.openCommand(command)}>Sửa</button><button type="button" aria-label={`Xóa lệnh ${command.label}`} onClick={()=>a.removeCommand(command.id)}>Xóa</button>
        </div>)}<button type="button" onClick={a.newCommand}>Tạo lệnh riêng</button>
    </section></LessonAiPopup>}
    {a.form&&<LessonAiPopup title={lessonAssistantLabel(a.action)} onClose={()=>a.setForm(false)}><form className="lesson-ai-request" onSubmit={event=>{event.preventDefault();void a.run();}}>
      {a.action==='diagram'&&<label>Loại hình <select aria-label="Loại hình minh họa" disabled={disabled} value={a.options.diagramType} onChange={event=>a.setOptions({...a.options,diagramType:event.target.value})}><option value="auto">Tự chọn theo bài</option><option value="geometry">Hình học</option><option value="graph">Đồ thị</option><option value="numberline">Trục số</option><option value="flow">Sơ đồ các bước</option></select></label>}
      {a.action==='practice'&&<label>Số bài <select aria-label="Số bài tự luyện" disabled={disabled} value={a.options.count} onChange={event=>a.setOptions({...a.options,count:Number(event.target.value)})}>{Array.from({length:LESSON_PRACTICE_LIMIT},(_,index)=>index+1).map(count=><option key={count} value={count}>{count} bài</option>)}</select></label>}
      {a.action==='example'&&<label>Mức độ <select aria-label="Mức độ ví dụ" disabled={disabled} value={a.options.level} onChange={event=>a.setOptions({...a.options,level:event.target.value})}><option value="same">Cùng mức với bài</option><option value="easy">Dễ hơn</option></select></label>}
      <label>{a.action==='custom'?'Yêu cầu của thầy cô':'Yêu cầu thêm (nếu có)'}<textarea aria-label="Yêu cầu riêng cho AI" maxLength={3000} rows={3} disabled={disabled} value={a.instruction} onChange={event=>a.setInstruction(event.target.value)} placeholder="Ví dụ: Nêu rõ thay y = 1 vào phương trình nào, rồi tính từng dòng."/></label>
      {a.action==='custom'&&<div className="lesson-ai-save-command"><label>Tên lệnh dùng lại<input aria-label="Tên lệnh riêng" maxLength={60} value={a.commandName} disabled={disabled} onChange={event=>a.setCommandName(event.target.value)} placeholder="Ví dụ: Diễn giải theo cách tôi dạy"/></label><button type="button" disabled={disabled||!a.ownerKey||!a.commandName.trim()||!a.instruction.trim()} onClick={a.saveCommand}>{a.editingCommand?'Lưu thay đổi lệnh':'Lưu thành lệnh riêng'}</button></div>}
      {a.error&&<p role="alert" className="lesson-normalize-error">{a.error}</p>}
      {a.notice&&<p role="status" className="lesson-ai-notice">{a.notice}</p>}
      <div className="lesson-ai-inline-actions lesson-ai-popup-actions"><button type="button" disabled={disabled} onClick={()=>a.setForm(false)}>Hủy yêu cầu</button>{a.action==='custom'&&<button type="button" disabled={disabled} onClick={a.newCommand}>Viết lệnh mới</button>}<button type="submit" className="is-primary" disabled={disabled||a.action==='custom'&&!a.instruction.trim()}>OK</button></div>
    </form></LessonAiPopup>}
    {a.figure&&<FigureEditor key={`${a.figure.id}/${a.plan.originalHtml}`} figure={a.figure} disabled={disabled} onApply={a.updateFigure}/>}
    {a.error&&<div role="alert" className="lesson-normalize-error">{a.error}<button type="button" className="lesson-ai-retry" disabled={disabled} onClick={()=>void a.run()}>Thử lại</button></div>}
    {a.notice&&<p role="status" className="lesson-ai-notice">{a.notice}</p>}
    {a.result&&<AiResult key={a.result.requestId} assistant={a} disabled={disabled}/>}
  </>;
}
