import { BookOpen } from 'lucide-react';

export default function LearningSubjectPanel({ role, subjects, onSelect, getShortName, getCardStyle }) {
  const isStudent = role === 'student';
  return <section className={isStudent ? 'student-subject-panel' : 'bg-white/80 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-8 border border-white shadow-xl'}>
    <div className={isStudent ? 'student-subject-heading' : 'flex items-center gap-3 mb-4 sm:mb-6 border-b-2 border-blue-100/50 pb-4'}>
      <BookOpen className={isStudent ? 'w-4 h-4 text-sky-700' : 'w-5 h-5 sm:w-6 sm:h-6 text-blue-600'} />
      <h2 className={isStudent ? '' : 'text-base sm:text-2xl font-black text-slate-800 uppercase tracking-widest'}>{isStudent ? 'Môn học' : 'Môn dạy'}</h2>
    </div>
    <div className={isStudent ? 'student-subject-grid' : 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3'}>
      {subjects.map((subject, index) => <button key={subject} type="button" onClick={() => onSelect(subject)}
        className={isStudent ? 'student-subject-button' : `${getCardStyle(index)} border hover:shadow-md rounded-xl p-3 sm:p-4 flex items-center justify-center transition-all group active:scale-95 text-center h-[58px] sm:h-[66px]`}>
        <span className={isStudent ? '' : 'font-black text-current text-xs sm:text-sm uppercase tracking-tight leading-snug'}>{getShortName(subject)}</span>
      </button>)}
    </div>
  </section>;
}
