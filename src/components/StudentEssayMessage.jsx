import {useEffect,useState} from 'react';
import {readEssayFeedbackMessage} from '../utils/essayFeedback';
import {requestEssayWork} from '../services/essayWork';
import EssayGradeStamp from './EssayGradeStamp';
import ReturnedEssayReview from './ReturnedEssayReview';
import EssayFeedbackText from './EssayFeedbackText';

const loadReturned=(messageId,signal)=>requestEssayWork('returned',{messageId},{signal});
export default function StudentEssayMessage({message,loadReview=loadReturned,loadFile}) {
  const feedback=readEssayFeedbackMessage(message?.body);
  const [submission,setSubmission]=useState(null);
  const isEssay=!!feedback;
  useEffect(()=>{
    setSubmission(null);
    if(!isEssay || !/^essay-[a-f0-9]{64}$/.test(message.id || ''))return;
    const controller=new AbortController();
    loadReview(message.id,controller.signal).then(result=>{if(!controller.signal.aborted)setSubmission(result.submission || null);}).catch(()=>{});
    return()=>controller.abort();
  },[message?.id,isEssay,loadReview]);
  if(!feedback)return <div className="whitespace-pre-wrap text-sm font-medium leading-7 text-slate-700 sm:text-base">{message?.body}</div>;
  return <section className="essay-feedback-card" aria-label="Kết quả bài tự luận"><EssayGradeStamp review={feedback.review}/>
    <div className="essay-feedback-details">{feedback.details.map(line=><p key={line}>{line}</p>)}</div>
    <h5>Nhận xét của thầy/cô</h5><EssayFeedbackText text={feedback.comment || 'Em xem kết quả và các ghi chú trên bài đã chấm.'}/>
    {submission ? <ReturnedEssayReview key={submission.id} submission={submission} showSummary={false} loadFile={loadFile}/> : <p className="essay-feedback-help">Em có thể mở bài tự luận đã nộp của tuần này để xem bài đã chấm.</p>}
  </section>;
}
