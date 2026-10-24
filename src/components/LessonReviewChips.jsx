import { ListChecks, Loader2, X } from 'lucide-react';

export default function LessonReviewChips({ reviews, onOpen, onRemove, removingIds = [] }) {
  if (!reviews.length) return null;
  return <div className="lesson-review-chips" role="group" aria-label="Câu hỏi ôn tập đã tạo">
    {reviews.map((review, index) => {
      const count = review.questionCount || review.quizData?.questionCountPerAttempt || review.quizData?.questions?.length;
      const essays = review.essayQuestionCount || review.quizData?.essayQuestions?.length || 0;
      const title = review.title || `Câu hỏi ôn tập ${index + 1}`;
      const busy = removingIds.includes(review.id);
      return <span key={review.id} className="lesson-review-chip">
        <button type="button" className="lesson-review-open" disabled={busy} title={title} aria-label={`Xem ${title}`} onClick={() => onOpen(review)}><ListChecks className="h-3.5 w-3.5" /><span>Ôn tập{reviews.length > 1 ? ` ${index + 1}` : ''}{count ? ` · ${count} ${essays ? 'TN' : 'câu'}` : ''}{essays ? ` + ${essays} TL` : ''}</span></button>
        <button type="button" className="lesson-review-remove" disabled={busy} title="Xóa bộ ôn tập" aria-label={`Xóa ${title}`} onClick={() => onRemove(review)}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}</button>
      </span>;
    })}
  </div>;
}
