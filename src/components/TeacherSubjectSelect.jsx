import { ChevronDown } from 'lucide-react';

export default function TeacherSubjectSelect({ subjects, value, onChange }) {
  return <div className="relative min-w-0 max-w-[132px] shrink sm:max-w-[220px]">
    <select aria-label="Môn dạy" title="Đổi môn dạy" value={value} onChange={event => onChange(event.target.value)}
      className="w-full appearance-none truncate rounded-md border border-sky-100 bg-sky-50 py-0.5 pl-1.5 pr-5 font-black text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100 sm:rounded-lg sm:pl-2 sm:pr-7">
      {subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
    </select>
    <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-sky-700/60 sm:right-2" />
  </div>;
}
