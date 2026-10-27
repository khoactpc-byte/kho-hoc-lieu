import { useState } from 'react';
import EssaySubmissionViewer from './EssaySubmissionViewer';
import EssayGradeStamp from './EssayGradeStamp';
import {studentEssayComment} from '../utils/essayFeedback';
import EssayFeedbackText from './EssayFeedbackText';

export default function ReturnedEssayReview({submission,showSummary=true,loadFile}) {
  const [open,setOpen]=useState(false);
  const review=submission.returnedReview || (submission.reviewedAt && submission.feedbackSentReviewAt===submission.reviewedAt ? submission : null);
  if(!review || review.fileId!==submission.fileId || (review.submittedAt || 0)!==(submission.submittedAt || 0))return null;
  return <section className="returned-essay-review">{showSummary && <><h4>Bài giáo viên đã trả</h4><EssayGradeStamp review={review}/>
    {review.teacherComment && <EssayFeedbackText text={studentEssayComment(review.teacherComment)}/>}</>}
    <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Đóng bài chấm':'Xem bài và nét chấm của giáo viên'}</button>
    {open && <EssaySubmissionViewer submission={submission} value={review.teacherAnnotations} reviewStamp={review} loadFile={loadFile} />}
  </section>;
}
