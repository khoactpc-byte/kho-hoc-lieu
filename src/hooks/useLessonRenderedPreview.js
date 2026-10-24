import { useEffect, useState } from 'react';
import { typesetMath } from '../utils/mathTypesetting';
import { renderedQuizMathIssue } from '../utils/quizQuality';

export default function useLessonRenderedPreview(root, html, onError, mathEnabled = true) {
  const [rendering,setRendering]=useState(()=>mathEnabled && /\\[([]/.test(html));
  useEffect(()=>{
    const node=root.current;if(!node)return;
    let stopped=false;onError('');
    if(!mathEnabled || !/\\[([]/.test(node.textContent)&&!node.querySelector('math')){setRendering(false);return;}
    setRendering(true);
    const inspect=()=>{if(!stopped&&node.querySelector('mjx-container,mjx-merror'))onError(renderedQuizMathIssue(node));};
    const observer=new node.ownerDocument.defaultView.MutationObserver(inspect);observer.observe(node,{childList:true,subtree:true});
    typesetMath(node,success=>{if(!stopped){setRendering(false);onError(success?renderedQuizMathIssue(node):'Chưa hiển thị được công thức. Thầy cô kiểm tra mạng rồi thử lại.');}});
    return ()=>{stopped=true;observer.disconnect();};
  },[html,root,onError,mathEnabled]);
  return rendering;
}
