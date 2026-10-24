// Call with HTML that has already passed through normalizeMathHtml.
export function insertLessonPaste(editor, sanitizedHtml) {
  const document = editor.ownerDocument;
  const empty = !editor.textContent.trim()
    && !editor.querySelector('img,iframe,video,audio,math,svg,canvas');
  if (!empty) {
    document.execCommand('insertHTML', false, sanitizedHtml);
    return;
  }
  // Chromium's insertHTML can drop the last cell of a collapsed details/table
  // and inherit empty heading wrappers left by Select All/Delete.
  editor.innerHTML = sanitizedHtml;
  const selection = document.defaultView.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
