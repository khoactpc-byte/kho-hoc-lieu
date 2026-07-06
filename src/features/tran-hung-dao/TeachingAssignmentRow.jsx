import { Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react';

export default function TeachingAssignmentRow({
  row,
  rowMeta = {},
  sourceIndex,
  activeAssignmentClasses = [],
  activeClassPickerIndex,
  activeTeacherPickerIndex,
  assignmentSubjectOptions = [],
  canEditTeachingRows = false,
  canMoveTeacherDown = false,
  canMoveTeacherUp = false,
  classPickerPosition = {},
  formatMoney,
  isContinuationRow = false,
  isTeachingSummaryView = false,
  isThdTeachingPanel = false,
  liveCheckNote = '',
  noteInputValue = '',
  noteText = '',
  periodInputValue = '',
  periodsPerClassWeek = '',
  positionOptions = [],
  showSummaryRow = false,
  showTeachingFinancialColumns = false,
  showTeachingSchoolColumns = false,
  specialtyToneClass = '',
  assignmentToneClass = '',
  teacherGrandTotal = '',
  teacherMoneyRate = '',
  teacherMoneyTotal = 0,
  teacherPickerPosition = {},
  teacherRequiredPeriodsPerWeek = '',
  teacherRequiredYearTotal = 0,
  teacherSchoolPeriods = '',
  teacherSequenceNumber = '',
  teacherSuggestions = [],
  teacherYearTotal = '',
  totalPeriods = '',
  totalPerWeek = '',
  assignmentMoney = 0,
  showAcceptCheckButton = false,
  isCheckAccepted = false,
  acceptTeachingTeacherCheckSource,
  abbreviateTeachingSpecialty,
  addTeachingAssignmentForSameTeacher,
  addTeachingTeacherAfterGroup,
  deleteTeachingAssignmentRow,
  deleteTeachingTeacherGroup,
  getAssignmentClassList,
  mergeTeachingNote,
  moveTeachingAssignmentGroup,
  openClassPicker,
  openTeacherPicker,
  pickTeachingTeacher,
  setActiveClassPickerIndex,
  setActiveTeacherPickerIndex,
  toggleTeachingClass,
  toggleTeachingClassGrade,
  toggleTeachingClassAll,
  updateTeachingAssignmentRow
}) {
  return (
    <Fragment>
      <tr className="bg-white hover:bg-cyan-50/40">
        <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-500">{teacherSequenceNumber}</td>
        <td className="relative border border-slate-200 px-0.5 py-0.5">
          {isContinuationRow ? <div className="h-7" /> : (
            <div className="relative">
              <input
                value={row.teacherName}
                disabled={!canEditTeachingRows}
                onFocus={(event) => openTeacherPicker(sourceIndex, event.currentTarget)}
                onBlur={() => window.setTimeout(() => setActiveTeacherPickerIndex(current => (current === sourceIndex ? null : current)), 140)}
                onChange={(event) => {
                  openTeacherPicker(sourceIndex, event.currentTarget);
                  updateTeachingAssignmentRow(sourceIndex, { teacherName: event.target.value });
                }}
                placeholder="Gõ tên không dấu..."
                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-semibold outline-none focus:border-cyan-400"
              />
              {activeTeacherPickerIndex === sourceIndex && teacherSuggestions.length > 0 && createPortal((
                <div
                  data-teaching-own-scroll="true"
                  className="fixed z-[300] max-h-[220px] overflow-y-auto rounded-xl border border-cyan-100 bg-white p-1 shadow-2xl"
                  style={{
                    top: `${teacherPickerPosition.top}px`,
                    left: `${teacherPickerPosition.left}px`,
                    width: `${teacherPickerPosition.width}px`,
                    maxWidth: 'calc(100vw - 48px)'
                  }}
                >
                  {teacherSuggestions.map(teacher => (
                    <button
                      type="button"
                      key={`teacher-pick-${sourceIndex}-${teacher.name}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pickTeachingTeacher(sourceIndex, teacher);
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-cyan-50"
                    >
                      <div className="text-sm font-semibold text-slate-800">{teacher.name}</div>
                      {teacher.subject && <div className="text-[11px] font-medium text-slate-500">{teacher.subject}</div>}
                    </button>
                  ))}
                </div>
              ), document.body)}
            </div>
          )}
        </td>
        <td className="border border-slate-200 px-0.5 py-0.5">
          {isContinuationRow ? <div className="h-7" /> : (
            <select
              value={row.position || 'GV'}
              disabled={!canEditTeachingRows}
              onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { position: event.target.value })}
              className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
            >
              {positionOptions.map(position => <option key={position} value={position}>{position}</option>)}
            </select>
          )}
        </td>
        <td className="border border-slate-200 px-0.5 py-0.5">
          {isContinuationRow ? <div className="h-7" /> : (
            <input
              value={abbreviateTeachingSpecialty(row.specialty)}
              disabled={!canEditTeachingRows}
              onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { specialty: event.target.value })}
              list="assignment-specialties"
              placeholder="Tự lấy theo GV..."
              className={`h-7 w-full rounded-md border px-2 text-[13px] font-normal outline-none transition-colors ${specialtyToneClass}`}
            />
          )}
        </td>
        <td className="border border-slate-200 px-0.5 py-0.5">
          {isThdTeachingPanel ? (
            <input
              value={row.assignment || ''}
              disabled={!canEditTeachingRows}
              onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { assignment: event.target.value })}
              list="thd-assignment-short-names"
              placeholder="Nhập môn/phân công..."
              className={`h-7 w-full rounded-md border px-2 text-[13px] font-normal outline-none transition-colors ${assignmentToneClass}`}
            />
          ) : (
            <select
              value={row.assignment || ''}
              disabled={!canEditTeachingRows}
              onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { assignment: event.target.value })}
              className={`h-7 w-full rounded-md border px-2 text-[13px] font-normal outline-none transition-colors ${assignmentToneClass}`}
            >
              <option value="">Chọn</option>
              {assignmentSubjectOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}
        </td>
        <td className="border border-slate-200 px-0.5 py-0.5">
          <input
            value={row.weeks}
            disabled={!canEditTeachingRows}
            onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { weeks: event.target.value })}
            inputMode="numeric"
            className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
          />
        </td>
        <td className="border border-slate-200 px-0.5 py-0.5">
          <button
            type="button"
            data-class-picker-button
            disabled={!canEditTeachingRows}
            onClick={(event) => openClassPicker(sourceIndex, event.currentTarget)}
            className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none hover:bg-cyan-50 focus:border-cyan-400 disabled:opacity-60"
          >
            {row.className || 'Chọn'}
          </button>
          {activeClassPickerIndex === sourceIndex && createPortal((
            <div
              data-class-picker-popup
              className="fixed z-[300] overflow-hidden rounded-xl border border-cyan-100 bg-white shadow-2xl"
              style={{
                top: `${classPickerPosition.top}px`,
                left: `${classPickerPosition.left}px`,
                width: `${classPickerPosition.width}px`,
                maxWidth: 'calc(100vw - 48px)',
                maxHeight: '360px'
              }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2">
                <span className="text-xs font-semibold uppercase text-slate-500">Chọn lớp</span>
                <button
                  type="button"
                  onClick={() => setActiveClassPickerIndex(null)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                  title="Đóng"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 border-b border-slate-100 p-2 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => toggleTeachingClassAll(sourceIndex)}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${(activeAssignmentClasses.length > 0 && activeAssignmentClasses.every(c => getAssignmentClassList(row.className, activeAssignmentClasses).includes(c))) ? 'bg-cyan-100 border-cyan-300 text-cyan-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Tất cả
                </button>
                {[6, 7, 8, 9].map(grade => {
                  const gradeClasses = activeAssignmentClasses.filter(c => String(c).match(/^\d+/)?.[0] === String(grade));
                  const isGradeSelected = gradeClasses.length > 0 && gradeClasses.every(c => getAssignmentClassList(row.className, activeAssignmentClasses).includes(c));
                  return (
                    <button
                      key={`quick-grade-${grade}`}
                      type="button"
                      onClick={() => toggleTeachingClassGrade(sourceIndex, grade)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${isGradeSelected ? 'bg-cyan-100 border-cyan-300 text-cyan-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      Khối {grade}
                    </button>
                  );
                })}
              </div>
              <div data-teaching-own-scroll="true" className="max-h-[310px] overflow-y-auto p-1 overscroll-contain">
                {activeAssignmentClasses.map(className => {
                  const checked = getAssignmentClassList(row.className, activeAssignmentClasses).includes(className);
                  return (
                    <label key={`class-pick-${sourceIndex}-${className}`} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-cyan-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTeachingClass(sourceIndex, className)}
                        className="h-4 w-4 accent-cyan-600"
                      />
                      <span>{className}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ), document.body)}
        </td>
        <td className="border border-slate-200 px-0.5 py-0.5">
          <input
            value={row.classCount}
            disabled={!canEditTeachingRows}
            onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { classCount: event.target.value })}
            inputMode="numeric"
            className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
          />
        </td>
        <td className="w-12 min-w-[3.25rem] max-w-[3.25rem] border border-slate-200 px-0.5 py-0.5 text-center font-normal text-slate-700">
          {isThdTeachingPanel ? (
            <input
              value={periodInputValue}
              disabled={!canEditTeachingRows}
              onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { periodsPerClassWeek: event.target.value })}
              inputMode="decimal"
              placeholder={String(periodsPerClassWeek || '')}
              className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
            />
          ) : periodsPerClassWeek}
        </td>
        <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{totalPerWeek}</td>
        <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{totalPeriods}</td>
        <td className="border border-slate-200 px-0.5 py-0.5">
          <textarea
            key={`teaching-note-${sourceIndex}-${noteInputValue}`}
            defaultValue={noteInputValue}
            disabled={!canEditTeachingRows}
            onBlur={(event) => updateTeachingAssignmentRow(sourceIndex, { note: mergeTeachingNote(noteText, event.target.value) })}
            onFocus={(event) => {
              if (!event.currentTarget.value && noteText) event.currentTarget.value = noteText;
              const end = event.currentTarget.value.length;
              event.currentTarget.setSelectionRange(end, end);
            }}
            rows={Math.max(1, String(noteInputValue || noteText || '').split('\n').length)}
            placeholder={noteText || 'Ghi chú...'}
            className="min-h-7 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] font-normal leading-snug outline-none focus:border-cyan-400"
          />
        </td>
        {isThdTeachingPanel && (!isTeachingSummaryView || !isContinuationRow) && (
          <td rowSpan={isTeachingSummaryView ? rowMeta.checkRowSpan : undefined} className="border border-slate-200 px-0.5 py-0.5 align-top">
            <div
              key={`teaching-pasted-note-${sourceIndex}-${liveCheckNote || ''}`}
              className="min-h-7 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-normal leading-snug text-slate-500"
            >
              {liveCheckNote || ''}
            </div>
          </td>
        )}
        {!isThdTeachingPanel && (
          <td className="border border-slate-200 px-1 py-0.5 text-center">
            <input
              type="checkbox"
              checked={Boolean(row.transcriptSigner)}
              disabled={!canEditTeachingRows}
              onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { transcriptSigner: event.target.checked })}
              className="h-4 w-4 accent-violet-600"
              title="Giáo viên ký học bạ cho môn/lớp này"
            />
          </td>
        )}
        {showTeachingFinancialColumns && (
          <>
            <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{formatMoney(teacherMoneyRate)}</td>
            <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{formatMoney(assignmentMoney)}</td>
          </>
        )}
        {showTeachingSchoolColumns && (
          <>
            <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{teacherSchoolPeriods || ''}</td>
            <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{teacherGrandTotal || ''}</td>
          </>
        )}
        <td className="border border-slate-200 px-0.5 py-0.5 text-center">
          <div className="flex items-center justify-center gap-1">
            <button type="button" onClick={() => moveTeachingAssignmentGroup(sourceIndex, -1)} disabled={!canEditTeachingRows || !canMoveTeacherUp} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời giáo viên lên">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => moveTeachingAssignmentGroup(sourceIndex, 1)} disabled={!canEditTeachingRows || !canMoveTeacherDown} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời giáo viên xuống">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => addTeachingAssignmentForSameTeacher(sourceIndex)} disabled={!canEditTeachingRows} className="h-7 w-7 rounded-md border border-cyan-200 bg-white text-cyan-700 font-black hover:bg-cyan-50 disabled:opacity-30" title="Thêm phân công cho giáo viên này">+</button>
            <button type="button" onClick={() => deleteTeachingAssignmentRow(sourceIndex)} disabled={!canEditTeachingRows} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-30" title="Xóa dòng">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {showSummaryRow && (isThdTeachingPanel ? (
        <>
          <tr className="bg-amber-100">
            <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-normal italic text-amber-950">
              Số tiết/năm học
            </td>
            <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-normal italic text-amber-950">
              {teacherYearTotal || ''}
            </td>
            <td className="border border-amber-300 px-1 py-0.5" />
            <td className="border border-amber-300 px-1 py-0.5 text-center">
              {showAcceptCheckButton && (
                <button
                  type="button"
                  onClick={() => acceptTeachingTeacherCheckSource?.(sourceIndex)}
                  disabled={!canEditTeachingRows}
                  className={`h-6 rounded-md border bg-white px-2 text-[0px] font-black not-italic disabled:opacity-30 ${
                    isCheckAccepted
                      ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                      : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                  }`}
                  title="Tôi đã kiểm tra, lấy bảng làm chuẩn"
                >
                  <span className="text-[11px]">{isCheckAccepted ? 'Không khớp' : 'Khớp'}</span>
                  Kiểm tra
                </button>
              )}
            </td>
            <td className="border border-amber-300 px-1 py-0.5 text-right">
              <button
                type="button"
                onClick={() => deleteTeachingTeacherGroup(sourceIndex)}
                disabled={!canEditTeachingRows}
                className="h-6 rounded-md border border-rose-200 bg-white px-2 text-[11px] font-black not-italic text-rose-700 hover:bg-rose-50 disabled:opacity-30"
              >
                Xóa GV
              </button>
            </td>
          </tr>
          <tr className="bg-amber-100">
            <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-normal italic text-amber-950">
              Số tiết nghĩa vụ/năm học
            </td>
            <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-normal italic text-amber-950">
              {canEditTeachingRows ? (
                <input
                  value={row.sourceYearObligation ?? ''}
                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { sourceYearObligation: event.target.value })}
                  placeholder={String(teacherRequiredYearTotal || '')}
                  className="h-6 w-full min-w-[2rem] rounded border border-amber-400 bg-white/60 px-1 text-center font-bold text-amber-950 outline-none focus:border-amber-600 focus:bg-white"
                />
              ) : (
                teacherRequiredYearTotal
              )}
            </td>
            <td className="border border-amber-300 px-1 py-0.5" />
            <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-normal italic text-amber-950">
              {teacherRequiredPeriodsPerWeek} tiết/tuần
            </td>
            <td className="border border-amber-300 px-1 py-0.5" />
          </tr>
          <tr className="bg-amber-100">
            <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-black italic text-red-600">
              Số tiết dư giờ/năm học
            </td>
            <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-red-600">
              {Math.min((Number(teacherYearTotal) || 0) - teacherRequiredYearTotal, 200)}
            </td>
            <td className="border border-amber-300 px-1 py-0.5" />
            <td className="border border-amber-300 px-1 py-0.5" />
            <td className="border border-amber-300 px-1 py-0.5 text-right">
              <button
                type="button"
                onClick={() => addTeachingTeacherAfterGroup(sourceIndex)}
                className="h-6 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-black not-italic text-amber-800 hover:bg-amber-50"
              >
                + Thêm GV
              </button>
            </td>
          </tr>
        </>
      ) : (
        <tr className="bg-amber-100">
          <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-black italic text-amber-950">
            Số tiết dạy phổ cập/năm học
          </td>
          <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
            {teacherYearTotal || ''}
          </td>
          <td className="border border-amber-300 px-1 py-0.5" />
          <td className="border border-amber-300 px-1 py-0.5" />
          {showTeachingFinancialColumns && (
            <>
              <td className="border border-amber-300 px-1 py-0.5" />
              <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
                {formatMoney(teacherMoneyTotal)}
              </td>
            </>
          )}
          {showTeachingSchoolColumns && (
            <>
              <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
                {teacherSchoolPeriods || ''}
              </td>
              <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
                {teacherGrandTotal || ''}
              </td>
            </>
          )}
          <td className="border border-amber-300 px-1 py-0.5 text-center">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => deleteTeachingTeacherGroup(sourceIndex)}
                disabled={!canEditTeachingRows}
                className="inline-flex h-7 min-w-0 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-30"
                title="Xóa GV"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => addTeachingTeacherAfterGroup(sourceIndex)}
                disabled={!canEditTeachingRows}
                className="h-7 min-w-0 rounded-md border border-cyan-200 bg-cyan-50 text-base font-black leading-none text-cyan-700 hover:bg-cyan-100 disabled:opacity-30"
                title="Thêm GV"
              >
                +
              </button>
            </div>
          </td>
        </tr>
      ))}
    </Fragment>
  );
}
