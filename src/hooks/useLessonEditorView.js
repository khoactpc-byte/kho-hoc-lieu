import { useEffect, useState } from 'react';

export default function useLessonEditorView(contextKey, html, editorRef) {
  const [editingKey, setEditingKey] = useState(null);
  const showEditor = editingKey === contextKey || !html.trim();

  useEffect(() => { setEditingKey(null); }, [contextKey]);
  useEffect(() => {
    if (editingKey === contextKey) editorRef.current?.focus();
  }, [editingKey, contextKey, editorRef]);

  return { showEditor, edit: () => setEditingKey(contextKey), preview: () => setEditingKey(null) };
}
