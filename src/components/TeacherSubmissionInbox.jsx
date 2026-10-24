import { useState } from 'react';
import { SUBMISSION_KINDS, unreadSubmission } from '../utils/teacherSubmissionInbox';
import { teacherClassLabel } from '../utils/teacherPresentation';

const submissionDateLabel = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : 'Chưa có thời gian';

export default function TeacherSubmissionInbox({ rows, profile, seen, onSeen, renderWork, onGrade }) {
  const [kind, setKind] = useState('all');
  const [state, setState] = useState('all'), [search, setSearch] = useState(''), [workKey, setWorkKey] = useState('');
  const filtered = rows.filter(row => (kind === 'all' || row.kind === kind) && (state === 'all' || (state === 'unread' ? unreadSubmission(row, seen) : state === 'pending' ? row.pending : row.status === 'Đã chấm'))
    && `${row.student.fullName} ${row.student.accessCode || ''} ${row.title}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const work = rows.find(row => row.key === workKey);
  const unreadCount = rows.filter(row => unreadSubmission(row, seen)).length;
  return <section aria-label="Bài học sinh nộp" className="teacher-submission-inbox">
    <div className="teacher-inbox-summary"><p>{rows.length} bài nộp · <b>{unreadCount} chưa xem</b> · {rows.filter(row => row.pending).length} chờ chấm</p>
      <button type="button" disabled={!unreadCount} onClick={() => onSeen(rows)}>Đánh dấu tất cả đã xem</button></div>
    <div className="admin-check-filters teacher-inbox-filters">
      <label>Loại bài <select aria-label="Loại bài nộp" value={kind} onChange={e => setKind(e.target.value)}><option value="all">Tất cả loại</option>{SUBMISSION_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Trạng thái <select aria-label="Trạng thái bài nộp" value={state} onChange={e => setState(e.target.value)}><option value="all">Tất cả</option><option value="unread">Chưa xem</option><option value="pending">Chờ chấm</option><option value="graded">Đã chấm</option></select></label>
      <input aria-label="Tìm bài học sinh nộp" placeholder="Tên, mã học sinh hoặc tên đề" value={search} onChange={e => setSearch(e.target.value)} />
    </div>
    <p className="teacher-inbox-note">Bài mới nhất ở trên. Trạng thái đã xem lưu trên trình duyệt này. Điểm AI là điểm nháp.</p>
    <div className="teacher-quiz-table-scroll"><table><thead><tr><th>Học sinh</th><th>Lớp / Môn</th><th>Loại bài / Đề</th><th>Nộp lúc</th><th>Điểm</th><th>Trạng thái</th><th>Bài làm</th></tr></thead>
      <tbody>{!filtered.length ? <tr><td colSpan={7}>Chưa có bài nộp theo bộ lọc này.</td></tr> : filtered.map(row => <tr key={row.key} className={unreadSubmission(row, seen) ? 'is-unread' : ''}>
        <td><strong>{row.student.fullName}</strong><small>{row.student.accessCode || 'Chưa có mã'}{unreadSubmission(row, seen) ? ' · Mới' : ''}</small></td>
        <td>{teacherClassLabel(profile, row.grade)}<small>{row.subject}</small></td>
        <td>{row.kindLabel}<small>{row.lesson !== 'undefined' && row.lesson ? `Tuần ${row.lesson} · ` : ''}{row.title}</small></td>
        <td>{submissionDateLabel(row.submittedAt)}{row.late && <small className="text-amber-700">Nộp sau hạn</small>}</td>
        <td>{row.result && <span>TN: {row.quizScore}</span>}{row.essay && <small>TL: {row.essayScore}{row.pending && row.essay.aiScore != null ? ' (AI nháp)' : ''}</small>}</td>
        <td>{row.status}</td><td><button type="button" className="teacher-quiz-link" onClick={() => { setWorkKey(row.key); onSeen([row]); }}>Xem bài</button></td>
      </tr>)}</tbody></table></div>
    {work && <><div className="teacher-inbox-work-meta"><p>{work.kindLabel} · {teacherClassLabel(profile, work.grade)} · {work.subject} · {work.title}</p>
      <p>Nộp lúc: {submissionDateLabel(work.submittedAt)} · {work.attempts.length} lượt/phần nộp · Hạn nộp: {work.dueAt ? submissionDateLabel(work.dueAt) : 'Chưa đặt'}</p>
      {work.canGrade && <button type="button" onClick={() => { onSeen([work]); onGrade(work); }}>Mở chấm điểm</button>}</div>
      {renderWork(work, () => setWorkKey(''))}</>}
  </section>;
}
