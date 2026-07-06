import TeachingAssignmentRow from './TeachingAssignmentRow';
import TeachingAssignmentsTableHeader from './TeachingAssignmentsTableHeader';
import { TeachingAssignmentsEmptyRow, TeachingAssignmentsLoadMoreRow } from './TeachingAssignmentsTableStates';
import ThdTeachingAssignmentsToolbar from './ThdTeachingAssignmentsToolbar';

export default function ThdTeachingAssignmentsPanel({
  activeTeachingVersionId = "main",
  setActiveTeachingVersionId,
  teachingVersionsForSelectedYear = [],
  handleCreateEmptyTeachingVersion,
  handleDuplicateTeachingVersion,
  handleDeleteTeachingVersion,
  updateTeachingVersionName,
  handleCreateNewTeachingBatch,
  handleImportFullPCSheet,
  activeAssignmentClasses = [],
  activeClassPickerIndex,
  activeTeacherPickerIndex,
  activeTeachingBatch,
  assignmentSubjectOptions = [],
  canEditTeachingRows = false,
  canUseTeachingImport = false,
  classPickerPosition = {},
  formatMoney,
  hasChanges = false,
  hasTeachingBatches = false,
  isEditingActiveTeachingBatch = false,
  isEditingMainTeaching = false,
  isEditingTeachingSummary = false,
  isTeachingSummaryView = false,
  isThdTeachingPanel = false,
  newTeachersComparedToPreviousBatch = [],
  positionOptions = [],
  renderedTeachingRows = [],
  selectedSchoolYear = '',
  selectedTeachingBatchId = '',
  showTeachingExportMenu = false,
  showTeachingFinancialColumns = false,
  showTeachingFilterMenu = false,
  showTeachingMoneyColumns = false,
  showTeachingSchoolColumns = false,
  teachingAssignmentPanelRef,
  teachingAssignmentScrollRef,
  teachingBatchesForSelectedYear = [],
  teachingFilter = 'all',
  teachingFilterLabel = 'Tất cả',
  teachingFilterOptions = [],
  teachingGroupBoundsBySourceIndex = new Map(),
  teachingImportEndDate = '',
  teachingImportFileRef,
  teachingImportStartDate = '',
  teachingRowsForSelectedYear = [],
  teachingSummaryDirty = false,
  teachingTeacherDetailsByKey = new Map(),
  teachingTeacherTotalsByKey = { yearTotals: new Map(), moneyTotals: new Map() },
  teacherPickerPosition = {},
  visibleTeachingRowMeta = [],
  visibleTeachingRowTeacherKeys = [],
  visibleTeachingRows = [],
  acceptTeachingTeacherCheckSource,
  abbreviateTeachingSpecialty,
  addTeachingAssignmentForSameTeacher,
  addTeachingTeacherAfterGroup,
  clearTeachingAssignmentsForYear,
  deleteSelectedTeachingBatch,
  deleteTeachingAssignmentRow,
  deleteTeachingTeacherGroup,
  exportTeachingAssignments,
  getAssignmentClassList,
  getAssignmentNote,
  getConfiguredAssignmentPeriods,
  getPeriodsPerClassWeek,
  getTeacherSuggestions,
  getTeachingBatchLabel,
  getTeachingRequiredPeriodsPerWeek,
  getTeachingRequiredYearTotal,
  getTeachingSubjectToneClass,
  getTotalPeriods,
  getVisibleWeeklyPeriods,
  handleTeachingAssignmentScroll,
  handleTeachingImportFile,
  loadMoreTeachingRows,
  mergeTeachingNote,
  moveTeachingAssignmentGroup,
  normalizePeriods,
  openClassPicker,
  openTeacherPicker,
  openTeachingImportFilePicker,
  openTeachingTimeSettings,
  pickTeachingTeacher,
  saveAll,
  setActiveClassPickerIndex,
  setActiveTeacherPickerIndex,
  setEditingTeachingBatchId,
  setSelectedTeachingBatchId,
  setShowNewTeachersModal,
  setShowTeachingCheckModal,
  setShowTeachingExportMenu,
  setShowTeachingFilterMenu,
  setShowTeachingMoneyColumns,
  setTeachingFilter,
  setTeachingImportEndDate,
  setTeachingImportStartDate,
  toggleTeachingClass,
  toggleTeachingClassGrade,
  toggleTeachingClassAll,
  updateTeachingAssignmentRow,
  updateTeachingSummaryFromBatches
}) {
  const tableMinWidth = isThdTeachingPanel
    ? 'min-w-[1340px]'
    : (showTeachingFinancialColumns ? 'min-w-[1540px]' : (showTeachingSchoolColumns ? 'min-w-[1360px]' : 'min-w-[1180px]'));

  return (
    <div ref={teachingAssignmentPanelRef} className="teaching-assignment-panel grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-0 pb-0 pt-0">
      <ThdTeachingAssignmentsToolbar
        activeTeachingVersionId={activeTeachingVersionId}
        setActiveTeachingVersionId={setActiveTeachingVersionId}
        teachingVersionsForSelectedYear={teachingVersionsForSelectedYear}
        handleCreateEmptyTeachingVersion={handleCreateEmptyTeachingVersion}
        handleDuplicateTeachingVersion={handleDuplicateTeachingVersion}
        handleDeleteTeachingVersion={handleDeleteTeachingVersion}
        updateTeachingVersionName={updateTeachingVersionName}
        handleCreateNewTeachingBatch={handleCreateNewTeachingBatch}
        activeTeachingBatch={activeTeachingBatch}
        handleImportFullPCSheet={handleImportFullPCSheet}
        canEditTeachingRows={canEditTeachingRows}
        canUseTeachingImport={canUseTeachingImport}
        clearTeachingAssignmentsForYear={clearTeachingAssignmentsForYear}
        deleteSelectedTeachingBatch={deleteSelectedTeachingBatch}
        exportTeachingAssignments={exportTeachingAssignments}
        getTeachingBatchLabel={getTeachingBatchLabel}
        handleTeachingImportFile={handleTeachingImportFile}
        hasChanges={hasChanges}
        hasTeachingBatches={hasTeachingBatches}
        isEditingActiveTeachingBatch={isEditingActiveTeachingBatch}
        isEditingMainTeaching={isEditingMainTeaching}
        isEditingTeachingSummary={isEditingTeachingSummary}
        isTeachingSummaryView={isTeachingSummaryView}
        isThdTeachingPanel={isThdTeachingPanel}
        newTeachersComparedToPreviousBatch={newTeachersComparedToPreviousBatch}
        openTeachingImportFilePicker={openTeachingImportFilePicker}
        openTeachingTimeSettings={openTeachingTimeSettings}
        saveAll={saveAll}
        selectedSchoolYear={selectedSchoolYear}
        selectedTeachingBatchId={selectedTeachingBatchId}
        setEditingTeachingBatchId={setEditingTeachingBatchId}
        setSelectedTeachingBatchId={setSelectedTeachingBatchId}
        setShowNewTeachersModal={setShowNewTeachersModal}
        setShowTeachingCheckModal={setShowTeachingCheckModal}
        setShowTeachingExportMenu={setShowTeachingExportMenu}
        setShowTeachingFilterMenu={setShowTeachingFilterMenu}
        setShowTeachingMoneyColumns={setShowTeachingMoneyColumns}
        setTeachingFilter={setTeachingFilter}
        setTeachingImportEndDate={setTeachingImportEndDate}
        setTeachingImportStartDate={setTeachingImportStartDate}
        showTeachingExportMenu={showTeachingExportMenu}
        showTeachingFilterMenu={showTeachingFilterMenu}
        showTeachingMoneyColumns={showTeachingMoneyColumns}
        teachingBatchesForSelectedYear={teachingBatchesForSelectedYear}
        teachingFilter={teachingFilter}
        teachingFilterLabel={teachingFilterLabel}
        teachingFilterOptions={teachingFilterOptions}
        teachingImportEndDate={teachingImportEndDate}
        teachingImportFileRef={teachingImportFileRef}
        teachingImportStartDate={teachingImportStartDate}
        teachingSummaryDirty={teachingSummaryDirty}
        updateTeachingSummaryFromBatches={updateTeachingSummaryFromBatches}
      />
      <div
        ref={teachingAssignmentScrollRef}
        onScroll={handleTeachingAssignmentScroll}
        className="teaching-assignment-scroll overflow-auto rounded-b-none rounded-t-none border-x border-b border-slate-200 bg-white px-2 pb-2 pt-0 shadow-sm"
      >
        <table className={`teaching-assignment-table w-full ${tableMinWidth} border-collapse text-xs`}>
          <TeachingAssignmentsTableHeader
            isThdTeachingPanel={isThdTeachingPanel}
            showTeachingFinancialColumns={showTeachingFinancialColumns}
            showTeachingSchoolColumns={showTeachingSchoolColumns}
          />
          <tbody>
            {visibleTeachingRows.length === 0 && <TeachingAssignmentsEmptyRow />}
            {renderedTeachingRows.map(({ row, sourceIndex }, index) => {
              const rowMeta = visibleTeachingRowMeta[index] || {};
              const teacherKey = visibleTeachingRowTeacherKeys[index] || '';
              const teacherDetails = teacherKey ? teachingTeacherDetailsByKey.get(teacherKey) : null;
              const periodsPerClassWeek = getPeriodsPerClassWeek(row);
              const totalPerWeek = getVisibleWeeklyPeriods(row);
              const totalPeriods = getTotalPeriods(row);
              const numericTotalPeriods = Number(totalPeriods) || 0;
              const noteText = getAssignmentNote(row);
              const noteInputValue = row.note ? mergeTeachingNote(noteText, row.note) : noteText;
              const liveCheckNote = isThdTeachingPanel ? (rowMeta.liveCheckNote || row.pastedNote || '') : (row.pastedNote || '');
              const hasVisibleTeachingRow = Boolean(row.teacherName || row.assignment || row.specialty);
              const showSummaryRow = hasVisibleTeachingRow ? rowMeta.isGroupEnd : true;
              const isContinuationRow = rowMeta.isContinuation;
              const teacherSequenceNumber = isContinuationRow ? '' : rowMeta.sequenceNumber;
              const teacherSuggestions = activeTeacherPickerIndex === sourceIndex ? getTeacherSuggestions(row.teacherName) : [];
              const currentGroupBounds = teachingGroupBoundsBySourceIndex.get(sourceIndex) || { start: sourceIndex, end: sourceIndex };
              const canMoveTeacherUp = currentGroupBounds.start > 0;
              const canMoveTeacherDown = currentGroupBounds.end < teachingRowsForSelectedYear.length - 1;
              const teacherYearTotal = teacherKey ? (teachingTeacherTotalsByKey.yearTotals.get(teacherKey) || '') : '';
              const teacherSchoolPeriods = teacherDetails?.schoolPeriods || 0;
              const teacherGrandTotal = (Number(teacherYearTotal) || 0) + teacherSchoolPeriods;
              const teacherMoneyRate = teacherDetails?.moneyRate || 0;
              const assignmentMoney = numericTotalPeriods && teacherMoneyRate ? numericTotalPeriods * teacherMoneyRate : 0;
              const teacherMoneyTotal = teacherKey ? (teachingTeacherTotalsByKey.moneyTotals.get(teacherKey) || 0) : 0;
              const teacherRequiredPeriodsPerWeek = getTeachingRequiredPeriodsPerWeek(row.position);
              const teacherRequiredYearTotal = getTeachingRequiredYearTotal(row.position);
              const specialtyToneClass = getTeachingSubjectToneClass(row.specialty);
              const assignmentToneClass = getTeachingSubjectToneClass(row.assignment);
              const configuredPeriods = isThdTeachingPanel ? normalizePeriods(getConfiguredAssignmentPeriods(row.assignment, row)) : '';
              const hasAssignedClasses = getAssignmentClassList(row.className, activeAssignmentClasses).length > 0;
              const periodInputValue = configuredPeriods && hasAssignedClasses ? configuredPeriods : (row.periodsPerClassWeek || '');
              return (
                <TeachingAssignmentRow
                  key={`teaching-assignment-${sourceIndex}`}
                  row={row}
                  rowMeta={rowMeta}
                  sourceIndex={sourceIndex}
                  activeAssignmentClasses={activeAssignmentClasses}
                  activeClassPickerIndex={activeClassPickerIndex}
                  activeTeacherPickerIndex={activeTeacherPickerIndex}
                  assignmentSubjectOptions={assignmentSubjectOptions}
                  canEditTeachingRows={canEditTeachingRows}
                  canMoveTeacherDown={canMoveTeacherDown}
                  canMoveTeacherUp={canMoveTeacherUp}
                  classPickerPosition={classPickerPosition}
                  formatMoney={formatMoney}
                  isContinuationRow={isContinuationRow}
                  isTeachingSummaryView={isTeachingSummaryView}
                  isThdTeachingPanel={isThdTeachingPanel}
                  liveCheckNote={liveCheckNote}
                  noteInputValue={noteInputValue}
                  noteText={noteText}
                  periodInputValue={periodInputValue}
                  periodsPerClassWeek={periodsPerClassWeek}
                  positionOptions={positionOptions}
                  showSummaryRow={showSummaryRow}
                  showTeachingFinancialColumns={showTeachingFinancialColumns}
                  showTeachingSchoolColumns={showTeachingSchoolColumns}
                  specialtyToneClass={specialtyToneClass}
                  assignmentToneClass={assignmentToneClass}
                  teacherGrandTotal={teacherGrandTotal}
                  teacherMoneyRate={teacherMoneyRate}
                  teacherMoneyTotal={teacherMoneyTotal}
                  teacherPickerPosition={teacherPickerPosition}
                  teacherRequiredPeriodsPerWeek={teacherRequiredPeriodsPerWeek}
                  teacherRequiredYearTotal={teacherRequiredYearTotal}
                  teacherSchoolPeriods={teacherSchoolPeriods}
                  teacherSequenceNumber={teacherSequenceNumber}
                  teacherSuggestions={teacherSuggestions}
                  teacherYearTotal={teacherYearTotal}
                  totalPeriods={totalPeriods}
                  totalPerWeek={totalPerWeek}
                  assignmentMoney={assignmentMoney}
                  showAcceptCheckButton={Boolean(rowMeta.checkMismatch || rowMeta.checkAccepted)}
                  isCheckAccepted={Boolean(rowMeta.checkAccepted)}
                  acceptTeachingTeacherCheckSource={acceptTeachingTeacherCheckSource}
                  abbreviateTeachingSpecialty={abbreviateTeachingSpecialty}
                  addTeachingAssignmentForSameTeacher={addTeachingAssignmentForSameTeacher}
                  addTeachingTeacherAfterGroup={addTeachingTeacherAfterGroup}
                  deleteTeachingAssignmentRow={deleteTeachingAssignmentRow}
                  deleteTeachingTeacherGroup={deleteTeachingTeacherGroup}
                  getAssignmentClassList={getAssignmentClassList}
                  mergeTeachingNote={mergeTeachingNote}
                  moveTeachingAssignmentGroup={moveTeachingAssignmentGroup}
                  openClassPicker={openClassPicker}
                  openTeacherPicker={openTeacherPicker}
                  pickTeachingTeacher={pickTeachingTeacher}
                  setActiveClassPickerIndex={setActiveClassPickerIndex}
                  setActiveTeacherPickerIndex={setActiveTeacherPickerIndex}
                  toggleTeachingClass={toggleTeachingClass}
                  toggleTeachingClassGrade={toggleTeachingClassGrade}
                  toggleTeachingClassAll={toggleTeachingClassAll}
                  updateTeachingAssignmentRow={updateTeachingAssignmentRow}
                />
              );
            })}
            {visibleTeachingRows.length > renderedTeachingRows.length && (
              <TeachingAssignmentsLoadMoreRow
                renderedCount={renderedTeachingRows.length}
                visibleCount={visibleTeachingRows.length}
                onLoadMore={loadMoreTeachingRows}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
