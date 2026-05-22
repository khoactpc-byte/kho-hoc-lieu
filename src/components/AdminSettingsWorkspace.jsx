import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardPaste, Save, Settings, UserRound, UsersRound, X } from 'lucide-react';

const emptyTeacher = () => ({ name: '', subject: '', grades: [] });

const normalizeTeacher = (teacher = {}) => ({
  name: String(teacher.name || '').trim(),
  subject: String(teacher.subject || '').trim(),
  grades: Array.isArray(teacher.grades) ? teacher.grades.map(String) : []
});

const parseGrades = (value = '') => String(value || '')
  .split(/[,;.\s]+/)
  .map(item => item.replace(/[^\d]/g, ''))
  .filter(item => ['6', '7', '8', '9'].includes(item));

const NAN_SUBJECT_OPTIONS = [
  'Toán', 'Ngữ Văn', 'GDTC', 'Khoa học tự nhiên', 'Tiếng Anh',
  'Lịch sử & Địa Lý', 'Giáo dục công dân', 'Công nghệ',
  'Tin học', 'HĐTT', 'NT (AN)', 'NT (MT)'
];

const classSubjects = (subjects = []) => [...subjects, 'Chủ nhiệm'];

const compactSchoolYearLabel = (schoolYear = '') => String(schoolYear || '').replace(/\s*-\s*/g, '-').trim();
const LEGACY_ASSIGNMENT_YEAR_KEY = compactSchoolYearLabel('2025-2026');

const getSchoolYearStartYear = (schoolYear = '') => {
  const match = String(schoolYear || '').match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
};

const pad2 = (value) => String(value).padStart(2, '0');
const dateKeyFromDate = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseDateValue = (value = '') => {
  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  const viMatch = text.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (viMatch) return new Date(Number(viMatch[3]), Number(viMatch[2]) - 1, Number(viMatch[1]));
  return null;
};

const toDateInputValue = (value = '') => {
  const parsed = parseDateValue(value);
  return parsed ? dateKeyFromDate(parsed) : '';
};

const addDaysToDateKey = (dateKey, days) => {
  const date = parseDateValue(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + days);
  return dateKeyFromDate(date);
};

const nthWeekdayOfMonth = (year, month, weekday, nth) => {
  const date = new Date(year, month - 1, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (nth - 1) * 7);
  return dateKeyFromDate(date);
};

const lastWeekdayOfMonth = (year, month, weekday) => {
  const date = new Date(year, month, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return dateKeyFromDate(date);
};

const defaultTranscriptStartDate = (schoolYear = '') => {
  const startYear = getSchoolYearStartYear(schoolYear);
  return nthWeekdayOfMonth(startYear, 9, 2, 2);
};

const defaultTranscriptEndDate = (schoolYear = '') => {
  const startYear = getSchoolYearStartYear(schoolYear);
  return lastWeekdayOfMonth(startYear + 1, 5, 4);
};

const defaultTranscriptGrade9EndDate = (schoolYear = '') => addDaysToDateKey(defaultTranscriptEndDate(schoolYear), -5);

export default function AdminSettingsWorkspace({
  currentSchoolYear,
  schoolYears,
  principalName,
  inputYearLocks,
  transcriptStartDates,
  transcriptEndDates,
  transcriptGrade9EndDates,
  nanTeachers,
  classTeacherAssignments,
  subjects,
  grades,
  onClose,
  onSaveSetting,
  showNotification
}) {
  const [yearDraft, setYearDraft] = useState(currentSchoolYear || '');
  const [assignmentYearDraft, setAssignmentYearDraft] = useState(currentSchoolYear || '');
  const [principalDraft, setPrincipalDraft] = useState(principalName || '');
  const [inputLocksDraft, setInputLocksDraft] = useState({});
  const [transcriptStartDatesDraft, setTranscriptStartDatesDraft] = useState({});
  const [transcriptEndDatesDraft, setTranscriptEndDatesDraft] = useState({});
  const [transcriptGrade9EndDatesDraft, setTranscriptGrade9EndDatesDraft] = useState({});
  const [teachersDraft, setTeachersDraft] = useState([]);
  const [assignmentsDraft, setAssignmentsDraft] = useState({});
  const [pasteText, setPasteText] = useState('');
  const [activePanel, setActivePanel] = useState('general');

  useEffect(() => {
    setYearDraft(currentSchoolYear || '');
    setAssignmentYearDraft(currentSchoolYear || '');
  }, [currentSchoolYear]);

  useEffect(() => {
    setPrincipalDraft(principalName || '');
  }, [principalName]);

  useEffect(() => {
    setInputLocksDraft(inputYearLocks && typeof inputYearLocks === 'object' ? inputYearLocks : {});
  }, [inputYearLocks]);

  useEffect(() => {
    setTranscriptStartDatesDraft(transcriptStartDates && typeof transcriptStartDates === 'object' ? transcriptStartDates : {});
  }, [transcriptStartDates]);

  useEffect(() => {
    setTranscriptEndDatesDraft(transcriptEndDates && typeof transcriptEndDates === 'object' ? transcriptEndDates : {});
  }, [transcriptEndDates]);

  useEffect(() => {
    setTranscriptGrade9EndDatesDraft(transcriptGrade9EndDates && typeof transcriptGrade9EndDates === 'object' ? transcriptGrade9EndDates : {});
  }, [transcriptGrade9EndDates]);

  useEffect(() => {
    const rows = (Array.isArray(nanTeachers) ? nanTeachers : []).map(normalizeTeacher);
    setTeachersDraft(rows.length ? rows : [emptyTeacher()]);
  }, [nanTeachers]);

  useEffect(() => {
    setAssignmentsDraft(classTeacherAssignments || {});
  }, [classTeacherAssignments]);

  const teacherNames = useMemo(() => {
    return [...new Set(teachersDraft.map(item => item.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [teachersDraft]);

  const selectedSchoolYear = assignmentYearDraft || yearDraft || currentSchoolYear || '';
  const selectedSchoolYearKey = compactSchoolYearLabel(selectedSchoolYear);
  const effectiveSchoolYearKey = selectedSchoolYearKey || compactSchoolYearLabel(currentSchoolYear || '') || 'default';
  const systemSchoolYearKey = compactSchoolYearLabel(yearDraft || currentSchoolYear || '') || 'default';
  const isSystemYearLocked = Boolean(inputLocksDraft?.[systemSchoolYearKey]);

  const assignmentsBySelectedYear = useMemo(() => {
    if (assignmentsDraft?.byYear?.[effectiveSchoolYearKey]) return assignmentsDraft.byYear[effectiveSchoolYearKey];
    if (!assignmentsDraft?.byYear && effectiveSchoolYearKey === LEGACY_ASSIGNMENT_YEAR_KEY) return assignmentsDraft || {};
    return {};
  }, [assignmentsDraft, effectiveSchoolYearKey]);

  const assignmentValue = (grade, subject) => {
    return assignmentsBySelectedYear?.[grade]?.[subject] ?? '';
  };

  const updateTranscriptDateDraft = (type, schoolYear, value) => {
    const key = compactSchoolYearLabel(schoolYear);
    const setter = type === 'start'
      ? setTranscriptStartDatesDraft
      : (type === 'grade9End' ? setTranscriptGrade9EndDatesDraft : setTranscriptEndDatesDraft);
    setter(prev => ({
      ...(prev || {}),
      [key]: value
    }));
  };

  const updateTeacher = (index, patch) => {
    setTeachersDraft(prev => prev.map((item, rowIndex) => rowIndex === index ? normalizeTeacher({ ...item, ...patch }) : item));
  };

  const toggleTeacherGrade = (index, grade) => {
    setTeachersDraft(prev => prev.map((item, rowIndex) => {
      if (rowIndex !== index) return item;
      const current = new Set(item.grades || []);
      if (current.has(String(grade))) current.delete(String(grade));
      else current.add(String(grade));
      return { ...item, grades: [...current].sort() };
    }));
  };

  const parseTeacherPaste = () => {
    const rows = String(pasteText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!rows.length) {
      showNotification?.('Chưa có danh sách để dán.', 'error');
      return;
    }
    const parsed = rows.map((line) => {
      const parts = line.split(/\t| {2,}|,/).map(item => item.trim()).filter(Boolean);
      const maybeStt = /^\d+$/.test(parts[0] || '');
      const name = maybeStt ? (parts[1] || '') : (parts[0] || '');
      const subject = maybeStt ? (parts[2] || '') : (parts[1] || '');
      const gradeText = maybeStt ? (parts.slice(3).join(' ') || '') : (parts.slice(2).join(' ') || '');
      return normalizeTeacher({ name, subject, grades: parseGrades(gradeText) });
    }).filter(item => item.name || item.subject);
    setTeachersDraft(parsed.length ? parsed : [emptyTeacher()]);
    setPasteText('');
    setActivePanel('teachers');
    showNotification?.(`Đã dán ${parsed.length} dòng giáo viên.`);
  };

  const updateAssignment = (grade, subject, value) => {
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const byYear = { ...(prevObj.byYear || {}) };
      const legacyYearMap = (!prevObj.byYear && effectiveSchoolYearKey === LEGACY_ASSIGNMENT_YEAR_KEY) ? prevObj : {};
      const yearMap = { ...(byYear[effectiveSchoolYearKey] || legacyYearMap) };
      yearMap[grade] = {
        ...(yearMap?.[grade] || {}),
        [subject]: value
      };
      byYear[effectiveSchoolYearKey] = yearMap;
      return {
        ...prevObj,
        byYear
      };
    });
  };

  const clearClassTeacherAssignmentsByYear = () => {
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      return {
        ...prevObj,
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: {}
        }
      };
    });
    showNotification?.(`Đã xóa phân công giáo viên từng lớp năm ${selectedSchoolYear}.`);
  };

  const clearClassTeacherAssignmentsByGrade = (grade) => {
    const gradeKey = String(grade || '').trim();
    if (!gradeKey) return;
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const currentYearMap = {
        ...((prevObj.byYear || {})[effectiveSchoolYearKey] || {})
      };
      currentYearMap[gradeKey] = {};
      return {
        ...prevObj,
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: currentYearMap
        }
      };
    });
    showNotification?.(`Đã xóa phân công khối ${gradeKey} của năm ${selectedSchoolYear}.`);
  };

  const saveAll = async () => {
    const cleanTeachers = teachersDraft.map(normalizeTeacher).filter(item => item.name || item.subject);
    const assignmentsObj = (assignmentsDraft && typeof assignmentsDraft === 'object') ? { ...assignmentsDraft } : {};
    const byYear = { ...(assignmentsObj.byYear || {}) };
    if (!byYear[effectiveSchoolYearKey] && !assignmentsObj.byYear) {
      byYear[effectiveSchoolYearKey] = { ...assignmentsObj };
    } else if (!byYear[effectiveSchoolYearKey]) {
      byYear[effectiveSchoolYearKey] = {};
    }
    const nextAssignments = {
      ...assignmentsObj,
      byYear
    };
    await onSaveSetting('schoolYear', yearDraft);
    await onSaveSetting('principalName', principalDraft.trim());
    await onSaveSetting('inputYearLocks', inputLocksDraft);
    await onSaveSetting('transcriptStartDates', transcriptStartDatesDraft);
    await onSaveSetting('transcriptEndDates', transcriptEndDatesDraft);
    await onSaveSetting('transcriptGrade9EndDates', transcriptGrade9EndDatesDraft);
    await onSaveSetting('nanTeachers', cleanTeachers);
    await onSaveSetting('classTeacherAssignments', nextAssignments);
    showNotification?.('Đã lưu cài đặt.');
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-3">
      <div className="w-full max-w-none mx-auto space-y-3">
        <div className="sticky top-0 z-10 rounded-3xl border border-blue-100 bg-white/95 px-4 sm:px-6 py-4 shadow-lg backdrop-blur flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black text-slate-900 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-600" /> Cài đặt
            </h3>
            <div className="text-[10px] sm:text-xs font-bold text-slate-500 truncate">Năm học, hiệu trưởng và phân công giáo viên theo lớp</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={saveAll} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow hover:bg-blue-700 flex items-center gap-2">
              <Save className="w-4 h-4" /> Lưu
            </button>
            <button type="button" onClick={onClose} title="Đóng" className="shrink-0 w-11 h-11 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center hover:bg-rose-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <datalist id="nan-teacher-names">
          {teacherNames.map(name => <option key={name} value={name} />)}
        </datalist>
        <datalist id="nan-subjects">
          {NAN_SUBJECT_OPTIONS.map(subject => <option key={subject} value={subject} />)}
        </datalist>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm h-fit">
            {[
              ['general', 'Thiết lập chung', Settings],
              ['teachers', 'Giáo viên NAN', UsersRound],
              ['classes', 'Giáo viên từng lớp', UserRound]
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActivePanel(id)}
                className={`w-full rounded-2xl px-4 py-3 text-left font-black text-sm flex items-center gap-2 transition-colors ${activePanel === id ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {activePanel === 'general' && (
              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-xs font-black uppercase text-blue-900 mb-2">Năm học hệ thống</div>
                    <select value={yearDraft} onChange={(event) => setYearDraft(event.target.value)} className="w-full bg-white border border-blue-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 font-black text-sm shadow-sm">
                      {schoolYears.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-xs font-black uppercase text-blue-900 mb-2">Họ tên hiệu trưởng</div>
                    <input value={principalDraft} onChange={(event) => setPrincipalDraft(event.target.value)} placeholder="Nhập họ tên hiệu trưởng..." className="w-full bg-white border border-blue-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 font-black text-sm shadow-sm" />
                  </label>
                  <label className={`md:col-span-2 flex items-start gap-3 rounded-2xl border p-4 cursor-pointer ${isSystemYearLocked ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <input
                      type="checkbox"
                      checked={isSystemYearLocked}
                      onChange={(event) => setInputLocksDraft(prev => ({
                        ...(prev || {}),
                        [systemSchoolYearKey]: event.target.checked
                      }))}
                      className="mt-1 w-5 h-5 accent-rose-600"
                    />
                    <span>
                      <span className={`block text-sm font-black uppercase ${isSystemYearLocked ? 'text-rose-800' : 'text-emerald-800'}`}>
                        Khóa nhập liệu năm {yearDraft || currentSchoolYear}
                      </span>
                      <span className={`block text-xs font-bold mt-1 ${isSystemYearLocked ? 'text-rose-700' : 'text-emerald-700'}`}>
                        Khi tích khóa, học sinh vẫn vào xem bài và gửi chỉnh sửa hồ sơ; hệ thống chỉ khóa nộp bài/làm bài kiểm tra, ghi điểm và phát đề cho năm này. Bỏ tích rồi bấm Lưu để mở lại.
                      </span>
                    </span>
                  </label>
                  <div className="md:col-span-2 rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                    <div className="mb-3 flex items-center gap-2 font-black uppercase text-amber-900">
                      <CalendarDays className="w-5 h-5" /> Ngày ký học bạ theo năm học
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-amber-100 bg-white">
                      <table className="w-full min-w-[920px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-amber-50 text-left text-[11px] font-black uppercase text-amber-900">
                            <th className="w-36 border-b border-amber-100 px-3 py-2">Năm học</th>
                            <th className="border-b border-amber-100 px-3 py-2">Ngày ký đầu năm, trang 3</th>
                            <th className="border-b border-amber-100 px-3 py-2">Ngày ký cuối năm</th>
                            <th className="border-b border-amber-100 px-3 py-2">Ngày ký lớp 9</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolYears.map((year) => {
                            const yearKey = compactSchoolYearLabel(year);
                            return (
                              <tr key={`transcript-date-${yearKey}`} className="border-b border-amber-50 last:border-b-0">
                                <td className="px-3 py-2 font-black text-slate-700">{year}</td>
                                <td className="px-3 py-2">
                                  <input
                                    type="date"
                                    value={toDateInputValue(transcriptStartDatesDraft?.[yearKey]) || defaultTranscriptStartDate(year)}
                                    onChange={(event) => updateTranscriptDateDraft('start', year, event.target.value)}
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="date"
                                    value={toDateInputValue(transcriptEndDatesDraft?.[yearKey]) || defaultTranscriptEndDate(year)}
                                    onChange={(event) => updateTranscriptDateDraft('end', year, event.target.value)}
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="date"
                                    value={toDateInputValue(transcriptGrade9EndDatesDraft?.[yearKey]) || defaultTranscriptGrade9EndDate(year)}
                                    onChange={(event) => updateTranscriptDateDraft('grade9End', year, event.target.value)}
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 text-xs font-bold text-amber-800">
                      Mặc định: đầu năm là thứ 3 tuần thứ 2 tháng 9; cuối năm là thứ 5 tuần cuối tháng 5 năm sau; lớp 9 sớm hơn 5 ngày.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePanel === 'teachers' && (
              <div className="space-y-3">
                <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 font-black text-emerald-900 uppercase mb-3">
                    <ClipboardPaste className="w-5 h-5" /> Dán danh sách giáo viên NAN
                  </div>
                  <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="Dán từ Excel: STT | Tên giáo viên | Môn | Dạy lớp. Nếu một giáo viên dạy nhiều môn, ghi cách nhau bằng dấu phẩy hoặc chấm phẩy." className="w-full min-h-[120px] rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 text-sm font-bold outline-none focus:border-emerald-400" />
                  <button type="button" onClick={parseTeacherPaste} className="mt-3 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow hover:bg-emerald-700">Đưa vào bảng</button>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
                  <table className="w-full min-w-[760px] border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left text-xs font-black uppercase text-slate-500">
                        <th className="w-14 px-2">STT</th>
                        <th className="px-2">Tên giáo viên</th>
                        <th className="px-2">Môn (có thể nhiều môn)</th>
                        <th className="px-2">Dạy lớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachersDraft.map((teacher, index) => (
                        <tr key={`teacher-${index}`} className="bg-slate-50">
                          <td className="rounded-l-xl px-2 py-2 font-black text-slate-500">{index + 1}</td>
                          <td className="px-2 py-2"><input value={teacher.name} onChange={(event) => updateTeacher(index, { name: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white p-2 font-bold outline-none focus:border-blue-400" /></td>
                          <td className="px-2 py-2"><input value={teacher.subject} onChange={(event) => updateTeacher(index, { subject: event.target.value })} list="nan-subjects" placeholder="VD: Toán, Tin học" className="w-full rounded-xl border border-slate-200 bg-white p-2 font-bold outline-none focus:border-blue-400" /></td>
                          <td className="rounded-r-xl px-2 py-2">
                            <div className="flex gap-2">
                              {grades.map(grade => (
                                <button key={grade} type="button" onClick={() => toggleTeacherGrade(index, grade)} className={`w-10 h-9 rounded-xl text-xs font-black ${teacher.grades?.includes(String(grade)) ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>{grade}</button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" onClick={() => setTeachersDraft(prev => [...prev, emptyTeacher()])} className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50">Thêm dòng</button>
                </div>
              </div>
            )}

            {activePanel === 'classes' && (
              <div className="space-y-3">
                <div className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <div className="text-xs font-black uppercase text-violet-900 mb-2">Năm học phân công</div>
                      <select value={assignmentYearDraft} onChange={(event) => setAssignmentYearDraft(event.target.value)} className="w-full bg-white border border-violet-200 p-3 rounded-xl focus:outline-none focus:border-violet-500 font-black text-sm shadow-sm">
                        {schoolYears.map(year => <option key={`assign-year-${year}`} value={year}>{year}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <div className="text-xs font-black uppercase text-violet-900 mb-2">Họ tên hiệu trưởng</div>
                      <input value={principalDraft} onChange={(event) => setPrincipalDraft(event.target.value)} placeholder="Nhập họ tên hiệu trưởng..." className="w-full bg-white border border-violet-200 p-3 rounded-xl focus:outline-none focus:border-violet-500 font-black text-sm shadow-sm" />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-bold text-violet-700">Chọn năm rồi phân công giáo viên theo lớp. Bấm lưu để chốt năm đang chọn.</div>
                    <button type="button" onClick={clearClassTeacherAssignmentsByYear} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 hover:bg-rose-100">
                      Xóa hết GV từng khối năm này
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {grades.map(grade => (
                    <div key={`class-${grade}`} className="rounded-3xl border border-violet-100 bg-white p-4 shadow-sm overflow-x-auto">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-black text-violet-900 uppercase">Khối {grade}</div>
                      <button
                        type="button"
                        onClick={() => clearClassTeacherAssignmentsByGrade(grade)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-black uppercase text-rose-700 hover:bg-rose-100"
                      >
                        Xóa khối {grade}
                      </button>
                    </div>
                    <table className="w-full min-w-[520px] border-separate border-spacing-y-2">
                      <thead>
                        <tr className="text-left text-xs font-black uppercase text-slate-500">
                          <th className="w-12 px-2">STT</th>
                          <th className="px-2">Môn</th>
                          <th className="px-2">Tên giáo viên</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classSubjects(subjects).map((subject, index) => (
                          <tr key={`${grade}-${subject}`} className="bg-slate-50">
                            <td className="rounded-l-xl px-2 py-2 font-black text-slate-500">{index + 1}</td>
                            <td className="px-2 py-2 font-black text-slate-800">{subject}</td>
                            <td className="rounded-r-xl px-2 py-2">
                              <input
                                value={assignmentValue(grade, subject)}
                                onChange={(event) => updateAssignment(grade, subject, event.target.value)}
                                list="nan-teacher-names"
                                placeholder="Gõ hoặc chọn giáo viên..."
                                className="w-full rounded-xl border border-slate-200 bg-white p-2 font-bold outline-none focus:border-violet-400"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
