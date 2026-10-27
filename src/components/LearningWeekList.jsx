import { Sparkles } from 'lucide-react';

export default function LearningWeekList({ weeks, onSelect }) {
  return <div className="learning-week-list" aria-label="Danh sách tuần học">
    {weeks.map(week => {
      const percent = week.percent == null ? null : Math.round(Math.max(0, Math.min(100, Number(week.percent) || 0)));
      return <button key={week.lesson} type="button" aria-label={week.label} onClick={() => onSelect(week.lesson)}
        className={`learning-week-row ${week.appearance.bg} ${week.appearance.border} ${week.appearance.isExam ? 'learning-week-exam' : ''}`}>
        <span className={`learning-week-label ${week.appearance.text}`}>
          Tuần {week.lesson}
          {week.quizLabel && <span className={`learning-week-quiz ${week.quizPending ? 'learning-week-quiz-pending' : ''}`}
            title={week.quizLabel} aria-label={week.quizLabel}><Sparkles aria-hidden="true" /></span>}
        </span>
        {week.appearance.isExam ? <span className={`learning-week-exam-label ${week.appearance.text}`}>{week.appearance.main.replaceAll('_', ' ')}</span>
          : percent == null ? <span className="learning-week-track" title="Xem học sinh để xem tiến độ học" aria-hidden="true" />
            : <span className="learning-week-track" role="progressbar" aria-label={`Tiến độ Tuần ${week.lesson}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <span className={`learning-week-fill ${percent >= 100 ? 'learning-week-complete' : ''}`} style={{ width: `${percent}%` }} />
            </span>}
        <span className={`learning-week-percent ${percent >= 100 ? 'learning-week-finished' : ''}`}>{percent == null ? '—' : `${percent}%`}</span>
      </button>;
    })}
  </div>;
}
