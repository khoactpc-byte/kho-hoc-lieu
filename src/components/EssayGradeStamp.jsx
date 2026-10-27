import { ESSAY_ASSESSMENT_LEVELS, essayReviewNumberText } from '../utils/essayGrading';

export default function EssayGradeStamp({review={},className=''}) {
  const level=ESSAY_ASSESSMENT_LEVELS.includes(review.teacherAssessment)?review.teacherAssessment:'';
  const score=essayReviewNumberText(review.teacherScore),maximum=essayReviewNumberText(review.teacherMaxScore);
  if(!level && (!score || !maximum || !Number.isFinite(Number(score)) || !Number.isFinite(Number(maximum)) || Number(maximum)<=0 || Number(maximum)>1000 || Number(score)<0 || Number(score)>Number(maximum)))return null;
  const label=level?`Mức nhận xét: ${level}`:`Điểm: ${score.replace('.',',')} trên ${maximum.replace('.',',')}`;
  return <div className={`essay-grade-stamp ${className}`} aria-label={label}><span>{level || score.replace('.',',')}</span>{!level && <small>/{maximum.replace('.',',')}</small>}</div>;
}
