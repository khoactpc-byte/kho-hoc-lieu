import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { BookOpen, Download, Printer, Save, X } from 'lucide-react';
import { appId, db } from '../config/firebase';
import { useScorebookDraft } from '../hooks/useScorebookDraft';
import { educationGrades, belongsToEducationLevel } from '../utils/educationLevels';
import { compareSchoolRosterStudents, getSchoolGrade, getSchoolName, getStudentSchoolCode, normalizeSchoolYearKey, SCHOOL_OPTIONS } from '../utils/schoolClasses';
import { resolveScorebookDocument, scorebookDocumentId } from '../utils/scorebookArchive';
import { linkedProfileRecords } from '../utils/studentProfileHistory';
import { PRIMARY_SCOREBOOK_SOURCE, PRIMARY_TERMS, PRIMARY_QUALITIES, PRIMARY_SUBJECT_LEVELS, PRIMARY_QUALITY_LEVELS, PRIMARY_YEAR_LEVELS,
  primarySubjectsForGrade, primaryHasTest, primaryCellKey, primaryValue, normalizePrimaryScore, primaryBookScope } from '../utils/primaryAcademic';
const LegacyWorkspace = lazy(() => import('./ScorebookWorkspace'));

const searchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
const csvCell = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
const inputClass = 'h-8 w-full min-w-20 rounded border border-slate-200 bg-white px-2 text-xs disabled:bg-slate-50';

export default function PrimaryAcademicWorkspace({ grade = '1', initialMode = 'scorebook', initialSchoolCode = 'NAN', currentSchoolYear,
  students = [], user, canWrite = true, principalName = '', nanTeachers = [], tqkTeachers = [], classTeacherAssignments = {},
  draftDocuments, allowedGrades = educationGrades('primary'), allowedSubjects = null, lockedSchool = false, onGradeChange, onClose, showNotification }) {
  const [mode, setMode] = useState(initialMode);
  const [schoolCode, setSchoolCode] = useState(initialSchoolCode);
  const [term, setTerm] = useState('end2');
  const [section, setSection] = useState('subjects');
  const [className, setClassName] = useState('');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [books, setBooks] = useState({ loaded: false, documents: [] });
  const [bookSelections, setBookSelections] = useState({});
  const [saving, setSaving] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const printable = useRef(null);
  const scope = useMemo(() => ({ schoolYear: currentSchoolYear, grade, schoolCode, sourceFile: PRIMARY_SCOREBOOK_SOURCE }), [currentSchoolYear, grade, schoolCode]);
  const canonicalId = scorebookDocumentId(scope);
  const resolved = useMemo(() => resolveScorebookDocument(books.documents, scope, bookSelections[canonicalId]), [books, scope, bookSelections, canonicalId]);
  const draft = useScorebookDraft(resolved.id, showNotification, draftDocuments);
  const editable = canWrite && draft.loaded && books.loaded && !resolved.needsSelection && !saving;
  const subjects = primarySubjectsForGrade(grade);
  const canEditField = (subject, type) => editable && (!allowedSubjects || allowedSubjects.includes(type === 'quality' || subject === 'summary'
    ? 'Chủ nhiệm' : subjects.find(item => item.key === subject)?.label));
  useEffect(() => setMode(initialMode), [initialMode]);
  useEffect(() => { setClassName(''); setStudentId(''); setSearch(''); }, [grade, schoolCode, currentSchoolYear]);
  useEffect(() => onSnapshot(lockedSchool ? query(collection(db, 'artifacts', appId, 'public', 'data', 'scorebooks'), where('schoolCode', '==', schoolCode), where('grade', '==', String(grade)))
    : collection(db, 'artifacts', appId, 'public', 'data', 'scorebooks'), snapshot => {
    setBooks({ loaded: true, documents: snapshot.docs.map(item => ({ ...item.data(), id: item.id })) });
  }, error => { setBooks(previous => ({ ...previous, loaded: false })); showNotification?.(`Chưa tải được sổ tiểu học: ${error.message}`, 'error'); }), [showNotification, lockedSchool, schoolCode, grade]);

  const roster = useMemo(() => students.filter(student => belongsToEducationLevel(student, 'primary')
    && getSchoolGrade(student.className || student.grade) === String(grade)
    && getStudentSchoolCode(student) === schoolCode
    && normalizeSchoolYearKey(student.schoolYear || currentSchoolYear) === normalizeSchoolYearKey(currentSchoolYear)).sort(compareSchoolRosterStudents), [students, grade, schoolCode, currentSchoolYear]);
  const classOptions = [...new Set(roster.map(student => student.className).filter(Boolean))];
  const visible = roster.filter(student => (!className || student.className === className) && searchText(`${student.fullName} ${student.accessCode || ''}`).includes(searchText(search)));
  const student = visible.find(item => item.id === studentId) || visible[0];
  const previousRecords = useMemo(() => student ? linkedProfileRecords(student, students, student)
    .filter(record => belongsToEducationLevel(record, 'primary') && record.schoolYear && normalizeSchoolYearKey(record.schoolYear) < normalizeSchoolYearKey(currentSchoolYear))
    .sort((a, b) => String(a.schoolYear).localeCompare(String(b.schoolYear))) : [], [student, students, currentSchoolYear]);
  const legacyExists = books.documents.some(book => book.sourceFile !== PRIMARY_SCOREBOOK_SOURCE && String(book.grade) === String(grade)
    && normalizeSchoolYearKey(book.schoolYear) === normalizeSchoolYearKey(currentSchoolYear) && getStudentSchoolCode(book) === schoolCode && !book.campusNormalization?.archivedTo);

  const update = (record, subject, field, value, termKey = term) => {
    if (!canEditField(subject, field)) return;
    const key = primaryCellKey(record, termKey, subject, field);
    if (!key) return;
    draft.setEdits(previous => {
      const next = { ...previous };
      if (value === '') delete next[key]; else next[key] = value;
      return next;
    });
  };
  const save = async () => {
    if (!editable || !user) return;
    setSaving(true);
    try {
      await draft.save({ ...scope, educationLevel: 'primary', schoolName: getSchoolName(schoolCode), authorId: user.uid, updatedAt: Date.now() });
      showNotification?.('Đã lưu sổ điểm và học bạ tiểu học.');
    } catch (error) { showNotification?.(`Chưa lưu được: ${error.message}`, 'error'); }
    finally { setSaving(false); }
  };
  const value = (record, subject, field, termKey = term, edits = draft.edits) => primaryValue(edits, record, termKey, subject, field);
  const field = (record, subject, type, levels, termKey = term) => <select aria-label={`${record.fullName} · ${subject} · ${type} · ${termKey}`} value={value(record, subject, type, termKey)} disabled={!canEditField(subject, type)}
    onChange={event => update(record, subject, type, event.target.value, termKey)} className={inputClass}>
    <option value="">Chưa đánh giá</option>{levels.map(level => <option key={level}>{level}</option>)}
  </select>;
  const scoreInput = (record, subject, termKey = term) => <input type="text" inputMode="numeric" aria-label={`Điểm ${subject.label} · ${record.fullName} · ${termKey}`}
    value={value(record, subject.key, 'score', termKey)} disabled={!canEditField(subject.key, 'score')} className={`${inputClass} max-w-24 text-center`}
    onChange={event => {
      const score = normalizePrimaryScore(event.target.value);
      if (score == null) { showNotification?.('Điểm kiểm tra tiểu học là số nguyên từ 0 đến 10.', 'error'); return; }
      update(record, subject.key, 'score', score, termKey);
    }} />;
  const exportData = () => {
    const targets = mode === 'transcript' ? (student ? [student] : []) : visible;
    const rows = [['Năm học', 'Cơ sở', 'Lớp', 'Mã học sinh', 'Họ và tên', 'Thời điểm', 'Nội dung', 'Điểm', 'Mức đánh giá', 'Nhận xét']];
    targets.forEach(record => PRIMARY_TERMS.forEach(period => {
      const prefix = [currentSchoolYear, getSchoolName(schoolCode), record.className, record.accessCode, record.fullName, period.label];
      subjects.forEach(subject => rows.push([...prefix, subject.label, value(record, subject.key, 'score', period.key), value(record, subject.key, 'level', period.key), value(record, subject.key, 'comment', period.key)]));
      PRIMARY_QUALITIES.forEach(item => rows.push([...prefix, item.label, '', value(record, item.key, 'quality', period.key), '']));
      rows.push([...prefix, 'Kết quả giáo dục', '', value(record, 'summary', 'level', period.key), value(record, 'summary', 'comment', period.key)]);
      if (period.key === 'end2') rows.push([...prefix, 'Kết luận lên lớp / Hoàn thành chương trình', '', '', value(record, 'summary', 'promotion', period.key)]);
    }));
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `tieu-hoc-${mode}-${currentSchoolYear}-khoi-${grade}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) { showNotification?.('Cho phép mở cửa sổ in trong trình duyệt.', 'error'); return; }
    const content = printable.current.cloneNode(true);
    content.querySelectorAll('input, select, textarea').forEach(input => { const span = document.createElement('span'); span.textContent = input.value; input.replaceWith(span); });
    content.querySelectorAll('button').forEach(button => { const span = document.createElement('span'); span.textContent = button.textContent; button.replaceWith(span); });
    popup.document.open();
    popup.document.write('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Học vụ tiểu học</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial;font-size:11px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #777;padding:5px;text-align:left}h1,h2{text-align:center}input,select{border:0}.print-page{break-before:page}button{display:none}</style></head><body></body></html>');
    popup.document.body.appendChild(content); popup.document.close(); popup.focus(); popup.print();
  };
  const subjectTable = (record, edits, editableCurrent = false) => <table className="w-full border-collapse text-xs" aria-label={`Kết quả môn học ${record.fullName} ${record.schoolYear || currentSchoolYear}`}>
    <thead><tr><th className="border p-2">Môn học / Hoạt động</th>{PRIMARY_TERMS.map(period => <th key={period.key} className="border p-2">{period.label}</th>)}</tr></thead>
    <tbody>{primarySubjectsForGrade(getSchoolGrade(record.className || record.grade)).map(subject => <tr key={subject.key}>
      <td className="border p-2">{subject.label}</td>{PRIMARY_TERMS.map(period => <td key={period.key} className="border p-2">
        {editableCurrent ? <div className="space-y-1">{primaryHasTest(subject, period.key, grade) && scoreInput(record, subject, period.key)}{field(record, subject.key, 'level', PRIMARY_SUBJECT_LEVELS, period.key)}
          <input aria-label={`Nhận xét ${subject.label} · ${record.fullName} · ${period.key}`} value={value(record, subject.key, 'comment', period.key)} disabled={!canEditField(subject.key, 'comment')} onChange={event => update(record, subject.key, 'comment', event.target.value, period.key)} className={inputClass} placeholder="Nhận xét" /></div>
          : <>{primaryHasTest(subject, period.key, getSchoolGrade(record.className || record.grade)) && <div>Điểm: {primaryValue(edits, record, period.key, subject.key, 'score') || '—'}</div>}<div>{primaryValue(edits, record, period.key, subject.key, 'level') || '—'}</div><div>{primaryValue(edits, record, period.key, subject.key, 'comment')}</div></>}
      </td>)}</tr>)}</tbody>
  </table>;

  return <div className="fixed inset-x-0 top-[114px] bottom-0 z-[140] flex flex-col bg-slate-50 sm:top-[84px]" aria-label="Học vụ tiểu học">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white p-3 text-sm">
      <BookOpen className="h-5 w-5 text-sky-700" /><h1 className="mr-auto">{mode === 'transcript' ? 'Học bạ' : 'Sổ điểm'} Tiểu học · {currentSchoolYear}</h1>
      <button onClick={() => setMode(mode === 'transcript' ? 'scorebook' : 'transcript')} className="rounded border px-3 py-1.5">{mode === 'transcript' ? 'Sổ điểm' : 'Học bạ'}</button>
      <button onClick={save} disabled={!editable || !draft.isDirty} className="flex items-center gap-1 rounded bg-sky-700 px-3 py-1.5 text-white disabled:opacity-40"><Save className="h-4 w-4" />{saving ? 'Đang lưu…' : 'Lưu'}</button>
      <button onClick={exportData} disabled={!draft.loaded || !books.loaded || resolved.needsSelection || !visible.length} className="flex items-center gap-1 rounded border px-3 py-1.5"><Download className="h-4 w-4" />Xuất Excel (CSV)</button>
      <button onClick={print} disabled={!draft.loaded || !books.loaded || resolved.needsSelection || !visible.length} className="flex items-center gap-1 rounded border px-3 py-1.5"><Printer className="h-4 w-4" />In / PDF</button>
      <button aria-label="Đóng học vụ tiểu học" onClick={onClose} className="rounded border p-2"><X className="h-4 w-4" /></button>
    </div>
    <div className="flex shrink-0 flex-wrap gap-3 border-b bg-white p-3 text-xs">
      <label>Cơ sở: <select aria-label="Cơ sở tiểu học" value={schoolCode} disabled={lockedSchool} onChange={event => setSchoolCode(event.target.value)} className={inputClass}>{SCHOOL_OPTIONS.map(school => <option key={school.code} value={school.code}>{school.name}</option>)}</select></label>
      <label>Khối: <select aria-label="Khối tiểu học" value={grade} onChange={event => onGradeChange?.(event.target.value)} className={inputClass}>{allowedGrades.filter(item => educationGrades('primary').includes(String(item))).map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Lớp: <select aria-label="Lớp tiểu học" value={className} onChange={event => setClassName(event.target.value)} className={inputClass}><option value="">Tất cả</option>{classOptions.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Tìm học sinh: <input aria-label="Tìm học sinh tiểu học" value={search} onChange={event => setSearch(event.target.value)} className={inputClass} /></label>
      {mode === 'scorebook' ? <>
        <label>Thời điểm: <select aria-label="Thời điểm đánh giá" value={term} onChange={event => setTerm(event.target.value)} className={inputClass}>{PRIMARY_TERMS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label>Nội dung: <select aria-label="Nội dung đánh giá" value={section} onChange={event => setSection(event.target.value)} className={inputClass}><option value="subjects">Môn học</option><option value="qualities">Phẩm chất, năng lực</option><option value="summary">Tổng hợp kết quả</option></select></label>
      </> : <label>Học sinh: <select aria-label="Học sinh trong học bạ tiểu học" value={student?.id || ''} onChange={event => setStudentId(event.target.value)} className={inputClass}>{visible.map(item => <option key={item.id} value={item.id}>{item.fullName} · {item.className}</option>)}</select></label>}
      {legacyExists && !lockedSchool && <button onClick={() => setShowLegacy(true)} className="self-end rounded border px-3 py-2">Sổ đã nhập trước đây</button>}
      <span className="self-end text-slate-500">{draft.isDirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'} · {visible.length} học sinh</span>
    </div>
    {resolved.candidates.length > 1 && <label className="bg-amber-50 p-2 text-xs">Bản sổ đã lưu: <select value={resolved.document?.id || ''} onChange={event => setBookSelections(previous => ({ ...previous, [canonicalId]: event.target.value }))}><option value="">Chọn bản sổ</option>{resolved.candidates.map(book => <option key={book.id} value={book.id}>{book.id}</option>)}</select></label>}
    {!canWrite && <p className="bg-amber-50 p-2 text-xs">Năm học đang khóa nhập liệu.</p>}
    <div className="min-h-0 flex-1 overflow-auto p-3" ref={printable}>
      <h2 className="mb-3 text-center text-lg">{getSchoolName(schoolCode)} · {mode === 'transcript' ? 'HỌC BẠ TIỂU HỌC' : 'SỔ THEO DÕI, ĐÁNH GIÁ TIỂU HỌC'} · {currentSchoolYear}</h2>
      {!visible.length ? <p>Chưa có học sinh tiểu học trong bộ lọc này.</p> : mode === 'scorebook' ? <table className="w-full min-w-[960px] border-collapse bg-white text-xs" aria-label="Sổ điểm tiểu học">
        <thead className="sticky top-0 bg-sky-700 text-white"><tr><th className="border p-2">Học sinh</th><th className="border p-2">Lớp</th>
          {(section === 'subjects' ? subjects : section === 'qualities' ? PRIMARY_QUALITIES : [{ key: 'summary', label: 'Kết quả giáo dục' }]).map(item => <th key={item.key} className="min-w-[190px] border p-2">{item.label}</th>)}</tr></thead>
        <tbody>{visible.map(record => <tr key={record.id} className="even:bg-slate-50"><td className="border p-2"><button onClick={() => { setStudentId(record.id); setMode('transcript'); }} className="text-sky-700">{record.fullName}</button>{record.status === 'dropped' && <div className="text-rose-600">Bỏ học</div>}</td><td className="border p-2">{record.className}</td>
          {(section === 'subjects' ? subjects : section === 'qualities' ? PRIMARY_QUALITIES : [{ key: 'summary' }]).map(item => <td key={item.key} className="border p-2"><div className="space-y-1">
            {section === 'subjects' && primaryHasTest(item, term, grade) && scoreInput(record, item)}
            {field(record, item.key, section === 'qualities' ? 'quality' : 'level', section === 'subjects' ? PRIMARY_SUBJECT_LEVELS : section === 'qualities' ? PRIMARY_QUALITY_LEVELS : PRIMARY_YEAR_LEVELS)}
            {section !== 'qualities' && <input aria-label={`Nhận xét ${item.label || 'kết quả'} · ${record.fullName}`} value={value(record, item.key, 'comment')} disabled={!canEditField(item.key, 'comment')} onChange={event => update(record, item.key, 'comment', event.target.value)} className={inputClass} placeholder="Nhận xét" />}
            {section === 'summary' && <input aria-label={`Lên lớp · ${record.fullName}`} value={value(record, 'summary', 'promotion')} disabled={!canEditField('summary', 'promotion')} onChange={event => update(record, 'summary', 'promotion', event.target.value)} placeholder={grade === '5' ? 'Hoàn thành chương trình tiểu học…' : 'Lên lớp, đánh giá bổ sung…'} className={inputClass} />}
          </div></td>)}</tr>)}</tbody>
      </table> : student && <div className="mx-auto max-w-6xl rounded border bg-white p-4">
        <h2 className="text-center text-lg">{student.fullName} · Lớp {student.className}</h2><p>Ngày sinh: {student.birthDate || '—'} · Mã học sinh: {student.accessCode || '—'} · Năm học: {currentSchoolYear}</p>
        {subjectTable(student, draft.edits, true)}
        <h3 className="my-3">Phẩm chất, năng lực</h3><table className="w-full text-xs"><thead><tr><th className="border p-2">Nội dung</th>{PRIMARY_TERMS.map(period => <th key={period.key} className="border p-2">{period.label}</th>)}</tr></thead><tbody>{PRIMARY_QUALITIES.map(item => <tr key={item.key}><td className="border p-2">{item.label}</td>{PRIMARY_TERMS.map(period => <td key={period.key} className="border p-2">{field(student, item.key, 'quality', PRIMARY_QUALITY_LEVELS, period.key)}</td>)}</tr>)}</tbody></table>
        <div className="my-3 space-y-2"><h3>Kết quả cuối năm</h3>{field(student, 'summary', 'level', PRIMARY_YEAR_LEVELS, 'end2')}
          <textarea aria-label="Nhận xét cuối năm" value={value(student, 'summary', 'comment', 'end2')} disabled={!canEditField('summary', 'comment')} onChange={event => update(student, 'summary', 'comment', event.target.value, 'end2')} className="w-full rounded border p-2" />
          <input aria-label="Kết luận lên lớp" value={value(student, 'summary', 'promotion', 'end2')} disabled={!canEditField('summary', 'comment')} onChange={event => update(student, 'summary', 'promotion', event.target.value, 'end2')} className={inputClass} placeholder={grade === '5' ? 'Hoàn thành chương trình tiểu học' : 'Lên lớp…'} />
        </div>
        <div className="my-8 flex justify-around text-center"><div>Giáo viên chủ nhiệm<br /><br /><br /><br /></div><div>Người phụ trách<br /><br /><br /><br />{principalName}</div></div>
        {previousRecords.map(record => {
          const archive = resolveScorebookDocument(books.documents, primaryBookScope(record, currentSchoolYear, getStudentSchoolCode(record)));
          return <section key={record.id} className="print-page mt-6 border-t pt-4"><h3>Năm {record.schoolYear} · Lớp {record.className} · {getSchoolName(getStudentSchoolCode(record))}</h3>
            {archive.needsSelection ? <p>Có nhiều bản sổ năm này; mở sổ năm tương ứng để chọn bản cần đối chiếu.</p> : <>{subjectTable(record, archive.document?.edits || {})}<p>Kết quả giáo dục: {primaryValue(archive.document?.edits, record, 'end2', 'summary', 'level') || 'Chưa có kết quả'}</p><p>{primaryValue(archive.document?.edits, record, 'end2', 'summary', 'comment')}</p></>}
          </section>;
        })}
      </div>}
    </div>
    {showLegacy && <Suspense fallback={<p>Đang mở sổ đã lưu…</p>}><LegacyWorkspace grade={grade} allowedGrades={educationGrades('primary')} currentSchoolYear={currentSchoolYear} initialSchoolCode={schoolCode}
      students={students} user={user} principalName={principalName} nanTeachers={nanTeachers} tqkTeachers={tqkTeachers} classTeacherAssignments={classTeacherAssignments}
      draftDocuments={draftDocuments} onGradeChange={onGradeChange} onClose={() => setShowLegacy(false)} showNotification={showNotification} /></Suspense>}
  </div>;
}
