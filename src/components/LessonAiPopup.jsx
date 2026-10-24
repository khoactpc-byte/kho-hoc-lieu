import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function LessonAiPopup({title,closeLabel='Đóng yêu cầu AI',onClose,children}) {
  const root=useRef(null),titleId=useId();
  useEffect(()=>{
    const previous=document.activeElement,panel=root.current;
    (panel.querySelector('.lesson-ai-popup-content select,.lesson-ai-popup-content textarea,.lesson-ai-popup-content input,.lesson-ai-popup-content button:not(:disabled)')||panel).focus();
    return ()=>{
      if(previous?.isConnected&&previous!==document.body&&!previous.disabled)previous.focus();
      else document.querySelector('.lesson-normalize-dialog')?.focus();
    };
  },[]);
  const onKeyDown=event=>{
    event.stopPropagation();
    if(event.key==='Escape') {if(event.target.tagName==='SELECT')return;event.preventDefault();onClose();}
    if(event.key==='Tab') {
      const nodes=[...root.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
      if(!nodes.length){event.preventDefault();return;}
      if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}
      else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
    }
  };
  return createPortal(<div className="lesson-ai-popup-backdrop" onKeyDown={onKeyDown}>
    <section ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="lesson-ai-popup">
      <header><h4 id={titleId}>{title}</h4><button type="button" aria-label={closeLabel} onClick={onClose}><X size={18}/></button></header>
      <div className="lesson-ai-popup-content">{children}</div>
    </section>
  </div>,document.body);
}
