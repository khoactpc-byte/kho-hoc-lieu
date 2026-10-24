import { useCallback, useEffect, useMemo, useState } from 'react';
import { lessonColumnCount, normalizeLessonLayoutMode } from '../utils/lessonLayout';

export default function useLessonLayout(html, { contextKey = '', savedMode = 'auto', onChange } = {}) {
  const [choices, setChoices] = useState({});
  const mode = normalizeLessonLayoutMode(onChange ? savedMode : choices[contextKey] ?? savedMode);
  const setMode = next => {
    const value = normalizeLessonLayoutMode(next);
    if (onChange) onChange(value);
    else setChoices(previous => ({ ...previous, [contextKey]: value }));
  };
  const [container, setContainer] = useState(null);
  const [width, setWidth] = useState(0);
  const containerRef = useCallback(node => setContainer(node), []);

  useEffect(() => {
    if (!container) return;
    const target = container.ownerDocument.defaultView;
    const measure = () => setWidth(container.getBoundingClientRect().width);
    measure();
    const observer = target.ResizeObserver ? new target.ResizeObserver(measure) : null;
    observer?.observe(container);
    target.addEventListener('resize', measure);
    return () => { observer?.disconnect(); target.removeEventListener('resize', measure); };
  }, [container]);

  const columns = useMemo(() => lessonColumnCount(html, width, mode), [html, width, mode]);
  return { containerRef, mode, setMode, columns };
}
