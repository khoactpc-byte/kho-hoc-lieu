export default function LessonAnswerVisibilityControl({ visible, onChange, disabled }) {
  return <label className="lesson-answer-switch" title="Cho học sinh xem đáp án của bài học tuần này">
    <input type="checkbox" aria-label="Cho học sinh xem đáp án" checked={visible} onChange={event => onChange(event.target.checked)} disabled={disabled} />
    <span>Hiện đáp án</span>
  </label>;
}
