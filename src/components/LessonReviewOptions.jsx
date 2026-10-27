import { REVIEW_QUESTION_OPTIONS } from '../utils/lessonReview';

export default function LessonReviewOptions({ count, essayCount, disabled, onChange, mode = 'quick', onModeChange }) {
  return <fieldset disabled={disabled} className="lesson-review-options">
    <label className="block text-sm font-semibold">Loại câu hỏi <span className="lesson-review-select-hint">Nhấn vào để chọn số lượng</span>
      <select aria-label="Loại câu hỏi AI" value={count} onChange={event => onChange(event.target.value, essayCount)} className="mt-2 w-full rounded-lg border p-3">
        {REVIEW_QUESTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    {onModeChange && <label className="block text-sm font-semibold">Cách tạo
      <select aria-label="Cách tạo câu hỏi" value={mode} onChange={event => onModeChange(event.target.value)} className="mt-2 w-full rounded-lg border p-3">
        <option value="quick">Tạo nhanh</option>
        <option value="verified">Kiểm tra kỹ</option>
      </select>
      <span className="mt-1 block text-xs font-normal text-slate-500">{mode === 'verified' ? 'AI giải lại độc lập từng câu để đối chiếu đáp án.' : 'AI tự kiểm tra trong lúc tạo. Có thể nhờ giải lại sau khi xem kết quả.'}</span>
    </label>}
    <div className="lesson-review-essay-options">
      <label><input type="checkbox" checked={essayCount > 0} onChange={event => onChange(count, event.target.checked ? 1 : 0)} /> Thêm câu hỏi tự luận</label>
      {essayCount > 0 && <select aria-label="Số câu tự luận" value={essayCount} onChange={event => onChange(count, Number(event.target.value))}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} câu</option>)}</select>}
    </div>
  </fieldset>;
}
