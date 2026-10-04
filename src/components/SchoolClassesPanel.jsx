import { Copy, Layers, Minus, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  SCHOOL_GRADES,
  normalizeSchoolClassName,
  normalizeSchoolClassesByGrade,
  normalizeSchoolYearKey
} from '../utils/schoolClasses';

const emptyClassesByGrade = () => Object.fromEntries(SCHOOL_GRADES.map(grade => [grade, []]));

const classSuffix = (index) => {
  let value = index + 1;
  let suffix = '';
  while (value > 0) {
    value -= 1;
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }
  return suffix;
};

const getPreviousConfiguredYear = (allYears = {}, selectedYear = '') => {
  const selectedStart = Number(normalizeSchoolYearKey(selectedYear).match(/^\d{4}/)?.[0] || 0);
  return Object.keys(allYears || {})
    .map(year => ({ year: normalizeSchoolYearKey(year), start: Number(String(year).match(/^\d{4}/)?.[0] || 0) }))
    .filter(item => item.start && item.start < selectedStart)
    .sort((left, right) => right.start - left.start)[0]?.year || '';
};

export default function SchoolClassesPanel({
  selectedSchoolYear = '',
  classesByYear = {},
  onSaveSetting,
  showNotification
}) {
  const yearKey = normalizeSchoolYearKey(selectedSchoolYear);
  const [draft, setDraft] = useState(emptyClassesByGrade);
  const [isSaving, setIsSaving] = useState(false);

  const savedForYear = useMemo(
    () => normalizeSchoolClassesByGrade(classesByYear?.[yearKey]),
    [classesByYear, yearKey]
  );

  useEffect(() => {
    setDraft(savedForYear);
  }, [savedForYear]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedForYear);
  const totalClasses = SCHOOL_GRADES.reduce((sum, grade) => sum + (draft[grade]?.length || 0), 0);
  const previousYear = getPreviousConfiguredYear(classesByYear, yearKey);

  const setClassCount = (grade, rawCount) => {
    const count = Math.max(0, Math.min(52, Number(rawCount) || 0));
    setDraft(prev => {
      const current = [...(prev[grade] || [])];
      if (count < current.length) current.length = count;
      while (current.length < count) {
        let suffixIndex = current.length;
        let nextName = `${grade}${classSuffix(suffixIndex)}`;
        while (current.includes(nextName)) {
          suffixIndex += 1;
          nextName = `${grade}${classSuffix(suffixIndex)}`;
        }
        current.push(nextName);
      }
      return { ...prev, [grade]: current };
    });
  };

  const updateClassName = (grade, index, value) => {
    setDraft(prev => ({
      ...prev,
      [grade]: (prev[grade] || []).map((item, itemIndex) => itemIndex === index ? value : item)
    }));
  };

  const finishClassName = (grade, index) => {
    setDraft(prev => {
      const current = [...(prev[grade] || [])];
      const normalized = normalizeSchoolClassName(current[index], grade);
      if (!normalized) {
        current.splice(index, 1);
        return { ...prev, [grade]: current };
      }
      current[index] = normalized;
      return { ...prev, [grade]: current };
    });
  };

  const deleteClass = (grade, index) => {
    setDraft(prev => ({
      ...prev,
      [grade]: (prev[grade] || []).filter((_, itemIndex) => itemIndex !== index)
    }));
  };

  const copyPreviousYear = () => {
    if (!previousYear) return;
    setDraft(normalizeSchoolClassesByGrade(classesByYear?.[previousYear]));
    showNotification?.(`Đã sao chép danh sách lớp từ năm ${previousYear}. Hãy bấm Lưu để xác nhận.`);
  };

  const save = async () => {
    const cleaned = normalizeSchoolClassesByGrade(draft);
    const allNames = SCHOOL_GRADES.flatMap(grade => cleaned[grade]);
    const duplicateNames = allNames.filter((name, index) => allNames.indexOf(name) !== index);
    const wrongGrade = SCHOOL_GRADES.flatMap(grade => cleaned[grade].filter(name => !name.startsWith(grade)));
    if (duplicateNames.length) {
      showNotification?.(`Tên lớp bị trùng: ${[...new Set(duplicateNames)].join(', ')}.`, 'error');
      return;
    }
    if (wrongGrade.length) {
      showNotification?.(`Tên lớp chưa đúng khối: ${wrongGrade.join(', ')}.`, 'error');
      return;
    }
    setIsSaving(true);
    try {
      await onSaveSetting?.('schoolClassesByYear', {
        ...(classesByYear && typeof classesByYear === 'object' ? classesByYear : {}),
        [yearKey]: cleaned
      });
      setDraft(cleaned);
      showNotification?.(`Đã lưu ${allNames.length} lớp cho năm học ${yearKey}.`);
    } catch {
      showNotification?.('Chưa lưu được danh sách lớp.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-blue-700">
              <Layers className="h-4 w-4" /> Cài đặt theo năm học
            </div>
            <div className="mt-0.5 text-lg font-semibold text-slate-950">Lớp học năm {yearKey || 'chưa chọn'}</div>
            <div className="mt-1 text-xs text-slate-500">Đang có {totalClasses} lớp từ khối 1 đến khối 9.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {previousYear && (
              <button
                type="button"
                onClick={copyPreviousYear}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" /> Sao chép năm {previousYear}
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!isDirty || isSaving || !yearKey}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${isDirty && !isSaving && yearKey ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}
            >
              <Save className="h-4 w-4" /> {isSaving ? 'Đang lưu...' : 'Lưu danh sách lớp'}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[90px_170px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500 md:grid">
          <div>Khối</div>
          <div>Số lớp</div>
          <div>Tên các lớp</div>
        </div>
        {SCHOOL_GRADES.map(grade => {
          const rows = draft[grade] || [];
          return (
            <div key={`school-grade-${grade}`} className="grid gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0 md:grid-cols-[90px_170px_minmax(0,1fr)] md:items-start">
              <div className="flex h-9 items-center font-semibold text-blue-900">Khối {grade}</div>
              <div className="flex h-9 items-center gap-1">
                <button type="button" onClick={() => setClassCount(grade, rows.length - 1)} disabled={!rows.length} title="Giảm một lớp" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min="0"
                  max="52"
                  value={rows.length}
                  onChange={event => setClassCount(grade, event.target.value)}
                  aria-label={`Số lớp khối ${grade}`}
                  className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-center text-sm font-semibold outline-none focus:border-blue-400"
                />
                <button type="button" onClick={() => setClassCount(grade, rows.length + 1)} title="Thêm một lớp" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-h-9 flex-wrap gap-1.5">
                {rows.length ? rows.map((className, index) => (
                  <div key={`school-class-${grade}-${index}`} className="flex h-8 items-center overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-blue-400">
                    <input
                      value={className}
                      onChange={event => updateClassName(grade, index, event.target.value)}
                      onBlur={() => finishClassName(grade, index)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                      aria-label={`Tên lớp thứ ${index + 1} khối ${grade}`}
                      className="h-full w-20 border-0 px-2 text-sm font-semibold text-slate-800 outline-none"
                    />
                    <button type="button" onClick={() => deleteClass(grade, index)} title={`Xóa lớp ${className}`} className="inline-flex h-full w-8 items-center justify-center border-l border-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )) : (
                  <div className="flex h-8 items-center text-xs text-slate-400">Chưa mở lớp trong năm này.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
