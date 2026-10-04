import { useId, useMemo, useState } from 'react';
import { getAccountTeacherSuggestions } from '../utils/teacherSuggestions';

export default function TeacherNameInput({ value, onChange, schoolCode, teachersByCampus }) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const hintId = `${inputId}-hint`;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => getAccountTeacherSuggestions({
    schoolCode, teachersByCampus, query: value
  }), [schoolCode, teachersByCampus, value]);
  const showSuggestions = isOpen && suggestions.length > 0;

  const selectTeacher = (teacher) => {
    onChange(teacher.name);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      setActiveIndex(-1);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex(previous => {
        if (!isOpen || previous < 0 || previous >= suggestions.length) return event.key === 'ArrowDown' ? 0 : suggestions.length - 1;
        return (previous + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      });
    } else if (event.key === 'Enter' && showSuggestions && suggestions[activeIndex]) {
      event.preventDefault();
      selectTeacher(suggestions[activeIndex]);
    }
  };

  return (
    <div className="min-w-0 text-xs font-bold text-slate-600">
      <label htmlFor={inputId}>Họ tên giáo viên</label>
      <div className="relative mt-1">
        <input
          id={inputId}
          required
          maxLength={120}
          value={value}
          onChange={event => {
            onChange(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => { setIsOpen(true); setActiveIndex(-1); }}
          onClick={() => { setIsOpen(true); setActiveIndex(-1); }}
          onBlur={() => { setIsOpen(false); setActiveIndex(-1); }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={showSuggestions && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400"
          placeholder="Nhập tên, ví dụ: pham anh khoa"
        />
        {showSuggestions && (
          <div id={listId} role="listbox" aria-label="Gợi ý tên giáo viên" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-emerald-200 bg-white p-1 shadow-lg">
            {suggestions.map((teacher, index) => (
              <button
                key={teacher.name}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={activeIndex === index}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectTeacher(teacher)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${activeIndex === index ? 'bg-emerald-100 text-emerald-950' : 'text-slate-700 hover:bg-emerald-50'}`}
              >
                {teacher.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <p id={hintId} className="mt-1 font-medium text-slate-400">Tìm có dấu hoặc không dấu trong danh sách của cơ sở đang chọn.</p>
      {isOpen && !suggestions.length && <p role="status" className="mt-1 font-medium text-slate-500">Chưa tìm thấy giáo viên phù hợp. Bạn vẫn có thể nhập tên mới.</p>}
    </div>
  );
}
