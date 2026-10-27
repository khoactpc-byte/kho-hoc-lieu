import {useEffect,useState} from 'react';
import {requestEssayWork} from '../services/essayWork';
import EssayFeedbackText from './EssayFeedbackText';

export default function TeacherEssayAnalysis({submission,open}) {
  const [analysis,setAnalysis]=useState(''),[error,setError]=useState('');
  useEffect(()=>{
    if(!open || submission.aiFeedbackVersion!==2)return;
    const controller=new AbortController();
    requestEssayWork('analysis',{id:submission.id},{signal:controller.signal}).then(result=>setAnalysis(result.analysis || '')).catch(error=>{if(error.name!=='AbortError')setError(error.message);});
    return()=>controller.abort();
  },[open,submission.id,submission.aiGradedAt,submission.aiFeedbackVersion]);
  return <div style={{maxHeight:300,overflowY:'auto',fontSize:13}}><EssayFeedbackText hidden={!open} text={submission.aiFeedbackVersion===2?analysis || error || 'Đang tải phân tích riêng…':submission.aiComment}/></div>;
}
