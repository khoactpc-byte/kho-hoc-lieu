import { useState } from 'react';

function WeekLinks({ row, lessons, missing, onOpenLesson }) {
  const [expanded, setExpanded] = useState(false);
  const render = lesson => <button key={lesson} type="button" className={`learning-week-link${missing ? ' is-missing' : ''}`}
    aria-label={`${missing ? 'Thêm học liệu' : 'Mở học liệu'} ${row.subject} khối ${row.grade} tuần ${lesson}`}
    title={`${missing ? 'Chưa có học liệu' : row.subject} · Tuần ${lesson}`} onClick={() => onOpenLesson(row, lesson, missing)}>{lesson}</button>;
  if (!lessons.length) return <span className="text-slate-400">—</span>;
  return <div className="learning-week-links">{(expanded ? lessons : lessons.slice(0, 8)).map(render)}{lessons.length > 8 && <button type="button" className="learning-week-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Thu gọn' : `+${lessons.length - 8}`}</button>}</div>;
}

function WeekCount({ row, onOpenLesson }) {
  const [expanded, setExpanded] = useState(false);
  if (!row.lessonCount) return <span>0</span>;
  return <div><button type="button" className="learning-week-count" aria-label={`${row.lessonCount} tuần đã có ${row.subject} khối ${row.grade}`} aria-expanded={expanded}
    title="Bấm để xem các tuần và mở học liệu" onClick={() => setExpanded(value => !value)}>{row.lessonCount}</button>
    {expanded && <WeekLinks row={row} lessons={row.lessonList} onOpenLesson={onOpenLesson} />}</div>;
}

export default function LearningMaterialTable({ rows, onOpenLesson, allowAdd = false, gradeLabel }) {
  const showCampus = new Set(rows.map(row => row.schoolCode)).size > 1;
  return <div className="admin-check-table-scroll mt-2 rounded-xl border border-slate-200">
    <table className="learning-material-table min-w-full text-sm">
      <thead><tr><th>{gradeLabel ? 'Lớp' : 'Khối'}</th><th>Môn</th>{showCampus && <th>Cơ sở</th>}<th title="Tài liệu">TL</th><th>Bài</th><th>KT</th><th className="learning-week-column">Tuần/bài đã có</th>{allowAdd && <th>Chưa có</th>}</tr></thead>
      <tbody>{!rows.length ? <tr><td colSpan={6 + Number(showCampus) + Number(allowAdd)} className="text-center text-slate-400">Chưa có học liệu theo bộ lọc này.</td></tr> : rows.map(row => <tr key={row.key}>
        <td className="whitespace-nowrap">{gradeLabel ? gradeLabel(row.grade) : `Khối ${row.grade}`}</td><td>{row.subject}</td>{showCampus && <td>{row.schoolCode}</td>}
        <td className="text-center text-amber-700">{row.materialCount}</td><td className="text-center text-blue-700">{row.noteCount}</td><td className="text-center text-rose-700">{row.quizCount}</td>
        <td className="learning-week-column"><WeekCount row={row} onOpenLesson={onOpenLesson} /></td>
        {allowAdd && <td><WeekLinks row={row} lessons={row.missingLessons} missing onOpenLesson={onOpenLesson} /></td>}
      </tr>)}</tbody>
    </table>
  </div>;
}
