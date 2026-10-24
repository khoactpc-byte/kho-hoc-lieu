import { AlignCenter, AlignLeft, AlignRight, Bold, Image, Italic, Underline } from 'lucide-react';

const commands = [
  ['bold', 'In đậm', Bold], ['italic', 'In nghiêng', Italic], ['underline', 'Gạch chân', Underline],
  ['justifyLeft', 'Căn trái', AlignLeft], ['justifyCenter', 'Căn giữa', AlignCenter], ['justifyRight', 'Căn phải', AlignRight]
];

export default function QuizComposerToolbar({ editorRef, onInput, onImageUpload }) {
  const format = (command, value = null) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection?.anchorNode || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) editor.focus();
    document.execCommand(command, false, value);
    onInput();
  };
  return <div className="quiz-composer-toolbar" role="group" aria-label="Công cụ soạn đề">
    {commands.map(([command, label, Icon]) => <button key={command} type="button" aria-label={label} title={label} onMouseDown={event => event.preventDefault()} onClick={() => format(command)}><Icon className="h-4 w-4" /></button>)}
    <span className="quiz-toolbar-divider" aria-hidden="true" />
    {[['#000000', 'Đen'], ['#dc2626', 'Đỏ'], ['#2563eb', 'Xanh dương'], ['#16a34a', 'Xanh lá']].map(([color, label]) => <button key={color} type="button" aria-label={`Màu ${label.toLowerCase()}`} title={label} onMouseDown={event => event.preventDefault()} onClick={() => format('foreColor', color)}><span className="quiz-text-color" style={{ backgroundColor: color }} /></button>)}
    <label className="quiz-insert-image"><Image className="h-4 w-4" /><span>Chèn ảnh</span><input type="file" accept="image/*" aria-label="Chèn ảnh vào đề" onChange={onImageUpload} /></label>
  </div>;
}
