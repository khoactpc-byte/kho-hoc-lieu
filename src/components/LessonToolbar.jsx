import { useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Camera, Eye, FileText, FileUp, Image, Italic, List, ListOrdered, ListChecks, Palette, Pencil, Sparkles, Trash2, Underline, Undo2 } from 'lucide-react';
import LessonLayoutControl from './LessonLayoutControl';

export default function LessonToolbar({ teacher, layout, deliveryStatus, editing, mathEnabled = true, onToggleEditing, onEdit, editDisabled, onNormalize, normalizeDisabled, onUndo, canUndo, onCreateQuiz, onImageUpload, onImportPdf, onDelete, deleteDisabled, onRestoreDeleted, canRestoreDeleted, children }) {
  const [open, setOpen] = useState(false);
  const toolsOpen = open && editing !== false;
  const editLabel = editing ? mathEnabled ? 'Xem công thức' : 'Xem bài học' : 'Chỉnh sửa bài';
  const command = (event, name, value) => { event.preventDefault(); document.execCommand(name, false, value); };
  const buttons = [['bold', 'In đậm', Bold], ['italic', 'In nghiêng', Italic], ['underline', 'Gạch chân', Underline],
    ['justifyLeft', 'Canh trái', AlignLeft], ['justifyCenter', 'Canh giữa', AlignCenter], ['justifyRight', 'Canh phải', AlignRight], ['justifyFull', 'Canh đều', AlignJustify],
    ['insertUnorderedList', 'Danh sách bullet', List], ['insertOrderedList', 'Danh sách đánh số', ListOrdered]];
  return <div className="lesson-toolbar lesson-toolbar-compact">
    <div className="lesson-heading-row">
      <div className="lesson-heading"><FileText size={18} /><h3>Bài học</h3></div>
      <LessonLayoutControl mode={layout.mode} columns={layout.columns} onChange={layout.setMode} disabled={layout.disabled} />
      <div className="lesson-toolbar-actions">{deliveryStatus}{children}{teacher && <>
        {onImportPdf && <button type="button" title="Nhập bài từ PDF / Word" aria-label="Nhập PDF / Word" disabled={editDisabled} onClick={onImportPdf}><FileUp size={15} /><span>Nhập bài</span></button>}
        {onToggleEditing && <button type="button" title={editLabel} aria-label={editLabel} disabled={editDisabled} onClick={onToggleEditing} aria-controls={editing ? 'teacher-editor-box' : 'teacher-lesson-preview'}>
          {editing ? <Eye size={15} /> : <Pencil size={15} />}<span>{editing ? 'Xem bài' : 'Sửa bài'}</span>
        </button>}
        <button type="button" title="Chuẩn hóa" aria-label="Chuẩn hóa" className="lesson-normalize-button" disabled={normalizeDisabled} onClick={onNormalize}><Sparkles size={15} /><span>Chuẩn hóa</span></button>
        <button type="button" title="Tạo bài kiểm tra" aria-label="Tạo bài kiểm tra" className="lesson-create-quiz-button" onClick={onCreateQuiz}><ListChecks size={15} /><span>Tạo đề</span></button>
        {onDelete && <button type="button" title="Xóa bài học" aria-label="Xóa bài học" className="lesson-delete-button" disabled={deleteDisabled} onClick={onDelete}><Trash2 size={15} /><span>Xóa</span></button>}
        {canRestoreDeleted && <button type="button" title="Hoàn tác xóa" aria-label="Hoàn tác xóa" disabled={editDisabled} onClick={onRestoreDeleted}><Undo2 size={15} /><span>Hoàn tác xóa</span></button>}
        <button type="button" title="Công cụ định dạng chữ và chèn ảnh" aria-label="Công cụ" aria-expanded={toolsOpen} aria-controls="lesson-formatting-tools" className={toolsOpen ? 'is-active' : ''} onMouseDown={event => event.preventDefault()} onClick={() => { if (!toolsOpen) onEdit?.(); setOpen(!toolsOpen); }}><Palette size={15} /><span>Định dạng</span></button>
      </>}</div>
    </div>
    {teacher && toolsOpen && <div id="lesson-formatting-tools" role="group" aria-label="Công cụ trình bày bài học" className="lesson-formatting-tools">
      {buttons.map(([name, title, Icon]) => <button type="button" key={name} title={title} aria-label={title} onMouseDown={event => command(event, name)}><Icon size={16} /></button>)}
      <button type="button" onMouseDown={event => command(event, 'formatBlock', 'h3')}>Tiêu đề</button>
      <button type="button" onMouseDown={event => command(event, 'formatBlock', 'p')}>Đoạn văn</button>
      {['#000000', '#dc2626', '#2563eb', '#16a34a', '#ea580c'].map((color, index) => <button type="button" key={color} title={['Đen', 'Đỏ', 'Xanh dương', 'Xanh lá', 'Cam'][index]} aria-label={`Màu ${['đen', 'đỏ', 'xanh dương', 'xanh lá', 'cam'][index]}`} onMouseDown={event => command(event, 'foreColor', color)}><span className="lesson-color-dot" style={{ backgroundColor: color }} /></button>)}
      <label title="Chèn ảnh từ thiết bị"><Image size={16} />Chèn ảnh<input type="file" accept="image/*" onChange={onImageUpload} /></label>
      <label title="Chụp ảnh bằng Camera"><Camera size={16} />Chụp ảnh<input type="file" accept="image/*" capture="environment" onChange={onImageUpload} /></label>
      {canUndo && <button type="button" onClick={onUndo}><Undo2 size={16} />Hoàn tác chuẩn hóa</button>}
    </div>}
  </div>;
}
