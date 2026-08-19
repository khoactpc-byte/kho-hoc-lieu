const fs = require('fs');

let adminCode = fs.readFileSync('src/components/AdminSettingsWorkspace.jsx', 'utf8');

// 1. teachingFilter default
adminCode = adminCode.replace(/useState\('all'\);/, 'useState([]);');

// 2. teachingFilterLabel
const oldLabel = "  const teachingFilterLabel = TEACHING_FILTER_OPTIONS.find(option => option.value === teachingFilter)?.label || 'Tất cả';";
const newLabel = `  const teachingFilterLabel = !teachingFilter || teachingFilter.length === 0 || teachingFilter.includes('all') 
    ? 'Tất cả' 
    : (teachingFilter.length === 1 
        ? (TEACHING_FILTER_OPTIONS.find(option => option.value === teachingFilter[0])?.label || teachingFilter[0].replace('dynamic-subject-', ''))
        : \`\${teachingFilter.length} bộ lọc\`);`;
adminCode = adminCode.replace(oldLabel, newLabel);

// 3. filteredTeachingTeacherKeys -> filteredTeachingResult
const filterStart = "  const filteredTeachingTeacherKeys = useMemo(() => {";
const filterEnd = "  }, [activeAssignmentClasses, isThdTeachingPanel, teachingFilter, teachingRowTeacherKeys, teachingRowsForSelectedYear]);";
const newFilter = `  const filteredTeachingResult = useMemo(() => {
    if (!isThdTeachingPanel || !teachingFilter || !teachingFilter.length || teachingFilter.includes('all')) return null;
    
    const teacherKeys = new Set();
    const visibleRowIndices = new Set();
    
    const hasSubjectFilter = teachingFilter.some(f => f.startsWith('dynamic-subject-'));
    const hasNonSubjectFilter = teachingFilter.some(f => !f.startsWith('dynamic-subject-'));

    const rowsByTeacher = new Map();
    teachingRowsForSelectedYear.forEach((row, index) => {
      const teacherKey = teachingRowTeacherKeys[index];
      if (!teacherKey) return;
      const rows = rowsByTeacher.get(teacherKey) || [];
      rows.push(row);
      rowsByTeacher.set(teacherKey, rows);
    });

    const teachersMatchingNonSubject = new Set();
    if (hasNonSubjectFilter) {
      rowsByTeacher.forEach((rows, teacherKey) => {
        let matched = false;
        if (teachingFilter.includes('check-error') && getTeacherCheckStatus(rows) === 'error') matched = true;
        if (teachingFilter.includes('surplus') && getTeacherPeriodDiff(rows[0]) > 0) matched = true;
        if (teachingFilter.includes('deficit') && getTeacherPeriodDiff(rows[0]) < 0) matched = true;
        if (teachingFilter.some(f => f.startsWith('team-') && matchesTeachingTeamFilter(rows[0], f))) matched = true;
        if (matched) teachersMatchingNonSubject.add(teacherKey);
      });
    }

    teachingRowsForSelectedYear.forEach((row, index) => {
      const teacherKey = teachingRowTeacherKeys[index];
      if (!teacherKey) return;

      const matchesNonSubject = teachersMatchingNonSubject.has(teacherKey);
      const matchesSubject = hasSubjectFilter && teachingFilter.some(f => f.startsWith('dynamic-subject-') && matchesTeachingSubjectFilter(row, f));

      let isVisible = false;
      if (hasNonSubjectFilter && hasSubjectFilter) {
        isVisible = matchesNonSubject || matchesSubject;
      } else if (hasNonSubjectFilter) {
        isVisible = matchesNonSubject;
      } else if (hasSubjectFilter) {
        isVisible = matchesSubject;
      }

      if (isVisible) {
        teacherKeys.add(teacherKey);
        visibleRowIndices.add(index);
      }
    });

    return { teacherKeys, visibleRowIndices };
  }, [isThdTeachingPanel, teachingFilter, teachingRowTeacherKeys, teachingRowsForSelectedYear]);`;

let s1 = adminCode.indexOf(filterStart);
let e1 = adminCode.indexOf(filterEnd, s1) + filterEnd.length;
adminCode = adminCode.substring(0, s1) + newFilter + adminCode.substring(e1);

// 4. visibleTeachingRows
const rowsStart = "  const visibleTeachingRows = useMemo(() => {";
const rowsEnd = "  }, [filteredTeachingTeacherKeys, teachingRowTeacherKeys, teachingRowsForSelectedYear]);";
const newRows = `  const visibleTeachingRows = useMemo(() => {
    const rows = [];
    teachingRowsForSelectedYear.forEach((row, sourceIndex) => {
      if (!filteredTeachingResult || filteredTeachingResult.visibleRowIndices.has(sourceIndex)) {
        rows.push({ ...row, sourceIndex });
      }
    });
    return rows;
  }, [filteredTeachingResult, teachingRowsForSelectedYear]);`;

let s2 = adminCode.indexOf(rowsStart);
let e2 = adminCode.indexOf(rowsEnd, s2) + rowsEnd.length;
adminCode = adminCode.substring(0, s2) + newRows + adminCode.substring(e2);

// 5. getSubjectSortPriority & formatSubjectLabel
const getTeacherPeriodDiffStart = "  const getTeacherPeriodDiff = (row = {}) => {";
const extraHelpers = `  const formatSubjectLabel = (subject) => {
    const s = subject.trim();
    if (s === 'C nghệ') return 'Công nghệ';
    if (s === 'AN') return 'Âm nhạc';
    if (s === 'MT') return 'Mĩ thuật';
    if (s === 'Van' || s === 'Văn') return 'Ngữ văn';
    return s;
  };

  const getSubjectSortPriority = (subject) => {
    const s = subject.trim();
    const order = [
      'Toán', 'Toán (TS 10)', 
      'Ngữ văn', 'Van', 'Văn', 'Văn (TS 10)', 
      'Tiếng Anh', 'Anh (TS 10)',
      'Khoa học tự nhiên', 'KHTN', 
      'Lịch sử và Địa lí', 'Lịch sử và Địa lý', 'LS&DL', 
      'Công nghệ', 'C nghệ', 
      'Tin học', 'Tin', 
      'Giáo dục thể chất', 'GDTC', 
      'Giáo dục công dân', 'GDCD', 
      'Mĩ thuật', 'Mỹ thuật', 'MT', 
      'Âm nhạc', 'AN', 
      'Giáo dục địa phương', 'GDĐP', 
      'Chủ nhiệm', 'CN'
    ];
    const index = order.indexOf(s);
    return index !== -1 ? index : 1000;
  };

`;
adminCode = adminCode.replace(getTeacherPeriodDiffStart, extraHelpers + getTeacherPeriodDiffStart);

fs.writeFileSync('src/components/AdminSettingsWorkspace.jsx', adminCode, 'utf8');


// ----------------------------------------------------
// Update ThdTeachingAssignmentsToolbar.jsx
let toolbarCode = fs.readFileSync('src/features/tran-hung-dao/ThdTeachingAssignmentsToolbar.jsx', 'utf8');

// 1. Add X icon import
toolbarCode = toolbarCode.replace("Trash2\n} from 'lucide-react';", "Trash2,\n  X\n} from 'lucide-react';");

// 2. Replace filter menu structure
const menuStart = "                {showTeachingFilterMenu && (";
const menuEnd = "                )}";

// We want to find the first occurrence of menuStart and match until the matching menuEnd
let mS = toolbarCode.indexOf(menuStart);
let mE = toolbarCode.indexOf("                )}", mS + menuStart.length) + "                )}".length;

const newMenu = `                {showTeachingFilterMenu && (
                  <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] w-[1000px] max-w-[95vw] rounded-xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[80vh]">
                    <button
                      type="button"
                      onClick={() => setShowTeachingFilterMenu(false)}
                      className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="flex gap-8">
                      <div className="w-1/4 flex flex-col gap-8 border-r border-slate-100 pr-6">
                        <div className="space-y-2">
                          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Tình trạng</div>
                          {teachingFilterOptions.filter(o => o.value === 'all' || (!o.value.startsWith('team-') && !o.value.startsWith('dynamic-subject-'))).map(option => (
                            <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={teachingFilter.includes(option.value) || (option.value === 'all' && (!teachingFilter || !teachingFilter.length))}
                                onChange={(e) => {
                                  if (option.value === 'all') {
                                    setTeachingFilter([]);
                                  } else {
                                    setTeachingFilter(prev => {
                                      const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                      if (e.target.checked) next.push(option.value);
                                      else next.splice(next.indexOf(option.value), 1);
                                      return next;
                                    });
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{option.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Tổ chuyên môn</div>
                          {teachingFilterOptions.filter(o => o.value.startsWith('team-')).map(option => (
                            <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={teachingFilter.includes(option.value)}
                                onChange={(e) => {
                                  setTeachingFilter(prev => {
                                    const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                    if (e.target.checked) next.push(option.value);
                                    else next.splice(next.indexOf(option.value), 1);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{option.label.replace('Tổ ', '')}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 border-l border-slate-100 pl-6 space-y-6">
                        {(() => {
                          const allDynamicSubjects = teachingFilterOptions.filter(o => o.value.startsWith('dynamic-subject-'));
                          const coreSubjects = allDynamicSubjects.filter(o => o.priority !== undefined && o.priority < 1000);
                          const otherDuties = allDynamicSubjects.filter(o => o.priority === undefined || o.priority >= 1000);

                          return (
                            <>
                              {coreSubjects.length > 0 && (
                                <div>
                                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Môn học ({coreSubjects.length})</div>
                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                                    {coreSubjects.map(option => (
                                      <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                          type="checkbox"
                                          checked={teachingFilter.includes(option.value)}
                                          onChange={(e) => {
                                            setTeachingFilter(prev => {
                                              const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                              if (e.target.checked) next.push(option.value);
                                              else next.splice(next.indexOf(option.value), 1);
                                              return next;
                                            });
                                          }}
                                          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                        />
                                        <span className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{option.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {otherDuties.length > 0 && (
                                <div className="mt-8">
                                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Chuyên môn / Hỗ trợ ({otherDuties.length})</div>
                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                                    {otherDuties.map(option => (
                                      <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                          type="checkbox"
                                          checked={teachingFilter.includes(option.value)}
                                          onChange={(e) => {
                                            setTeachingFilter(prev => {
                                              const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                              if (e.target.checked) next.push(option.value);
                                              else next.splice(next.indexOf(option.value), 1);
                                              return next;
                                            });
                                          }}
                                          className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                        />
                                        <span className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{option.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}`;

toolbarCode = toolbarCode.substring(0, mS) + newMenu + toolbarCode.substring(mE);

// 3. Make filter button active logic array-based
toolbarCode = toolbarCode.replace(
  "teachingFilter === 'all'\n                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'",
  "(!teachingFilter || teachingFilter.length === 0 || teachingFilter.includes('all'))\n                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
);

fs.writeFileSync('src/features/tran-hung-dao/ThdTeachingAssignmentsToolbar.jsx', toolbarCode, 'utf8');

console.log('Successfully completed!');
