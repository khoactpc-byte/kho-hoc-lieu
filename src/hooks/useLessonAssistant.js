import { useEffect, useMemo, useRef, useState } from 'react';
import { createLessonSelectionTools } from '../utils/lessonSelection';
import { createLessonAssistantContentTools, lessonAssistantLabel, lessonAssistantPayload, readLessonCommands, saveLessonCommands } from '../utils/lessonAssistant';
import { lessonUsesMath } from '../utils/lessonSubject';

const storage = () => {try {return window.localStorage;} catch {return null;}};
export default function useLessonAssistant(normalizer) {
  const {contextKey,subject,grade,ownerKey,requestAI,sourceIsCurrent}=normalizer.assistantContext;
  const mathEnabled = lessonUsesMath(subject);
  const html=normalizer.preview.html;
  const tools=useMemo(()=>createLessonSelectionTools(window),[]),content=useMemo(()=>createLessonAssistantContentTools(window),[]);
  const plan=useMemo(()=>tools.plan(html, { mathEnabled }),[html,tools,mathEnabled]);
  const [selection,setSelection]=useState(null),[addSelection,setAddSelection]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [more,setMore]=useState(false),[form,setForm]=useState(false),[action,setAction]=useState('explain');
  const [instructionsByAction,setInstructionsByAction]=useState({}),[commandName,setCommandName]=useState(''),[editingCommand,setEditingCommand]=useState('');
  const instruction=instructionsByAction[action]||'';
  const setInstruction=value=>setInstructionsByAction(previous=>({...previous,[action]:value}));
  const [options,setOptions]=useState({detail:'short',count:1,level:'same',diagramType:'auto'}),[commands,setCommands]=useState(()=>readLessonCommands(storage(),ownerKey));
  const [result,setResult]=useState(null),[history,setHistory]=useState([]);
  const sequence=useRef(0),controller=useRef(null),mutation=useRef(false),latest=useRef(null);
  latest.current={html,selection,contextKey};
  useEffect(()=>{
    sequence.current++;controller.current?.abort();mutation.current=false;
    setSelection(null);setResult(null);setBusy(false);setError('');setForm(false);setMore(false);
  },[html,contextKey]);
  useEffect(()=>()=>{sequence.current++;controller.current?.abort();},[]);
  const cancel = (silent=false) => {sequence.current++;controller.current?.abort();setBusy(false);if(!silent)setNotice('Đã dừng yêu cầu AI. Bài đang soạn được giữ nguyên.');};
  const select = (value,extend=false) => {
    try {
      const next=(extend||addSelection)?tools.expand(plan,selection,value):value;
      tools.details(plan,next);cancel(true);setSelection(next);setResult(null);setError('');setNotice('');
    } catch(failure) {setError(failure.message);}
  };
  const clearSelection = () => {cancel(true);setSelection(null);setResult(null);setForm(false);setMore(false);setError('');};
  const selected=useMemo(()=>tools.selectedItems(plan,selection),[plan,selection,tools]);
  const run = async (chosenAction=action,chosenInstruction) => {
    if(busy||normalizer.busy)return;
    const captured={html,selection,contextKey};let details,payload;
    try {
      if(!sourceIsCurrent())throw new Error('Bài đang soạn đã thay đổi. Thầy cô mở lại chuẩn hóa để giữ nội dung mới.');
      details=tools.details(plan,selection);
      payload=lessonAssistantPayload(details,{...options,action:chosenAction,instruction:chosenInstruction??(instructionsByAction[chosenAction]||''),subject,grade});
    } catch(failure) {setError(failure.message);return;}
    const request=++sequence.current;controller.current=new AbortController();setBusy(true);setError('');setNotice('');setMore(false);setForm(false);setAction(chosenAction);
    try {
      const text=await requestAI(payload,{signal:controller.current.signal});
      if(request!==sequence.current||latest.current.html!==captured.html||latest.current.contextKey!==captured.contextKey||JSON.stringify(latest.current.selection)!==JSON.stringify(captured.selection))return;
      if(!sourceIsCurrent())throw new Error('Bài đã thay đổi trong lúc AI xử lý. Thầy cô mở lại chuẩn hóa để chọn nội dung mới.');
      const parsed=content.parse(text,{action:chosenAction,count:options.count,selectedText:details.text});
      setResult({...parsed,requestId:request,sourceHtml:captured.html,selection:captured.selection,selectedText:details.text,action:chosenAction,label:lessonAssistantLabel(chosenAction),
        defaultPosition:chosenAction==='slow'?'replace':['missing','diagram','example','practice','reallife','alternative','custom'].includes(chosenAction)?'after':'before'});
    } catch(failure) {
      if(request===sequence.current&&!controller.current?.signal.aborted)setError(failure.message||'Chưa nhận được kết quả AI. Thầy cô thử lại.');
    } finally {if(request===sequence.current)setBusy(false);}
  };
  const chooseAction = id => {
    setAction(id);setMore(false);setError('');
    const needsForm=['custom','diagram','practice','example'].includes(id);setForm(needsForm);
    if(!needsForm)void run(id,'');
  };
  const commit = (next,description) => {
    if(mutation.current||busy||normalizer.busy)return false;
    if(next===html){setNotice('Nội dung hiện tại đã khớp kết quả đã chọn.');return false;}
    if(!normalizer.updatePreviewHtml(next,html))return false;
    mutation.current=true;setHistory(previous=>[...previous,{before:html,after:next}].slice(-15));setNotice(description);return true;
  };
  const insert = position => {
    try {
      if(!result?.html||result.sourceHtml!==html||JSON.stringify(result.selection)!==JSON.stringify(selection))throw new Error('Kết quả không còn khớp vùng chọn. Thầy cô tạo lại.');
      if(position==='replace') {const issue=content.replacementIssue(result.selectedText,result.html);if(issue)throw new Error(issue);}
      const next=tools.insert(plan,selection,result.html,position);
      commit(next,'Đã đưa nội dung vào bản xem trước. Bấm Áp dụng để đưa vào bài đang soạn.');
    } catch(failure) {setError(failure.message);}
  };
  const undo = () => {
    const last=history.at(-1);
    if(!last||last.after!==html||mutation.current||busy||normalizer.busy)return;
    if(normalizer.updatePreviewHtml(last.before,html)) {mutation.current=true;setHistory(previous=>previous.slice(0,-1));setNotice('Đã hoàn tác lần chèn hoặc sửa hình vừa rồi.');}
  };
  const figure = useMemo(()=>{
    if(selected.length!==1||selected[0].kind!=='figure')return null;
    const root=document.createElement('div');root.innerHTML=plan.annotatedHtml;
    const node=root.querySelector(`[data-lai-unit="${selected[0].id}"]`);
    return {id:selected[0].id,width:parseFloat(node.querySelector('img')?.style.width)||100,caption:node.querySelector('figcaption')?.textContent||''};
  },[selected,plan]);
  const updateFigure = changes => {try {commit(tools.changeFigure(plan,selection,changes),changes.remove?'Đã xóa hình khỏi bản xem trước.':'Đã cập nhật kích thước và chú thích hình.');} catch(failure){setError(failure.message);}};
  const changeResultFigure = changes => {
    if(!result?.diagram||busy)return;
    const root=document.createElement('div');root.innerHTML=result.html;const figure=root.querySelector('figure'),image=figure?.querySelector('img');
    if(!figure||!image)return;
    const diagram={...result.diagram,...changes};
    image.style.width=`${Math.min(100,Math.max(25,Number(diagram.width)||100))}%`;
    const caption=figure.querySelector('figcaption');if(caption)caption.textContent=String(diagram.caption||'').slice(0,500);
    image.alt=String(diagram.caption||'').slice(0,500);setResult({...result,html:root.innerHTML,diagram});
  };
  const saveCommand = () => {
    try {
      const label=commandName.trim(),value=instruction.trim();
      if(commands.some(command=>command.id!==editingCommand&&command.label.toLocaleLowerCase('vi')===label.toLocaleLowerCase('vi')))throw new Error('Tên lệnh đã có. Thầy cô dùng tên khác.');
      const id=editingCommand||`cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      const next=editingCommand?commands.map(command=>command.id===id?{id,label,instruction:value}:command):[...commands,{id,label,instruction:value}];
      setCommands(saveLessonCommands(storage(),ownerKey,next));setEditingCommand(id);setNotice('Đã lưu lệnh riêng trên trình duyệt này cho tài khoản của thầy cô.');setError('');
    } catch(failure){setError(failure.message);}
  };
  const openCommand = command => {setAction('custom');setForm(true);setMore(false);setInstructionsByAction(previous=>({...previous,custom:command.instruction}));setCommandName(command.label);setEditingCommand(command.id);};
  const removeCommand = id => {try {setCommands(saveLessonCommands(storage(),ownerKey,commands.filter(command=>command.id!==id)));if(editingCommand===id)setEditingCommand('');setNotice('Đã xóa lệnh riêng.');}catch(failure){setError(failure.message);}};
  return {plan,tools,selection,selected,select,clearSelection,addSelection,setAddSelection,selectGroup:()=>select(tools.wholeGroup(plan,selection)),
    busy,error,notice,more,setMore,form,setForm,action,chooseAction,run,cancel,result,insert,undo,canUndo:!!history.length&&history.at(-1).after===html,
    options,setOptions,instruction,setInstruction,commandName,setCommandName,editingCommand,commands,saveCommand,openCommand,removeCommand,
    newCommand:()=>{setEditingCommand('');setCommandName('');setInstructionsByAction(previous=>({...previous,custom:''}));setAction('custom');setForm(true);setMore(false);},figure,updateFigure,changeResultFigure,
    subject,grade,ownerKey,mathEnabled};
}
