import { useState } from 'react';

const pad2 = (value) => String(value).padStart(2, '0');

const getSchoolYearStartYear = (schoolYear = '') => {
  const match = String(schoolYear || '').match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
};

const getTeachingImportYearForMonth = (month = 0, schoolYear = '') => {
  const startYear = getSchoolYearStartYear(schoolYear);
  if (month >= 9 && month <= 12) return startYear;
  if (month >= 1 && month <= 5) return startYear + 1;
  return 0;
};

const parseDateValue = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (normalized) return new Date(Number(normalized[1]), Number(normalized[2]) - 1, Number(normalized[3]));
  const local = text.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/);
  if (local) return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
  return null;
};

const getTeachingImportDateParts = (value = '', schoolYear = '') => {
  const text = String(value || '').trim();
  const parsedDate = parseDateValue(text);
  if (parsedDate) {
    return {
      day: pad2(parsedDate.getDate()),
      month: pad2(parsedDate.getMonth() + 1),
      year: String(parsedDate.getFullYear())
    };
  }
  const match = text.match(/^(\d{1,2})(?:\D+(\d{1,2}))?(?:\D+(\d{4}))?/);
  const day = match?.[1] || '';
  const month = match?.[2] || '';
  const inferredYear = month ? getTeachingImportYearForMonth(Number(month), schoolYear) : '';
  return {
    day,
    month,
    year: match?.[3] || (inferredYear ? String(inferredYear) : '')
  };
};

export default function TeachingImportDateFields({ value, onChange, title, schoolYear }) {
  const [parts, setParts] = useState(() => getTeachingImportDateParts(value, schoolYear));

  const commitParts = (nextParts = parts) => {
    const rawDay = String(nextParts.day || '').replace(/\D/g, '').slice(0, 2);
    const rawMonth = String(nextParts.month || '').replace(/\D/g, '').slice(0, 2);
    const dayNumber = Number(rawDay);
    const monthNumber = Number(rawMonth);
    const day = dayNumber > 0 ? String(Math.min(dayNumber, 31)).padStart(rawDay.length > 1 ? 2 : rawDay.length, '0') : '';
    const month = monthNumber > 0 ? String(Math.min(monthNumber, 12)).padStart(2, '0') : '';
    const year = month ? getTeachingImportYearForMonth(Number(month), schoolYear) : '';
    if (!day) {
      onChange('');
      return;
    }
    onChange(month ? `${day}/${month}/${year || ''}` : day);
    setParts({ day, month, year: year ? String(year) : '' });
  };

  const updatePart = (part, rawValue) => {
    const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 2);
    setParts(prev => {
      const bounded = part === 'month' && Number(digits) > 12
        ? '12'
        : (part === 'day' && Number(digits) > 31 ? '31' : digits);
      const next = { ...prev, [part]: bounded };
      const month = part === 'month' ? bounded : next.month;
      const year = month ? getTeachingImportYearForMonth(Number(month), schoolYear) : '';
      return { ...next, year: year ? String(year) : '' };
    });
  };

  const handleBlur = () => {
    commitParts();
  };

  return (
    <div className="inline-flex h-7 items-center rounded-md border border-indigo-100 bg-white px-1 text-xs font-normal outline-none focus-within:border-indigo-400">
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={parts.day || ''}
        onChange={(event) => updatePart('day', event.target.value)}
        onBlur={handleBlur}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="dd"
        className="h-6 w-7 bg-transparent text-center outline-none"
        title={`${title}: ngày`}
      />
      <span className="text-slate-400">/</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={parts.month || ''}
        onChange={(event) => updatePart('month', event.target.value)}
        onBlur={handleBlur}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="mm"
        className="h-6 w-7 bg-transparent text-center outline-none"
        title={`${title}: tháng`}
      />
      <span className="text-slate-400">/</span>
      <input
        type="text"
        value={parts.year || ''}
        readOnly
        placeholder="yyyy"
        className="h-6 w-12 bg-transparent text-center text-slate-500 outline-none"
        title={`${title}: năm tự lấy theo năm học`}
        tabIndex={-1}
      />
    </div>
  );
}
