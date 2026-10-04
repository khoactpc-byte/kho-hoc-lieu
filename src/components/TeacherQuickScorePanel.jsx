import ScorebookMigrationNotice from './ScorebookMigrationNotice';
import { Loader2 } from 'lucide-react';

export default function TeacherQuickScorePanel({ scope, selection, draft, actions, table }) {
  const { quickScoreGrade, quickScoreLockedContext, selectedSubject, canWriteCurrentSchoolYear, activeSchoolYear, user } = scope;
  const { quickVisibleSemesters, setQuickVisibleSemesters, quickSelectedSubjects, quickSelectedSemesters, quickSubjectColSpanBySubject } = selection;
  const { quickScorebookSavingKey, quickScorebookDocId, quickScorebookEdits, setQuickScorebookEdits, quickInputDrafts, setQuickInputDrafts, quickScorebookLoaded } = draft;
  const { setShowLearningResultsWorkspace, setQuickScoreLockedContext, showNotification, setActiveQuickScoreRowKey, toggleQuickPriorityStudent, handleQuickScoreInputKeyDown, saveQuickScoreValue } = actions;
  const { quickScoreStudents, getQuickScoreColumnWidth, getQuickScoreStudentKey, quickPriorityStudentIds, activeQuickScoreRowKey, quickVisibleScoreColumnsBySubject, getQuickScoreKey, getQuickScoreInputValue, getQuickSemesterTermAverage, getQuickSemesterScoreResult, formatScoreDisplayValue, getQuickScoreTextClass, quickQuizScoreKeySet, parseScoreNumber, getQuickAcademicResult } = table;
  return (<>
      <style>{`
        @media (max-width: 639px) {
          html:has(.teacher-quick-score-landscape),
          body:has(.teacher-quick-score-landscape) {
            overflow: hidden !important;
          }
          .teacher-quick-score-landscape {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vh !important;
            height: 100vw !important;
            width: 100dvh !important;
            height: 100dvw !important;
            max-width: none !important;
            max-height: none !important;
            transform: rotate(90deg) translateY(-100%) !important;
            transform-origin: top left;
            overflow: hidden !important;
            padding: 6px !important;
            border-radius: 0 !important;
          }
          .teacher-quick-score-toolbar {
            min-height: 42px;
            margin-bottom: 6px !important;
            padding-bottom: 6px !important;
          }
          .teacher-quick-score-title {
            max-width: 210px;
          }
          .teacher-quick-score-title-main {
            font-size: 11px !important;
            line-height: 1.1 !important;
          }
          .teacher-quick-score-table-wrap {
            max-height: calc(100dvw - 54px) !important;
          }
        }
      `}</style>
      <div className="teacher-quick-score-landscape fixed inset-0 z-[260] m-0 flex h-[100dvh] w-screen flex-col rounded-none border-0 bg-white p-2 shadow-2xl sm:static sm:mt-4 sm:block sm:h-auto sm:w-auto sm:rounded-2xl sm:border sm:border-slate-200 sm:p-4 sm:shadow-sm">
      <div className="teacher-quick-score-toolbar mb-2 flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-slate-100 pb-2 sm:mb-3 sm:flex-wrap sm:border-b-0 sm:pb-0">
        <div className="teacher-quick-score-title min-w-0">
          <div className="teacher-quick-score-title-main font-black text-slate-900 uppercase text-sm">Bảng nhập điểm nhanh</div>
          <div className="text-[11px] font-bold text-slate-500">Khối {quickScoreGrade} · {quickScoreLockedContext?.subjectLabel || selectedSubject}</div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-2">
          {quickScorebookSavingKey && <div className="text-xs font-black text-emerald-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang lưu...</div>}
          <button type="button" onClick={() => setQuickVisibleSemesters({ hki: !quickVisibleSemesters.hki, hkii: quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hki ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK1</button>
          <button type="button" onClick={() => setQuickVisibleSemesters({ hki: quickVisibleSemesters.hki, hkii: !quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hkii ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK2</button>
          <button type="button" onClick={() => { setShowLearningResultsWorkspace(false); setQuickScoreLockedContext(null); }} className="h-8 rounded-lg border border-rose-100 bg-rose-50 px-3 text-[11px] font-black uppercase text-rose-600">Đóng</button>
        </div>
      </div>
      {!canWriteCurrentSchoolYear && (
        <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black uppercase text-rose-700">
          Năm học {activeSchoolYear} đang khóa nhập điểm
        </div>
      )}

      <ScorebookMigrationNotice docId={quickScorebookDocId} edits={quickScorebookEdits} students={quickScoreStudents} user={user} showNotification={showNotification} onMigrated={setQuickScorebookEdits} />
      <div data-quick-score-scope="teacher" className="teacher-quick-score-table-wrap min-h-0 flex-1 overflow-auto rounded-xl border border-slate-300 overscroll-contain sm:max-h-[70vh]">
        <table className="min-w-max w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th rowSpan={3} className="sticky left-0 z-[70] min-w-[190px] max-w-[190px] border border-slate-400 bg-slate-100 px-2 py-1 text-left font-black shadow-[4px_0_0_#f8fafc]">ƯT · Họ và tên</th>
              {quickSelectedSubjects.map((subject) => (
                <th key={`teacher-quick-subject-${subject.key}`} colSpan={quickSubjectColSpanBySubject[subject.key] || 0} className="border-x-4 border-y-2 border-slate-600 px-1 py-1 text-center font-black">{subject.label}</th>
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
                    <th key={`teacher-quick-semester-head-${subject.key}-${semester.key}`} colSpan={(subject.txCount || 4) + 3 + (semester.key === 'hkii' ? 1 : 0)} className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}>
                      {semester.label}
                    </th>
                  );
                })
              ))}
            </tr>
            <tr className="bg-slate-50">
              {quickSelectedSubjects.flatMap((subject) => (
                quickSelectedSemesters.flatMap((semester, semesterIndex) => {
                  const labels = [...Array.from({ length: subject.txCount || 4 }, (_, idx) => `TX${idx + 1}`), 'GK', 'CK', 'ĐTB', ...(semester.key === 'hkii' ? ['ĐTBCN'] : [])];
                  return labels.map((label, labelIndex) => {
                    const isSubjectStart = semesterIndex === 0 && labelIndex === 0;
                    const isSubjectEnd = semesterIndex === quickSelectedSemesters.length - 1 && labelIndex === labels.length - 1;
                    const scoreIndex = label.startsWith('TX') ? Number(label.replace('TX', '')) - 1 : (label === 'GK' ? 4 : (label === 'CK' ? 5 : (label === 'ĐTB' ? 6 : 7)));
                    return (
                      <th key={`teacher-quick-col-head-${subject.key}-${semester.key}-${label}`} style={{ minWidth: getQuickScoreColumnWidth(scoreIndex), width: getQuickScoreColumnWidth(scoreIndex) }} className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-50' : 'bg-sky-50'}`}>
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
              const isPriorityStudent = quickPriorityStudentIds.has(studentKey);
              const isActiveRow = activeQuickScoreRowKey === studentKey;
              const rowToneClass = isActiveRow ? 'bg-indigo-50/95' : (isPriorityStudent ? 'bg-emerald-50/70' : (rowIndex % 2 ? 'bg-white' : 'bg-slate-50/30'));
              const nameToneClass = isActiveRow ? 'bg-indigo-50' : (isPriorityStudent ? 'bg-emerald-50' : 'bg-white');
              return (
              <tr key={`teacher-quick-row-${student.id || rowIndex}`} onClick={() => setActiveQuickScoreRowKey(studentKey)} className={`${rowToneClass} ${isActiveRow ? 'outline outline-2 outline-indigo-300 outline-offset-[-2px]' : ''}`}>
                <td className={`sticky left-0 z-[60] min-w-[190px] max-w-[190px] border border-slate-300 px-2 py-1 font-bold whitespace-nowrap overflow-hidden text-ellipsis shadow-[4px_0_0_#ffffff] ${nameToneClass}`}>
                  <label className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPriorityStudent}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleQuickPriorityStudent(studentKey)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      title="Ưu tiên khi tự sinh điểm"
                    />
                    <span className="truncate">{student.fullName || ''}</span>
                  </label>
                </td>
                {quickVisibleScoreColumnsBySubject.map((column, columnIndex) => {
                  const editKey = getQuickScoreKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                  const manualValue = getQuickScoreInputValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                  const fallbackValue = column.scoreIndex === 6 ? getQuickSemesterTermAverage(column.semester, column.pageIndex, rowIndex) : (column.scoreIndex === 7 ? getQuickSemesterScoreResult('hkii', column.pageIndex, rowIndex, 7) : '');
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
                      <td key={`teacher-quick-score-${student.id || rowIndex}-${column.id}`} style={{ minWidth: columnWidth, width: columnWidth }} className={`relative border border-slate-300 px-1 py-0.5 text-center ${scoreTextClass} ${readOnlyScoreBgClass} ${subjectDividerClass}`}>
                        {displayValue}
                        {isQuizScore && <button type="button" title="Điểm từ bài kiểm tra" aria-label="Điểm từ bài kiểm tra" className="absolute right-0 top-0 z-10 h-2.5 w-2.5 rounded-bl-md bg-rose-600" />}
                      </td>
                    );
                  }
                  return (
                    <td key={`teacher-quick-score-${student.id || rowIndex}-${column.id}`} style={{ minWidth: columnWidth, width: columnWidth }} className={`relative border border-slate-300 p-0 ${subjectDividerClass}`}>
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
                      }} onKeyDown={(event) => handleQuickScoreInputKeyDown(event, rowIndex, columnIndex)} onBlur={async (event) => {
                        const next = event.target.value;
                        await saveQuickScoreValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex, next);
                      }} onFocus={() => setActiveQuickScoreRowKey(studentKey)} placeholder="-" className={`w-full h-8 sm:h-6 border-0 px-0.5 text-center text-[16px] sm:text-[11px] outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${scoreTextClass} ${inputBgClass} focus:bg-yellow-50`} />
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
            {!quickSelectedSemesters.length || !quickSelectedSubjects.length ? <tr><td colSpan={4} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">Hãy chọn ít nhất 1 học kỳ.</td></tr> : null}
            {!quickScoreStudents.length && (
              <tr>
                <td colSpan={1 + quickVisibleScoreColumnsBySubject.length + 3} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">Chưa có danh sách học sinh khối {quickScoreGrade} cho năm học {activeSchoolYear}.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>);
}
