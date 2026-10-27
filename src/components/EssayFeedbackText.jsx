import {useEffect,useMemo,useRef} from 'react';
import {formatMathPlainText,normalizeMathText} from '../utils/quizContent';
import {escapeHtmlText} from '../utils/safeHtml';
import {readableEssayMath} from '../utils/essayMath';
import {typesetMath} from '../utils/mathTypesetting';

export default function EssayFeedbackText({text='',className='',hidden=false,label}){
  const root=useRef(null);
  const prepared=useMemo(()=>normalizeMathText(readableEssayMath(text)),[text]);
  const unsafe=/\\(?:href|url|require|class|cssId|style|html[A-Za-z]*|includegraphics)\b/i.test(prepared);
  const html=useMemo(()=>unsafe?escapeHtmlText(prepared).replace(/\n/g,'<br/>'):formatMathPlainText(prepared),[prepared,unsafe]);
  useEffect(()=>{if(!hidden && !unsafe && /\\[([]/.test(prepared))typesetMath(root.current);},[html,prepared,hidden,unsafe]);
  return <div ref={root} hidden={hidden} role={label?'region':undefined} aria-label={label} className={`essay-feedback-text ${className}`} dangerouslySetInnerHTML={{__html:html}}/>;
}
