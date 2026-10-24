export default function LessonLayoutControl({ mode, columns, onChange, disabled = false }) {
  return <label className="lesson-layout-select" title={columns === 2 ? 'Đọc cột trái trước, rồi đến cột phải' : 'Bài học hiển thị một cột'}><span className="lesson-layout-label">Bố cục</span>
      <select aria-label="Bố cục bài học" value={mode} disabled={disabled} onChange={event => onChange(event.target.value)}>
        <option value="auto">{columns} cột · Tự động</option>
        <option value="single">1 cột</option>
        <option value="double">2 cột</option>
      </select>
    </label>;
}
