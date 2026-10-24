import { normalizeMathHtml } from '../utils/quizContent';
import { renderedQuizMathIssue } from '../utils/quizQuality';
import { typesetMath } from '../utils/mathTypesetting';

export function validateLessonReviewMath(html, signal) {
  return new Promise((resolve, reject) => {
    const root = document.createElement('div');
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px;pointer-events:none';
    root.innerHTML = normalizeMathHtml(html);
    document.body.append(root);
    let finished = false;
    const done = error => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      window.MathJax?.typesetClear?.([root]); root.remove();
      if (error) reject(error); else resolve();
    };
    const abort = () => done(new DOMException('Đã dừng tạo câu hỏi ôn tập.', 'AbortError'));
    const timer = setTimeout(() => done(new Error('Chưa kiểm tra được hiển thị công thức. Tải lại trang rồi thử tiếp.')), 20000);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    typesetMath(root, success => done(success ? (renderedQuizMathIssue(root) ? new Error(renderedQuizMathIssue(root)) : null) : new Error('Chưa tải được phần hiển thị công thức. Chưa lưu bộ ôn tập này.')));
  });
}
