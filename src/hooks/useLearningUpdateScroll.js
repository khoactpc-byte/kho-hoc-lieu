import { useEffect } from 'react';

export default function useLearningUpdateScroll({ target, grade, studentGrade, enabled, subject, lesson, loadingNote, loadingQuiz, materials, setViewingMaterial, finish }) {
  useEffect(() => {
    if (!target) return undefined;
    if (!enabled || target.grade !== String(studentGrade) || target.grade !== String(grade) || target.subject !== subject || target.lesson !== String(lesson)) {
      finish(null); return undefined;
    }
    if (target.section === 'quiz' ? loadingQuiz : loadingNote) return undefined;
    let frame;
    if (target.section === 'quickQuiz') {
      const material = materials.find(item => item.id === target.sourceId && item.type === 'quick_quiz'
        && String(item.grade) === target.grade && item.subject === target.subject && String(item.lesson) === target.lesson);
      if (!material) return undefined;
      frame = requestAnimationFrame(() => { setViewingMaterial(material); finish(null); });
    } else {
      // A loading-state change cancels the previous frame before old lesson DOM can be used.
      const root = document.getElementById(target.section === 'quiz' ? 'quiz-section' : 'lesson-section');
      if (!root) return undefined;
      frame = requestAnimationFrame(() => { root.scrollIntoView({ behavior: 'smooth', block: 'start' }); finish(null); });
    }
    return () => cancelAnimationFrame(frame);
  }, [target, grade, studentGrade, enabled, subject, lesson, loadingNote, loadingQuiz, materials, setViewingMaterial, finish]);
}
