import { UploadCloud, ListChecks, BarChart3, CheckCircle2, X } from 'lucide-react';
import { useState } from 'react';
import LearningMaterialTable from './LearningMaterialTable';
import LearningWeekPreview from './LearningWeekPreview';
import useAdminWorkspaceTop from '../hooks/useAdminWorkspaceTop';

function AdminCheckToolbar({ view, onClose }) {
  const { activeSchoolYear, adminCheckView, setAdminCheckView, adminCheckGrade, setAdminCheckGrade,
    adminCheckSubject, setAdminCheckSubject, adminGrades, adminSubjects,
    adminCheckUploadTotals, adminCheckMissingTotals, adminCheckLearningTotals } = view;
  const tabs = [
    { key: 'uploads', label: 'Up bài', icon: UploadCloud, count: adminCheckUploadTotals.groups },
    { key: 'missing', label: 'Bài kiểm tra', icon: ListChecks, count: adminCheckMissingTotals.missingCount },
    { key: 'learning', label: '% học', icon: BarChart3, count: `${adminCheckLearningTotals.averagePercent}%` }
  ];
  return <header className="admin-check-toolbar">
    <div className="admin-check-heading">
      <h2>Theo dõi học liệu <span>{activeSchoolYear}</span></h2>
      <button type="button" className="admin-check-close" onClick={onClose} title="Đóng theo dõi học liệu" aria-label="Đóng theo dõi học liệu"><X aria-hidden="true" /></button>
    </div>
    <div className="admin-check-controls">
      <div className="admin-check-tabs" role="group" aria-label="Nội dung kiểm tra">
        {tabs.map(({ key, label, icon: Icon, count }) => <button key={key} type="button" data-tone={key} aria-pressed={adminCheckView === key} onClick={() => setAdminCheckView(key)}>
          <Icon aria-hidden="true" /><span>{label}</span><b>{count}</b>
        </button>)}
      </div>
      <div className="admin-check-filters">
        <label>Khối <select aria-label="Lọc khối" value={adminCheckGrade} onChange={event => setAdminCheckGrade(event.target.value)}>
          <option value="all">Tất cả khối</option>{adminGrades.map(grade => <option key={grade} value={grade}>Khối {grade}</option>)}
        </select></label>
        <label>Môn <select aria-label="Lọc môn" value={adminCheckSubject} onChange={event => setAdminCheckSubject(event.target.value)}>
          <option value="all">Tất cả môn</option>{adminSubjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
        </select></label>
      </div>
    </div>
  </header>;
}

function AdminCheckSummary({ tone, title, description, items }) {
  return <div className="admin-check-summary" data-tone={tone}>
    <div><h3>{title}</h3><p>{description}</p></div>
    <dl>{items.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </div>;
}

export default function AdminCheckWorkspace({ view, onClose }) {
  const { adminCheckView, adminCheckSubmissionFilter, adminCheckUploadTotals, adminCheckUploadRows, adminCheckMissingTotals, adminCheckMissingMatrix, adminCheckLearningTotals, adminCheckLearningRows, getGradeFromClassName, setAdminCheckSubmissionFilter } = view;
  const workspaceTop = useAdminWorkspaceTop();
  const [selectedWeek, setSelectedWeek] = useState(null);
  return (
            <div className="admin-check-workspace" style={{ top: workspaceTop, '--admin-check-top': `${workspaceTop}px` }} role="region" aria-label="Theo dõi học liệu">
              <div className="admin-check-layout">
                <AdminCheckToolbar view={view} onClose={onClose} />
                <div className="admin-check-body"><div className="admin-check-panels">
                  <div className={`${adminCheckView === 'uploads' ? '' : 'hidden'} admin-check-panel rounded-2xl border border-amber-100 bg-white p-3 shadow-sm`}>
                    <AdminCheckSummary tone="uploads" title="Tình hình học liệu" description="Tài liệu, bài học, đề kiểm tra đã phát" items={[[adminCheckUploadTotals.groups, "khối/môn"], [adminCheckUploadTotals.materialCount, "tài liệu"], [adminCheckUploadTotals.noteCount, "bài học"], [adminCheckUploadTotals.quizCount, "đề"]]} />
                    <LearningMaterialTable rows={adminCheckUploadRows} onOpenLesson={(row, lesson) => setSelectedWeek({ row, lesson })} />
                  </div>
                  <div className={`${adminCheckView === 'missing' ? '' : 'hidden'} admin-check-panel rounded-2xl border border-rose-100 bg-white p-3 shadow-sm`}>
                    <AdminCheckSummary tone="missing" title="Bài kiểm tra" description="Theo dõi tình trạng làm bài của học sinh" items={[[adminCheckMissingTotals.missingCount, "còn thiếu"], [adminCheckMissingTotals.quizCount, "đề"], [adminCheckMissingTotals.submittedCount, "đã nộp"], [adminCheckMissingTotals.expectedCount, "cần nộp"]]} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-0.5 shadow-inner">
                        {[
                          { key: 'all', label: 'Tất cả', count: adminCheckMissingMatrix.rows.length },
                          { key: 'missing', label: 'Còn thiếu', count: adminCheckMissingMatrix.rows.filter(row => row.missingCount > 0).length },
                          { key: 'done', label: 'Đã đủ', count: adminCheckMissingMatrix.rows.filter(row => row.expectedCount > 0 && row.missingCount === 0).length }
                        ].map(option => (
                          <button
                            key={`admin-check-submission-filter-${option.key}`}
                            type="button"
                            onClick={() => setAdminCheckSubmissionFilter(option.key)}
                            className={`h-7 rounded-full px-3 text-[10px] font-semibold uppercase transition-all ${adminCheckSubmissionFilter === option.key ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}
                          >
                            {option.label} <span className={adminCheckSubmissionFilter === option.key ? 'text-white/75' : 'text-slate-400'}>{option.count}</span>
                          </button>
                        ))}
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        {adminCheckMissingMatrix.visibleRows.length}/{adminCheckMissingMatrix.rows.length} học sinh • {adminCheckMissingMatrix.columns.length} bài kiểm tra
                      </div>
                    </div>
                    <div className="admin-check-table-scroll mt-2 overflow-auto rounded-xl border border-slate-200">
                      {adminCheckMissingMatrix.columns.length === 0 ? (
                        <div className="p-5 text-center text-sm font-bold text-slate-400">Chưa có bài kiểm tra đã phát theo bộ lọc này.</div>
                      ) : (
                        <table className="min-w-full text-sm">
                          <thead className="sticky top-0 z-10 bg-rose-50/70 text-[11px] uppercase text-rose-900">
                            <tr>
                              <th className="sticky left-0 z-20 min-w-[170px] border-r border-rose-100 bg-rose-50 px-3 py-2 text-left font-semibold">Học sinh</th>
                              {adminCheckMissingMatrix.columns.map(column => (
                                <th key={`quiz-col-${column.id}`} className="min-w-[86px] border-r border-rose-100 px-2 py-2 text-center font-semibold" title={column.title}>
                                  <div>{column.label}</div>
                                  <div className="mt-0.5 text-[9px] text-rose-700/70">{column.subject}</div>
                                </th>
                              ))}
                              <th className="min-w-[90px] px-2 py-2 text-center font-semibold">Tổng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {adminCheckMissingMatrix.visibleRows.length === 0 ? (
                              <tr><td colSpan={adminCheckMissingMatrix.columns.length + 2} className="px-3 py-5 text-center text-sm font-bold text-slate-400">Không có học sinh theo bộ lọc này.</td></tr>
                            ) : adminCheckMissingMatrix.visibleRows.map(row => {
                              const gradeValue = getGradeFromClassName(row.student.className || row.student.grade || '') || '';
                              const className = String(row.student.className || '').trim();
                              const showClassName = className && className !== String(gradeValue);
                              return (
                                <tr key={`quiz-row-${row.key}`} className={row.missingCount ? 'bg-rose-50/30' : 'bg-emerald-50/25'}>
                                  <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2 font-medium text-slate-800">
                                    <div>{row.student.fullName || row.student.studentName || 'Học sinh'}</div>
                                    <div className="text-[10px] font-bold text-slate-400">Khối {gradeValue || '?'}{showClassName ? ` • ${className}` : ''}</div>
                                  </td>
                                  {row.cells.map(cell => (
                                    <td key={`quiz-cell-${row.key}-${cell.columnId}`} className="border-r border-slate-100 px-2 py-1.5 text-center">
                                      {!cell.applicable ? <span className="text-slate-300">—</span> : cell.submitted ? (
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" title="Đã làm">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                        </span>
                                      ) : (
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200" title="Chưa làm">
                                          <X className="h-3.5 w-3.5" />
                                        </span>
                                      )}
                                    </td>
                                  ))}
                                  <td className="px-2 py-2 text-center">
                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${row.missingCount ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200' : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'}`}>
                                      {row.submittedCount}/{row.expectedCount}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`${adminCheckView === 'learning' ? '' : 'hidden'} admin-check-panel rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm`}>
                  <AdminCheckSummary tone="learning" title="% học của học sinh" description="Mở bài đủ thời gian và qua hỏi đáp nhanh" items={[[`${adminCheckLearningTotals.averagePercent}%`, "trung bình"], [adminCheckLearningTotals.targetStudentCount, "có học liệu"], [adminCheckLearningTotals.lowCount, "dưới 50%"]]} />
                    <div className="admin-check-table-scroll mt-2 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-emerald-50/70 text-[11px] uppercase text-emerald-900">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Khối</th>
                          <th className="px-3 py-2 text-left font-semibold">Học sinh</th>
                          <th className="px-3 py-2 text-center font-semibold">% học</th>
                          <th className="px-3 py-2 text-center font-semibold">Bài đã mở</th>
                          <th className="px-3 py-2 text-center font-semibold">Hỏi đáp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {adminCheckLearningRows.length === 0 ? (
                          <tr><td colSpan={5} className="px-3 py-6 text-center text-sm font-bold text-slate-400">Chưa có danh sách học sinh theo bộ lọc này.</td></tr>
                        ) : adminCheckLearningRows.map(row => {
                          const className = String(row.student.className || '').trim();
                          const showClassName = className && className !== String(row.grade);
                          return (
                            <tr key={row.key} className={row.targetCount === 0 ? 'bg-slate-50/45 text-slate-400' : 'hover:bg-slate-50'}>
                              <td className="px-3 py-2 font-medium">Khối {row.grade}</td>
                              <td className="px-3 py-2 font-medium text-slate-800">
                                {row.student.fullName || row.student.studentName || 'Học sinh'}{showClassName ? ` - ${className}` : ''}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex min-w-14 justify-center rounded-full px-3 py-1 text-xs font-semibold ${row.targetCount === 0 ? 'bg-slate-100 text-slate-500' : row.percent < 50 ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200' : row.percent < 80 ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200' : 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'}`}>
                                  {row.targetCount ? `${row.percent}%` : '-'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center font-medium text-slate-700">{row.theoryDoneCount}/{row.targetCount}</td>
                              <td className="px-3 py-2 text-center font-medium text-slate-700">{row.quickTargetCount ? `${row.quickDoneCount}/${row.quickTargetCount}` : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              </div>
              {selectedWeek && <LearningWeekPreview row={selectedWeek.row} lesson={selectedWeek.lesson} onClose={() => setSelectedWeek(null)} />}
            </div>
  );
}
