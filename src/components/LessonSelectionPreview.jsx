import { useEffect, useRef } from 'react';
import useLessonRenderedPreview from '../hooks/useLessonRenderedPreview';

export default function LessonSelectionPreview({assistant,rootRef,onRenderError,disabled=false}) {
  const localRoot=useRef(null),root=rootRef||localRoot;
  const {plan,tools,selection}=assistant;
  useLessonRenderedPreview(root,plan.annotatedHtml,onRenderError,assistant.mathEnabled);
  useEffect(()=>{
    const selected=new Set(tools.selectedItems(plan,selection).map(item=>item.id));
    for(const node of root.current?.querySelectorAll('[data-lai-unit]')||[]) {
      const active=selected.has(node.dataset.laiUnit);node.classList.toggle('is-ai-selected',active);
      if(node.getAttribute('role')==='button')node.setAttribute('aria-pressed',String(active));
    }
  },[plan,selection,tools,root]);
  const capture = () => {
    if(disabled)return;
    const selected=tools.capture(root.current,plan,window.getSelection());
    if(selected)assistant.select(selected);
  };
  const click = event => {
    if(disabled||!window.getSelection()?.isCollapsed)return;
    const unit=event.target.closest('[data-lai-unit]');
    if(unit&&['math','figure'].includes(unit.dataset.laiKind))assistant.select(tools.whole(plan,unit.dataset.laiUnit),event.shiftKey);
  };
  return <div ref={root} className="lesson-normalize-preview lesson-selection-preview teacher-content" aria-label="Bản xem trước có thể chọn từng bước"
    onMouseUp={capture} onTouchEnd={capture} onKeyUp={event=>{if(event.key.startsWith('Arrow'))capture();}} onClick={click}
    onKeyDown={event=>{const unit=event.target.closest('[data-lai-unit]');if(!disabled&&unit&&unit.getAttribute('role')==='button'&&['Enter',' '].includes(event.key)){event.preventDefault();assistant.select(tools.whole(plan,unit.dataset.laiUnit),event.shiftKey);}}}
    dangerouslySetInnerHTML={{__html:plan.annotatedHtml}} />;
}
