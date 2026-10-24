import { createHtmlSanitizer } from './safeHtml.js';

export function createLessonAnswerTools(windowObject) {
  const sanitize = createHtmlSanitizer(windowObject);
  const rootFor = html => {
    const root = windowObject.document.createElement('div');
    root.innerHTML = sanitize(html);
    return root;
  };
  const selector = '[data-lesson-answer], .teacher-only';
  const state = html => {
    const sections = [...rootFor(html).querySelectorAll(selector)];
    return { count: sections.length, visible: !!sections.length && sections.every(node => node.dataset.studentVisible === 'true' && !node.classList.contains('teacher-only')) };
  };
  const setVisible = (html, visible) => {
    const root = rootFor(html);
    for (const node of root.querySelectorAll(selector)) {
      node.dataset.lessonAnswer = 'true';
      node.dataset.studentVisible = visible === true ? 'true' : 'false';
      node.classList.add('lesson-answer');
      node.classList.toggle('teacher-only', visible !== true);
    }
    return root.innerHTML;
  };
  const studentHtml = html => {
    const root = rootFor(html);
    for (const node of root.querySelectorAll(selector)) {
      if (node.classList.contains('teacher-only') || node.dataset.studentVisible !== 'true') node.remove();
    }
    return root.innerHTML;
  };
  // Only the teacher preview receives these disclosures. Never save their open
  // state into the source lesson or use it to change student permissions.
  const teacherHtml = html => {
    const root = rootFor(html);
    for (const node of root.querySelectorAll(selector)) {
      if (node.parentElement?.closest(selector)) continue;
      const disclosure = windowObject.document.createElement('details');
      disclosure.className = 'teacher-answer-disclosure';
      const summary = windowObject.document.createElement('summary');
      summary.innerHTML = 'Đáp án và hướng dẫn giải <span class="answer-open-hint">Bấm để mở</span><span class="answer-close-hint">Bấm để đóng</span>';
      node.replaceWith(disclosure);
      disclosure.append(summary, node);
      // Older lessons may already put the answer inside a details element.
      // Keep one click sufficient to reveal it, using the outer control.
      if (node.tagName === 'DETAILS') node.open = true;
    }
    return root.innerHTML;
  };
  return { state, setVisible, studentHtml, teacherHtml };
}

let tools;
const browserTools = () => tools ||= createLessonAnswerTools(window);
export const lessonAnswerState = html => browserTools().state(html);
export const setLessonAnswersVisible = (html, visible) => browserTools().setVisible(html, visible);
export const studentLessonHtml = html => browserTools().studentHtml(html);
export const teacherLessonHtml = html => browserTools().teacherHtml(html);
