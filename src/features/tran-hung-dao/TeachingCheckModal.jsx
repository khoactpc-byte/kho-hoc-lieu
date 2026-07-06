import { X } from 'lucide-react';
import { useState, useMemo } from 'react';

const SUBJECT_CHECK_TEMPLATE = [
  { id: 'toan', group: 'regular', name: 'Toán', matchSubject: ['toan'], excludeSubject: ['ts', 'tuyen sinh'], periodsPerYear: 140, unitType: 'all_classes' },
  { id: 'van', group: 'regular', name: 'Ngữ văn', matchSubject: ['van', 'ngu van'], excludeSubject: ['ts', 'tuyen sinh'], periodsPerYear: 140, unitType: 'all_classes' },
  { id: 'anh', group: 'regular', name: 'Tiếng Anh', matchSubject: ['anh', 'tieng anh'], excludeSubject: ['ts', 'tuyen sinh'], periodsPerYear: 105, unitType: 'all_classes' },
  { id: 'khtn', group: 'regular', name: 'KHTN', matchSubject: ['khtn', 'khoa hoc tu nhien'], excludeSubject: ['phong', 'khtn 1', 'khtn 2', 'khtn 3'], periodsPerYear: 140, unitType: 'all_classes' },
  { id: 'lsdl', group: 'regular', name: 'LS&ĐL', matchSubject: ['lsdl', 'ls dl', 'lich su'], periodsPerYear: 105, unitType: 'all_classes' },
  { id: 'gdcd', group: 'regular', name: 'GDCD', matchSubject: ['gdcd'], periodsPerYear: 35, unitType: 'all_classes' },
  { id: 'cn67', group: 'regular', name: 'Công nghệ 6,7', matchSubject: ['c nghe', 'cong nghe'], matchGrades: ['6', '7'], periodsPerYear: 35, unitType: 'grade_6_7_classes' },
  { id: 'cn89', group: 'regular', name: 'Công nghệ 8,9', matchSubject: ['c nghe', 'cong nghe'], matchGrades: ['8', '9'], periodsPerYear: 52, unitType: 'grade_8_9_classes' },
  { id: 'tin', group: 'regular', name: 'Tin học', matchSubject: ['tin hoc'], excludeSubject: ['phong', 'tin hoc 1', 'tin hoc 2'], periodsPerYear: 35, unitType: 'all_classes' },
  { id: 'amnhac', group: 'regular', name: 'Âm nhạc', matchSubject: ['am nhac'], excludeSubject: ['phong'], exactMatch: ['an'], periodsPerYear: 35, unitType: 'all_classes' },
  { id: 'mithuat', group: 'regular', name: 'Mĩ thuật', matchSubject: ['mi thuat', 'my thuat'], exactMatch: ['mt'], periodsPerYear: 35, unitType: 'all_classes' },
  { id: 'gdtc', group: 'regular', name: 'GDTC', matchSubject: ['gdtc', 'giao duc the chat'], periodsPerYear: 70, unitType: 'all_classes' },
  { id: 'gddp', group: 'regular', name: 'GDĐP', matchSubject: ['gddp', 'giao duc dia phuong'], periodsPerYear: 35, unitType: 'all_classes' },
  { id: 'gvcn', group: 'regular', name: 'Chủ nhiệm', matchSubject: ['chu nhiem', 'gvcn'], periodsPerYear: 140, unitType: 'all_classes' },
  { id: 'hdtn_dc', group: 'regular', name: 'HĐTN,HN (DC)', matchSubject: ['hdtn hn dc', 'hn dc', 'hdtn dc'], periodsPerYear: 35, unitType: 'all_classes' },
  { id: 'hdtn_shl', group: 'regular', name: 'HĐTN,HN (SHL)', matchSubject: ['hdtn hn shl', 'hn shl', 'hdtn shl'], excludeSubject: ['cd'], periodsPerYear: 35, unitType: 'all_classes', emptyPrescribed: true, isHdtn: true },
  { id: 'hdtn_cd', group: 'regular', name: 'HĐTN,HN (SHCĐ)', matchSubject: ['hdtn hn cd', 'hn cd', 'hdtn hn shcd', 'hn shcd', 'hdtn cd', 'hdtn shcd'], excludeSubject: ['shl'], periodsPerYear: 35, unitType: 'all_classes', emptyPrescribed: true, isHdtn: true },
  { id: 'hdtn_shl_cd', group: 'regular', name: 'HĐTN,HN (SHL+SHCĐ)', matchSubject: ['hdtn hn shl cd', 'hn shl cd', 'hdtn hn shl shcd', 'hdtn shl cd', 'hdtn shl shcd'], periodsPerYear: 70, unitType: 'all_classes', isHdtn: true },
  { id: 'ttcm', group: 'concurrent', name: 'TTCM', matchSubject: ['to truong chuyen mon', 'ttcm'], periodsPerYear: 105, defaultUnit: 7 },
  { id: 'tkhd', group: 'concurrent', name: 'TKHĐ', matchSubject: ['thu ky hoi dong', 'tkhd'], periodsPerYear: 70, defaultUnit: 1 },
  { id: 'ctcd', group: 'concurrent', name: 'CTCĐ', matchSubject: ['chu tich cong doan', 'ctcd'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'pctcd', group: 'concurrent', name: 'PCT CĐ', matchSubject: ['pho chu tich cong doan', 'pct cd', 'pctcd'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'uvbchcd', group: 'concurrent', name: 'UV BCH CĐ', matchSubject: ['uy vien ban chap hanh', 'uv bch', 'uv bch cd'], periodsPerYear: 35, defaultUnit: 3 },
  { id: 'tbttnd', group: 'concurrent', name: 'TB TTND', matchSubject: ['truong ban ttnd', 'tb ttnd'], periodsPerYear: 70, defaultUnit: 1 },
  { id: 'ttcd', group: 'concurrent', name: 'TTCĐ', matchSubject: ['to truong cong doan', 'ttcd'], periodsPerYear: 35, defaultUnit: 7 },
  { id: 'khtn1', group: 'concurrent', name: 'Phòng KHTN 1', matchSubject: ['khtn 1', 'phong khtn 1'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'khtn2', group: 'concurrent', name: 'Phòng KHTN 2', matchSubject: ['khtn 2', 'phong khtn 2'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'khtn3', group: 'concurrent', name: 'Phòng KHTN 3', matchSubject: ['khtn 3', 'phong khtn 3'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'thietbi', group: 'concurrent', name: 'Thiết bị', matchSubject: ['thiet bi', 'phu trach thiet bi'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'amnhac_phong', group: 'concurrent', name: 'Phụ trách phòng Âm nhạc', matchSubject: ['phu trach phong am nhac', 'phong am nhac', 'phu trach am nhac'], periodsPerYear: 105, defaultUnit: 0 },
  { id: 'tinhoc1', group: 'concurrent', name: 'Phụ trách CNTT - Phòng Tin học 1', matchSubject: ['tin hoc 1', 'phong tin hoc 1'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'tinhoc2', group: 'concurrent', name: 'Phụ trách CNTT - Phòng Tin học 2', matchSubject: ['tin hoc 2', 'phong tin hoc 2'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'tvtlhd', group: 'concurrent', name: 'TV TLHĐ', matchSubject: ['tu van tam ly', 'tv tlhd'], periodsPerYear: 280, defaultUnit: 1 },
  { id: 'pcgd', group: 'concurrent', name: 'Phụ trách PCGD', matchSubject: ['phu trach pcgd'], periodsPerYear: 105, defaultUnit: 1 },
  { id: 'hosan', group: 'deduction', name: 'Hộ sản', matchSubject: ['ho san', 'hau san'], periodsPerYear: 0 },
  { id: 'connho', group: 'deduction', name: 'Con nhỏ dưới 12 tháng', matchSubject: ['con nho'], periodsPerYear: 0 },
  { id: 'tapsu', group: 'deduction', name: 'Tập sự', matchSubject: ['tap su'], periodsPerYear: 0 },
  { id: 'nghikhongluong', group: 'deduction', name: 'Nghỉ không hưởng lương', matchSubject: ['khong huong luong'], periodsPerYear: 0 },
  { id: 'daypcgd', group: 'deduction', name: 'Dạy PCGD', matchSubject: ['day pcgd'], periodsPerYear: 0 },
  { id: 'toants10', group: 'deduction', name: 'Toán (TS10)', matchSubject: ['toan ts10', 'toan ts 10'], periodsPerYear: 34, defaultUnit: 11 },
  { id: 'vants10', group: 'deduction', name: 'Văn (TS10)', matchSubject: ['van ts10', 'van ts 10'], periodsPerYear: 34, defaultUnit: 11 },
  { id: 'anhts10', group: 'deduction', name: 'Anh (TS10)', matchSubject: ['anh ts10', 'anh ts 10'], periodsPerYear: 34, defaultUnit: 11 }
];

export default function TeachingCheckModal({
  classNames = [],
  filteredRows = [],
  normalizePeriods,
  onClose,
  onFilterChange,
  onWeeksChange,
  resultFilter = 'all',
  rows = [],
  selectedSchoolYear = '',
  summary = { ok: 0, missing: 0, excess: 0 },
  weeks = '',
  allAssignments = [],
  activeClasses = [],
  getTotalPeriods = () => 0,
  normalizeTeacherNameKey = (val) => String(val).toLowerCase(),
  thdSubjectsDraft = [],
  onAddMissingSubject = () => {}
}) {
  const [activeTab, setActiveTab] = useState('class'); // 'class' | 'subject' | 'missing'
  const [customValues, setCustomValues] = useState({});
  const [missingEdits, setMissingEdits] = useState({});

  const subjectCheckData = useMemo(() => {
    if (activeTab !== 'subject') return null;

    const totalClasses = activeClasses.length;
    const grade67Classes = activeClasses.filter(c => c.match(/^[67]/)).length;
    const grade89Classes = activeClasses.filter(c => c.match(/^[89]/)).length;

    const getUnitForRegular = (unitType) => {
      if (unitType === 'grade_6_7_classes') return grade67Classes;
      if (unitType === 'grade_8_9_classes') return grade89Classes;
      return totalClasses;
    };

    const aggregatedActuals = {};
    allAssignments.forEach(row => {
      const assignmentKey = normalizeTeacherNameKey(row.assignment || row.subject || '');
      const classNameMatch = row.className ? row.className.match(/^\d+/) : null;
      const rowGrade = classNameMatch ? classNameMatch[0] : null;

      const totalPeriods = Number(getTotalPeriods(row)) || 0;
      if (totalPeriods === 0) return;

      const matchedTemplate = SUBJECT_CHECK_TEMPLATE.find(t => {
        const isMatch = (t.matchSubject && t.matchSubject.some(m => assignmentKey.includes(m))) || 
                        (t.exactMatch && t.exactMatch.some(m => assignmentKey === m));
        if (!isMatch) return false;
        if (t.excludeSubject && t.excludeSubject.some(m => assignmentKey.includes(m))) return false;
        if (t.matchGrades && rowGrade && !t.matchGrades.includes(rowGrade)) return false;
        return true;
      });

      if (matchedTemplate) {
        aggregatedActuals[matchedTemplate.id] = (aggregatedActuals[matchedTemplate.id] || 0) + totalPeriods;
      }
    });

    let totalRegularPrescribed = 0;
    let totalRegularActual = 0;
    let totalConcurrentPrescribed = 0;
    let totalConcurrentActual = 0;
    let totalDeductionActual = 0;

    const formattedRows = SUBJECT_CHECK_TEMPLATE.map(t => {
      const customUnit = customValues[`${t.id}_unit`];
      const customPeriods = customValues[`${t.id}_periods`];

      let unit = t.group === 'regular' ? getUnitForRegular(t.unitType) : (customUnit !== undefined ? Number(customUnit) : t.defaultUnit);
      let periodsPerYear = customPeriods !== undefined ? Number(customPeriods) : t.periodsPerYear;

      let prescribed = (periodsPerYear || 0) * (unit || 0);
      if (t.emptyPrescribed) prescribed = 0;
      else if (t.totalPrescribed !== undefined) prescribed = t.totalPrescribed;

      const actual = aggregatedActuals[t.id] || 0;
      const diff = t.group === 'regular' ? (prescribed - actual) : (actual - prescribed);

      if (t.group === 'regular') {
        totalRegularPrescribed += prescribed;
        totalRegularActual += actual;
      } else if (t.group === 'concurrent') {
        totalConcurrentPrescribed += prescribed;
        totalConcurrentActual += actual;
      } else if (t.group === 'deduction') {
        totalDeductionActual += actual;
      }

      return {
        ...t,
        unit,
        periodsPerYear,
        prescribed,
        actual,
        diff
      };
    });

    return {
      rows: formattedRows,
      totalRegularPrescribed,
      totalRegularActual,
      totalConcurrentPrescribed,
      totalConcurrentActual,
      totalDeductionActual
    };
  }, [activeTab, allAssignments, activeClasses, customValues, getTotalPeriods, normalizeTeacherNameKey]);

  const missingSubjects = useMemo(() => {
    if (activeTab !== 'missing') return [];

    const existingKeys = new Set();
    thdSubjectsDraft.forEach(subject => {
      if (!subject) return;
      [subject.name, subject.shortName].forEach(val => {
        if (!val) return;
        const key = normalizeTeacherNameKey(val);
        if (key) existingKeys.add(key);
      });
    });

    const missingMap = new Map();
    allAssignments.forEach(row => {
      const raw = String(row.assignment || row.subject || '').trim();
      if (!raw) return;
      const key = normalizeTeacherNameKey(raw);
      if (!key) return;

      if (existingKeys.has(key)) return;

      const matchedTemplate = SUBJECT_CHECK_TEMPLATE.find(t => {
        const isMatch = (t.matchSubject && t.matchSubject.some(m => key.includes(m))) || 
                        (t.exactMatch && t.exactMatch.some(m => key === m));
        if (!isMatch) return false;
        if (t.excludeSubject && t.excludeSubject.some(m => key.includes(m))) return false;
        return true;
      });
      if (matchedTemplate) return;

      if (!missingMap.has(key)) {
        missingMap.set(key, { rawName: raw, count: 1 });
      } else {
        missingMap.get(key).count++;
      }
    });

    return Array.from(missingMap.values());
  }, [activeTab, allAssignments, thdSubjectsDraft, normalizeTeacherNameKey]);

  const handleUpdateMissingEdit = (rawName, field, value) => {
    setMissingEdits(prev => ({
      ...prev,
      [rawName]: {
        ...(prev[rawName] || { name: rawName, shortName: rawName, periodsSemester1: '', periodsSemester2: '', grades: ['6', '7', '8', '9'] }),
        [field]: value
      }
    }));
  };

  const handleToggleMissingGrade = (rawName, grade) => {
    setMissingEdits(prev => {
      const current = prev[rawName] || { name: rawName, shortName: rawName, periodsSemester1: '', periodsSemester2: '', grades: ['6', '7', '8', '9'] };
      const newGrades = current.grades.includes(grade)
        ? current.grades.filter(g => g !== grade)
        : [...current.grades, grade].sort();
      return { ...prev, [rawName]: { ...current, grades: newGrades } };
    });
  };

  const handleAddMissingSubjectSubmit = (rawName) => {
    const edit = missingEdits[rawName] || { name: rawName, shortName: rawName, periodsSemester1: '', periodsSemester2: '', grades: ['6', '7', '8', '9'] };
    onAddMissingSubject({
      id: `thd-subj-${Date.now()}`,
      name: edit.name,
      shortName: edit.shortName,
      periodsSemester1: edit.periodsSemester1,
      periodsSemester2: edit.periodsSemester2,
      grades: edit.grades
    });
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-3xl border border-amber-100 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <div className="text-xs font-black uppercase text-amber-700">Kiểm tra phân công</div>
            <div className="mt-1 text-xl font-black text-slate-900">{selectedSchoolYear}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black">
            <button
              type="button"
              onClick={() => setActiveTab('class')}
              className={`h-9 rounded-xl px-4 transition-colors ${activeTab === 'class' ? 'bg-amber-600 text-white shadow' : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
            >
              Theo lớp
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('subject')}
              className={`h-9 rounded-xl px-4 transition-colors ${activeTab === 'subject' ? 'bg-amber-600 text-white shadow' : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
            >
              Theo môn
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('missing')}
              className={`h-9 rounded-xl px-4 transition-colors ${activeTab === 'missing' ? 'bg-amber-600 text-white shadow' : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
            >
              Môn chưa có
            </button>
            <div className="mx-2 h-6 w-px bg-slate-200" />
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {activeTab === 'class' && (
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs font-black">
            <label className="flex h-8 items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 text-amber-800">
              <span>Tuần</span>
              <input
                value={weeks}
                onChange={(event) => onWeeksChange(event.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
                onBlur={() => {
                  if (!normalizePeriods(weeks)) onWeeksChange('35');
                }}
                className="h-6 w-12 rounded border border-amber-200 bg-white px-1 text-center text-sm font-black text-slate-800 outline-none focus:border-amber-400"
              />
            </label>
            <button type="button" onClick={() => onFilterChange('all')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
              Tất cả: {rows.length}
            </button>
            <button type="button" onClick={() => onFilterChange('ok')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'ok' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
              Đủ: {summary.ok}
            </button>
            <button type="button" onClick={() => onFilterChange('missing')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'missing' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>
              Thiếu: {summary.missing}
            </button>
            <button type="button" onClick={() => onFilterChange('excess')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'excess' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
              Dư: {summary.excess}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'class' ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {classNames.map(className => {
                const classRows = filteredRows.filter(row => row.className === className);
                return (
                  <div key={`teaching-check-${className}`} className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="bg-slate-100 px-3 py-2 text-sm font-black text-slate-800">{className}</div>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-[11px] font-black uppercase text-slate-500">
                          <th className="border border-slate-200 px-2 py-2">Môn</th>
                          <th className="w-20 border border-slate-200 px-2 py-2 text-center">Cần</th>
                          <th className="w-20 border border-slate-200 px-2 py-2 text-center">Có</th>
                          <th className="w-24 border border-slate-200 px-2 py-2 text-center">Kết quả</th>
                          <th className="border border-slate-200 px-2 py-2">GV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classRows.map(row => {
                          const statusClass = row.diff === 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : (row.diff < 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700');
                          const statusText = row.diff === 0 ? 'Đủ' : (row.diff < 0 ? `Thiếu ${Math.abs(row.diff)}` : `Dư ${row.diff}`);
                          return (
                            <tr key={`${row.className}-${row.subject}`} className="bg-white">
                              <td className="border border-slate-200 px-2 py-1.5 font-semibold text-slate-800">{row.subject}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{row.expected}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{row.actual || ''}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-center">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-black ${statusClass}`}>{statusText}</span>
                              </td>
                              <td className="border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600">{row.teachers || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {classNames.length === 0 && (
                <div className="xl:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                  Không có lớp/môn phù hợp với bộ lọc này.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-amber-100 text-left text-[11px] font-black uppercase text-amber-900">
                    <th className="w-12 border border-amber-200 px-2 py-2 text-center">Stt</th>
                    <th className="border border-amber-200 px-2 py-2">Môn học / Nhiệm vụ</th>
                    <th className="w-24 border border-amber-200 px-2 py-2 text-center">Số tiết/ năm</th>
                    <th className="w-24 border border-amber-200 px-2 py-2 text-center">Đơn vị tính</th>
                    <th className="w-28 border border-amber-200 px-2 py-2 text-center text-emerald-800 bg-emerald-100/50">Số tiết quy định</th>
                    <th className="w-28 border border-amber-200 px-2 py-2 text-center text-sky-800 bg-sky-100/50">Số tiết phân công</th>
                    <th className="w-20 border border-amber-200 px-2 py-2 text-center">Đối chiếu</th>
                    <th className="w-32 border border-amber-200 px-2 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectCheckData?.rows.map((row, index) => {
                    const isConcurrent = row.group === 'concurrent';
                    const isDeduction = row.group === 'deduction';
                    const isEditable = isConcurrent || isDeduction;

                    let sttText = '';
                    if (row.group === 'regular') {
                      sttText = index + 1;
                    } else if (isConcurrent) {
                      const concurrentIndex = subjectCheckData.rows.filter(r => r.group === 'regular').length;
                      sttText = index - concurrentIndex + 1;
                    } else {
                      const dedIndex = subjectCheckData.rows.filter(r => r.group !== 'deduction').length;
                      sttText = index - dedIndex + 1;
                    }

                    let diffText = '-';
                    if (row.group === 'regular') {
                      if (row.emptyPrescribed) diffText = '';
                      else diffText = row.diff !== 0 ? Math.abs(row.diff).toLocaleString('vi-VN') : '-';
                    } else if (isConcurrent) {
                      diffText = (row.prescribed - row.actual) !== 0 ? Math.abs(row.prescribed - row.actual).toLocaleString('vi-VN') : '-';
                    } else {
                      diffText = '-'; // usually no diff for deductions
                    }

                    return (
                      <tr key={`subject-check-${row.id}`} className="hover:bg-amber-50/30 transition-colors">
                        <td className="border border-amber-100 px-2 py-1.5 text-center font-medium text-slate-500">{sttText}</td>
                        <td className="border border-amber-100 px-2 py-1.5 font-semibold text-slate-800">{row.name}</td>
                        <td className="border border-amber-100 px-2 py-1.5 text-center font-medium text-slate-700">
                          {isEditable ? (
                            <input
                              type="number"
                              value={customValues[`${row.id}_periods`] ?? (row.periodsPerYear || '')}
                              onChange={e => setCustomValues({ ...customValues, [`${row.id}_periods`]: e.target.value })}
                              className="w-16 rounded border border-slate-200 bg-white px-1 text-center outline-none focus:border-amber-400"
                            />
                          ) : (
                            row.periodsPerYear || ''
                          )}
                        </td>
                        <td className="border border-amber-100 px-2 py-1.5 text-center font-medium text-slate-700">
                          {isEditable && row.defaultUnit !== undefined ? (
                            <input
                              type="number"
                              value={customValues[`${row.id}_unit`] ?? (row.defaultUnit || '')}
                              onChange={e => setCustomValues({ ...customValues, [`${row.id}_unit`]: e.target.value })}
                              className="w-16 rounded border border-slate-200 bg-white px-1 text-center outline-none focus:border-amber-400"
                            />
                          ) : (
                            row.unit || ''
                          )}
                        </td>
                        {row.id === 'hdtn_shl' && (
                          <>
                            <td rowSpan={3} className="border border-amber-100 px-2 py-1.5 text-center font-semibold text-emerald-700">
                              {(() => {
                                const combinedPrescribed = subjectCheckData.rows.find(r => r.id === 'hdtn_shl_cd')?.prescribed || 0;
                                return combinedPrescribed.toLocaleString('vi-VN');
                              })()}
                            </td>
                            <td className="border border-amber-100 px-2 py-1.5 text-center font-semibold text-sky-700">
                              {row.actual ? row.actual.toLocaleString('vi-VN') : ''}
                            </td>
                            <td rowSpan={3} className="border border-amber-100 px-2 py-1.5 text-center font-semibold text-amber-700">
                              {(() => {
                                const combinedPrescribed = subjectCheckData.rows.find(r => r.id === 'hdtn_shl_cd')?.prescribed || 0;
                                const hdtnTotalActual = subjectCheckData.rows.filter(r => r.isHdtn).reduce((sum, r) => sum + r.actual, 0);
                                const diff = combinedPrescribed - hdtnTotalActual;
                                return diff !== 0 ? Math.abs(diff).toLocaleString('vi-VN') : '-';
                              })()}
                            </td>
                            <td rowSpan={3} className="border border-amber-100 px-2 py-1.5 text-xs text-slate-500">
                              Gộp chung Số tiết quy định và Đối chiếu cho 3 mục HĐTN
                            </td>
                          </>
                        )}
                        {(row.id === 'hdtn_cd' || row.id === 'hdtn_shl_cd') && (
                          <td className="border border-amber-100 px-2 py-1.5 text-center font-semibold text-sky-700">
                            {row.actual ? row.actual.toLocaleString('vi-VN') : ''}
                          </td>
                        )}
                        {!row.isHdtn && (
                          <>
                            <td className="border border-amber-100 px-2 py-1.5 text-center font-semibold text-emerald-700">
                              {row.emptyPrescribed ? '' : (row.prescribed ? row.prescribed.toLocaleString('vi-VN') : '')}
                            </td>
                            <td className="border border-amber-100 px-2 py-1.5 text-center font-semibold text-sky-700">
                              {row.actual ? row.actual.toLocaleString('vi-VN') : ''}
                            </td>
                            <td className="border border-amber-100 px-2 py-1.5 text-center font-semibold text-amber-700">
                              {diffText}
                            </td>
                            <td className="border border-amber-100 px-2 py-1.5 text-xs text-slate-500">
                              {/* no note */}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {/* Summary Rows */}
                  <tr className="bg-amber-100 font-black text-amber-900">
                    <td colSpan={4} className="border border-amber-200 px-2 py-2 text-right uppercase">Tổng cộng (trực tiếp đứng lớp)</td>
                    <td className="border border-amber-200 px-2 py-2 text-center text-emerald-800">{subjectCheckData?.totalRegularPrescribed.toLocaleString('vi-VN')}</td>
                    <td className="border border-amber-200 px-2 py-2 text-center text-sky-800">{subjectCheckData?.totalRegularActual.toLocaleString('vi-VN')}</td>
                    <td className="border border-amber-200 px-2 py-2 text-center">-</td>
                    <td className="border border-amber-200 px-2 py-2"></td>
                  </tr>
                  <tr className="bg-amber-100 font-black text-amber-900">
                    <td colSpan={4} className="border border-amber-200 px-2 py-2 text-right uppercase">Tổng cộng (kiêm nhiệm)</td>
                    <td className="border border-amber-200 px-2 py-2 text-center text-emerald-800">{subjectCheckData?.totalConcurrentPrescribed.toLocaleString('vi-VN')}</td>
                    <td className="border border-amber-200 px-2 py-2 text-center text-sky-800">{subjectCheckData?.totalConcurrentActual.toLocaleString('vi-VN')}</td>
                    <td className="border border-amber-200 px-2 py-2 text-center">{Math.abs(subjectCheckData?.totalConcurrentPrescribed - subjectCheckData?.totalConcurrentActual).toLocaleString('vi-VN')}</td>
                    <td className="border border-amber-200 px-2 py-2"></td>
                  </tr>
                  <tr className="bg-amber-100 font-black text-amber-900">
                    <td colSpan={4} className="border border-amber-200 px-2 py-2 text-right uppercase">Tổng cộng (giảm trừ)</td>
                    <td className="border border-amber-200 px-2 py-2 text-center text-emerald-800"></td>
                    <td className="border border-amber-200 px-2 py-2 text-center text-sky-800">{subjectCheckData?.totalDeductionActual.toLocaleString('vi-VN')}</td>
                    <td className="border border-amber-200 px-2 py-2 text-center">-</td>
                    <td className="border border-amber-200 px-2 py-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
