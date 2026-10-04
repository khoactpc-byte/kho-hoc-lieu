import { GraduationCap, X, FileText, BookOpen, Loader2, Sparkles, Trash2, Mail, Send } from 'lucide-react';
import { GRADES } from '../utils/helpers';
import { SCHOOL_OPTIONS } from '../utils/schoolClasses';
import ScorebookMigrationNotice from './ScorebookMigrationNotice';

export default function LearningResultsWorkspace({ view }) {
  const { QUICK_SCORE_SUBJECTS, activeQuickScoreRowKey, activeSchoolYear, allQuickSubjectsVisible, canWriteCurrentSchoolYear, clearVisibleQuickScores, fillMissingQuickScores, formatScoreDisplayValue, getQuickAcademicResult, getQuickScoreColumnWidth, getQuickScoreInputValue, getQuickScoreKey, getQuickScoreStudentKey, getQuickScoreTextClass, getQuickSemesterScoreResult, getQuickSemesterTermAverage, handleQuickScoreInputKeyDown, isAdmin, isSendingQuickScoreMail, openScorebookWorkspace, parseScoreNumber, quickInputDrafts, quickQuizScoreKeySet, quickScoreGrade, quickScoreLockedContext, quickScoreMailSemester, quickScoreMailStudentIds, quickScoreSchoolCode, quickScoreStudents, quickScorebookDocId, quickScorebookEdits, quickScorebookLoaded, quickScorebookSavingKey, quickSelectedSemesters, quickSelectedSubjects, quickSubjectColSpanBySubject, quickVisibleScoreColumnsBySubject, quickVisibleSemesters, quickVisibleSubjects, saveQuickScoreValue, sendQuickScoreReportToStudent, setActiveQuickScoreRowKey, setQuickInputDrafts, setQuickScoreGrade, setQuickScoreLockedContext, setQuickScoreMailSemester, setQuickScoreMailStudentIds, setQuickScoreSchoolCode, setQuickScorebookEdits, setQuickVisibleSemesters, setQuickVisibleSubjects, setShowLearningResultsWorkspace, showNotification, toggleAllQuickScoreMailStudents, toggleQuickScoreMailStudent, user } = view;
  return (
<div className="fixed inset-x-0 top-[114px] sm:top-[84px] bottom-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-3">
              <div className="w-full max-w-none mx-auto space-y-3">
                <div className="sticky top-0 z-10 rounded-3xl border border-violet-100 bg-white/95 px-4 sm:px-6 py-4 shadow-lg backdrop-blur flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-violet-950 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2">
                      <GraduationCap className="w-5 h-5 text-violet-600" /> Kết quả học tập
                    </h3>
                     <div className="text-[10px] sm:text-xs font-bold text-violet-700/70 truncate">Quản lý sổ điểm và học bạ theo cơ sở, khối trong năm học {activeSchoolYear}</div>
                  </div>
                  <button type="button" onClick={() => { setShowLearningResultsWorkspace(false); setQuickScoreLockedContext(null); }} title="Đóng" className="shrink-0 w-11 h-11 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center hover:bg-rose-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {isAdmin && !quickScoreLockedContext && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="rounded-3xl border border-violet-100 bg-white p-4 sm:p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="w-5 h-5 text-violet-600" />
                      <div>
                        <div className="font-black text-violet-950 uppercase">Sổ điểm</div>
                        <div className="text-xs font-bold text-violet-700/70">Mỗi khối một bảng sổ điểm riêng</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {GRADES.map(grade => (
                        <button key={`scorebook-${grade}`} type="button" onClick={() => openScorebookWorkspace('scorebook', grade)} className="min-h-[110px] rounded-2xl border border-violet-100 bg-violet-50 text-violet-800 p-3 flex flex-col items-center justify-center gap-2 hover:bg-violet-600 hover:text-white transition-colors">
                          <FileText className="w-6 h-6" />
                          <span className="text-xs font-black uppercase">Khối {grade}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-blue-100 bg-white p-4 sm:p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                      <div>
                        <div className="font-black text-blue-950 uppercase">Học bạ</div>
                        <div className="text-xs font-bold text-blue-700/70">Mỗi khối một khu học bạ riêng</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {GRADES.map(grade => (
                        <button key={`transcript-${grade}`} type="button" onClick={() => openScorebookWorkspace('transcript', grade)} className="min-h-[110px] rounded-2xl border border-blue-100 bg-blue-50 text-blue-800 p-3 flex flex-col items-center justify-center gap-2 hover:bg-blue-600 hover:text-white transition-colors">
                          <BookOpen className="w-6 h-6" />
                          <span className="text-xs font-black uppercase">Khối {grade}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>}

                <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="font-black text-slate-900 uppercase">Bảng nhập điểm nhanh (liên thông sổ chính)</div>
                      <div className="text-xs font-bold text-slate-500 mt-1">Sửa ở đây sẽ cập nhật vào sổ điểm của khối đã chọn, và ngược lại.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {quickScorebookSavingKey && <div className="text-xs font-black text-emerald-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang lưu...</div>}
                      {isAdmin && <button
                        type="button"
                        onClick={fillMissingQuickScores}
                        disabled={!!quickScorebookSavingKey || !quickScorebookLoaded || !quickScoreStudents.length || !canWriteCurrentSchoolYear}
                        className="h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> {'Cho \u0111i\u1ec3m'}
                      </button>}
                      {isAdmin && <button
                        type="button"
                        onClick={clearVisibleQuickScores}
                        disabled={!!quickScorebookSavingKey || !quickScorebookLoaded || !quickScoreStudents.length || !canWriteCurrentSchoolYear}
                        className="h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black uppercase text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {'X\u00f3a'}
                      </button>}
                      {isAdmin && <button
                        type="button"
                        onClick={() => openScorebookWorkspace('scorebook', quickScoreGrade)}
                        className="h-10 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black uppercase text-violet-700 hover:bg-violet-100"
                      >
                        Mở sổ khối {quickScoreGrade}
                      </button>}
                      {isAdmin && <button
                        type="button"
                        onClick={() => openScorebookWorkspace('transcript', quickScoreGrade)}
                        className="h-10 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black uppercase text-blue-700 hover:bg-blue-100"
                      >
                        Học bạ khối {quickScoreGrade}
                      </button>}
                    </div>
                  </div>

                   <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                   <div className="flex flex-wrap items-center gap-2">
                     <span className="text-[11px] font-black uppercase text-slate-500">Cơ sở</span>
                     <select
                       value={quickScoreSchoolCode}
                       onChange={(event) => {
                         setQuickScoreSchoolCode(event.target.value);
                         setQuickScoreMailStudentIds(new Set());
                         setActiveQuickScoreRowKey('');
                       }}
                       className="h-9 min-w-[220px] rounded-lg border border-violet-200 bg-white px-3 text-xs font-black text-violet-800 outline-none focus:border-violet-500"
                       title="Chọn cơ sở để tách riêng bảng điểm"
                     >
                       {SCHOOL_OPTIONS.map(school => (
                         <option key={`quick-school-${school.code}`} value={school.code}>{school.name}</option>
                       ))}
                     </select>
                   </div>
                   {quickScoreLockedContext && (
                    <div className="flex flex-wrap gap-2">
                      <span className="h-8 rounded-lg border border-violet-200 bg-violet-50 px-3 inline-flex items-center text-[11px] font-black uppercase text-violet-800">Khối {quickScoreLockedContext.grade}</span>
                      <span className="h-8 rounded-lg border border-blue-200 bg-blue-50 px-3 inline-flex items-center text-[11px] font-black uppercase text-blue-800">{quickScoreLockedContext.subjectLabel}</span>
                    </div>
                  )}
                  <div className={`${quickScoreLockedContext ? 'hidden' : 'flex'} flex-wrap gap-2`}>
                    {GRADES.map((grade) => (
                      <button
                        key={`quick-grade-${grade}`}
                        type="button"
                        onClick={() => setQuickScoreGrade(String(grade))}
                        className={`h-9 rounded-lg px-3 text-xs font-black uppercase border transition-colors ${String(quickScoreGrade) === String(grade) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700'}`}
                      >
                        Khối {grade}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={() => setQuickVisibleSemesters({ hki: !quickVisibleSemesters.hki, hkii: quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hki ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK1</button>
                    <button type="button" onClick={() => setQuickVisibleSemesters({ hki: quickVisibleSemesters.hki, hkii: !quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hkii ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK2</button>

                  <div className={`${quickScoreLockedContext ? 'hidden' : 'flex'} flex-wrap gap-2`}>
                    <button
                      type="button"
                      onClick={() => setQuickVisibleSubjects(
                        QUICK_SCORE_SUBJECTS.reduce(
                          (acc, subject) => ({ ...acc, [subject.key]: !allQuickSubjectsVisible }),
                          {}
                        )
                      )}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black uppercase text-slate-700 hover:border-violet-300"
                    >
                      {allQuickSubjectsVisible ? 'Đóng tất cả môn' : 'Mở tất cả môn'}
                    </button>
                    {QUICK_SCORE_SUBJECTS.map((subject) => (
                      <button
                        key={`quick-subject-toggle-${subject.key}`}
                        type="button"
                        onClick={() => setQuickVisibleSubjects(prev => ({ ...prev, [subject.key]: !prev[subject.key] }))}
                        className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSubjects[subject.key] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        {subject.label}
                      </button>
                    ))}
                  </div>
                  </div>
                  </div>
                  {isAdmin && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2">
                      <Mail className="h-4 w-4 shrink-0 text-emerald-700" />
                      <span className="min-w-[180px] flex-1 text-xs font-black text-emerald-800">
                        Đã chọn {quickScoreMailStudentIds.size} học sinh
                      </span>
                      <select
                        value={quickScoreMailSemester}
                        onChange={(event) => setQuickScoreMailSemester(event.target.value)}
                        className="h-9 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-800 outline-none"
                      >
                        <option value="hki">HK1</option>
                        <option value="hkii">HK2</option>
                      </select>
                      <button
                        type="button"
                        onClick={sendQuickScoreReportToStudent}
                        disabled={isSendingQuickScoreMail || !quickScoreMailStudentIds.size}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-black uppercase text-white disabled:opacity-50"
                      >
                        {isSendingQuickScoreMail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Gửi phiếu điểm
                      </button>
                    </div>
                  )}
                  {!canWriteCurrentSchoolYear && (
                    <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase text-rose-700">
                      Năm học {activeSchoolYear} đang khóa nhập điểm
                    </div>
                  )}

                  <ScorebookMigrationNotice docId={quickScorebookDocId} edits={quickScorebookEdits} students={quickScoreStudents} user={user} showNotification={showNotification} onMigrated={setQuickScorebookEdits} />
                      <div data-quick-score-scope="admin" className="overflow-auto rounded-2xl border border-slate-300">
                    <table className="min-w-max w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-100">
                          <th rowSpan={3} className="sticky left-0 z-[70] min-w-[190px] max-w-[190px] border border-slate-400 bg-slate-100 px-2 py-1 text-left font-black shadow-[4px_0_0_#f8fafc]">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={quickScoreStudents.length > 0 && quickScoreStudents.every((student, index) => quickScoreMailStudentIds.has(getQuickScoreStudentKey(student, index)))}
                                onChange={toggleAllQuickScoreMailStudents}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                title="Chọn tất cả học sinh để gửi phiếu điểm"
                              />
                              <span>Họ và tên</span>
                            </label>
                          </th>
                          {quickSelectedSubjects.map((subject) => (
                            <th key={`quick-subject-${subject.key}`} colSpan={quickSubjectColSpanBySubject[subject.key] || 0} className="border-x-4 border-y-2 border-slate-600 px-1 py-1 text-center font-black">
                              {subject.label}
                            </th>
                          ))}
                          <th rowSpan={3} className="min-w-[56px] border border-slate-400 px-1 py-1 text-center font-black">KQ HK1</th>
                          <th rowSpan={3} className="min-w-[56px] border border-slate-400 px-1 py-1 text-center font-black">KQ HK2</th>
                          <th rowSpan={3} className="min-w-[64px] border border-slate-400 px-1 py-1 text-center font-black">KQ Cả năm</th>
                        </tr>
                        <tr className="bg-slate-50">
                          {quickSelectedSubjects.flatMap((subject) => (
                            quickSelectedSemesters.map((semester, semesterIndex) => {
                              const isSubjectStart = semesterIndex === 0;
                              const isSubjectEnd = semesterIndex === quickSelectedSemesters.length - 1;
                              return (
                              <th
                                key={`quick-semester-head-${subject.key}-${semester.key}`}
                                colSpan={(subject.txCount || 4) + 3 + (semester.key === 'hkii' ? 1 : 0)}
                                className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}
                              >
                                {semester.label}
                              </th>
                              );
                            })
                          ))}
                        </tr>
                        <tr className="bg-slate-50">
                          {quickSelectedSubjects.flatMap((subject) => (
                            quickSelectedSemesters.flatMap((semester, semesterIndex) => {
                              const labels = [
                                ...Array.from({ length: subject.txCount || 4 }, (_, idx) => `TX${idx + 1}`),
                                'GK',
                                'CK',
                                'ĐTB',
                                ...(semester.key === 'hkii' ? ['ĐTBCN'] : [])
                              ];
                              return labels.map((label, labelIndex) => {
                                const isSubjectStart = semesterIndex === 0 && labelIndex === 0;
                                const isSubjectEnd = semesterIndex === quickSelectedSemesters.length - 1 && labelIndex === labels.length - 1;
                                const scoreIndex = label.startsWith('TX') ? Number(label.replace('TX', '')) - 1 : (label === 'GK' ? 4 : (label === 'CK' ? 5 : (label === 'ĐTB' ? 6 : 7)));
                                return (
                                <th
                                  key={`quick-col-head-${subject.key}-${semester.key}-${label}`}
                                  style={{ minWidth: getQuickScoreColumnWidth(scoreIndex), width: getQuickScoreColumnWidth(scoreIndex) }}
                                  className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-50' : 'bg-sky-50'}`}
                                >
                                  {label}
                                </th>
                                );
                              });
                            })
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {quickScoreStudents.map((student, rowIndex) => {
                          const studentKey = getQuickScoreStudentKey(student, rowIndex);
                          const isMailSelected = quickScoreMailStudentIds.has(studentKey);
                          const isActiveRow = activeQuickScoreRowKey === studentKey;
                          const rowToneClass = isActiveRow ? 'bg-indigo-50/95' : (isMailSelected ? 'bg-emerald-50/70' : (rowIndex % 2 ? 'bg-white' : 'bg-slate-50/30'));
                          const nameToneClass = isActiveRow ? 'bg-indigo-50' : (isMailSelected ? 'bg-emerald-50' : 'bg-white');
                          return (
                          <tr key={`quick-row-${student.id || rowIndex}`} onClick={() => setActiveQuickScoreRowKey(studentKey)} className={`${rowToneClass} ${isActiveRow ? 'outline outline-2 outline-indigo-300 outline-offset-[-2px]' : ''}`}>
                            <td className={`sticky left-0 z-[60] min-w-[190px] max-w-[190px] border border-slate-300 px-2 py-1 font-bold whitespace-nowrap overflow-hidden text-ellipsis shadow-[4px_0_0_#ffffff] ${nameToneClass}`}>
                              <label className="flex min-w-0 items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isMailSelected}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => toggleQuickScoreMailStudent(studentKey)}
                                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  title="Chọn gửi phiếu điểm"
                                />
                                <span className="truncate">{student.fullName || ''}</span>
                              </label>
                            </td>
                            {quickVisibleScoreColumnsBySubject.map((column, columnIndex) => {
                              const editKey = getQuickScoreKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                              const manualValue = getQuickScoreInputValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                              const fallbackValue = column.scoreIndex === 6
                                ? getQuickSemesterTermAverage(column.semester, column.pageIndex, rowIndex)
                                : (column.scoreIndex === 7
                                  ? getQuickSemesterScoreResult('hkii', column.pageIndex, rowIndex, 7)
                                  : '');
                              const draftValue = quickInputDrafts[editKey];
                              const displayValue = draftValue !== undefined ? draftValue : formatScoreDisplayValue(manualValue !== '' && manualValue != null ? manualValue : fallbackValue);
                              const previousColumn = columnIndex > 0 ? quickVisibleScoreColumnsBySubject[columnIndex - 1] : null;
                              const nextColumn = columnIndex < quickVisibleScoreColumnsBySubject.length - 1 ? quickVisibleScoreColumnsBySubject[columnIndex + 1] : null;
                              const isSubjectStart = !previousColumn || previousColumn.subjectKey !== column.subjectKey;
                              const isSubjectEnd = !nextColumn || nextColumn.subjectKey !== column.subjectKey;
                              const subjectDividerClass = `${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}`;
                              const semesterBgClass = column.semester === 'hki' ? 'bg-amber-50/65' : 'bg-sky-50/65';
                              const scoreTextClass = getQuickScoreTextClass(column.scoreIndex);
                              const columnWidth = getQuickScoreColumnWidth(column.scoreIndex);
                              const isQuizScore = quickQuizScoreKeySet.has(editKey);
                              const parsedDisplayScore = parseScoreNumber(displayValue);
                              const isLowAverageScore = (column.scoreIndex === 6 || column.scoreIndex === 7) && parsedDisplayScore !== null && parsedDisplayScore < 5;
                              const readOnlyScoreBgClass = isLowAverageScore ? 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-300' : (isActiveRow ? 'bg-indigo-50/85' : semesterBgClass);
                              const inputBgClass = isActiveRow ? 'bg-indigo-50' : (manualValue ? 'bg-violet-50/70' : semesterBgClass);
                              if (!column.editable) {
                                return (
                                  <td
                                    key={`quick-score-${student.id || rowIndex}-${column.id}`}
                                    style={{ minWidth: columnWidth, width: columnWidth }}
                                    className={`relative border border-slate-300 px-1 py-0.5 text-center ${scoreTextClass} ${readOnlyScoreBgClass} ${subjectDividerClass}`}
                                  >
                                    {displayValue}
                                    {isQuizScore && <button type="button" title="Điểm từ bài kiểm tra" aria-label="Điểm từ bài kiểm tra" className="absolute right-0 top-0 z-10 h-2.5 w-2.5 rounded-bl-md bg-rose-600" />}
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={`quick-score-${student.id || rowIndex}-${column.id}`}
                                  style={{ minWidth: columnWidth, width: columnWidth }}
                                  className={`relative border border-slate-300 p-0 ${subjectDividerClass}`}
                                >
                                  <input
                                    data-quick-score-input="true"
                                    data-quick-row={rowIndex}
                                    data-quick-col={columnIndex}
                                    disabled={!canWriteCurrentSchoolYear || !quickScorebookLoaded}
                                    title={!canWriteCurrentSchoolYear ? `Năm học ${activeSchoolYear} đang khóa nhập điểm` : undefined}
                                    value={displayValue}
                                    onChange={(event) => {
                                      const rawDraft = event.target.value;
                                      const parsedDraft = parseScoreNumber(rawDraft);
                                      const nextDraft = parsedDraft === null ? rawDraft : (parsedDraft > 10 ? '10' : (parsedDraft < 0 ? '0' : rawDraft));
                                      setQuickInputDrafts(prev => ({ ...prev, [editKey]: nextDraft }));
                                    }}
                                    onKeyDown={(event) => handleQuickScoreInputKeyDown(event, rowIndex, columnIndex)}
                                    onFocus={() => setActiveQuickScoreRowKey(studentKey)}
                                    onBlur={async (event) => {
                                      const next = event.target.value;
                                      await saveQuickScoreValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex, next);
                                    }}
                                    placeholder="-"
                                    className={`w-full h-6 border-0 px-0.5 text-center outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${scoreTextClass} ${inputBgClass} focus:bg-yellow-50`}
                                  />
                                  {isQuizScore && <button type="button" title="Điểm từ bài kiểm tra" aria-label="Điểm từ bài kiểm tra" className="absolute right-0 top-0 z-10 h-2.5 w-2.5 rounded-bl-md bg-rose-600" />}
                                </td>
                              );
                            })}
                            <td className={`border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700 ${isActiveRow ? 'bg-indigo-50/85' : ''}`}>{getQuickAcademicResult(rowIndex, 'hki')}</td>
                            <td className={`border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700 ${isActiveRow ? 'bg-indigo-50/85' : ''}`}>{getQuickAcademicResult(rowIndex, 'hkii')}</td>
                            <td className={`border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700 ${isActiveRow ? 'bg-indigo-50/85' : ''}`}>{getQuickAcademicResult(rowIndex, 'fullYear')}</td>
                          </tr>
                          );
                        })}
                        {!quickSelectedSemesters.length || !quickSelectedSubjects.length ? (
                          <tr>
                            <td colSpan={1 + 3} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">
                              Hãy chọn ít nhất 1 học kỳ và 1 môn để mở bảng nhập điểm.
                            </td>
                          </tr>
                        ) : null}
                        {!quickScoreStudents.length && (
                          <tr>
                            <td colSpan={1 + quickVisibleScoreColumnsBySubject.length + 3} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">
                              Chưa có danh sách học sinh khối {quickScoreGrade} cho năm học {activeSchoolYear}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
  );
}
