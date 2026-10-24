import { useLayoutEffect, useRef, useState } from 'react';

export default function ScorebookPageView({ width, zoom = 'auto', children }) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [size, setSize] = useState({ available: width, height: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const available = viewportRef.current?.clientWidth || width;
      const height = contentRef.current?.offsetHeight || 0;
      setSize(previous => previous.available === available && previous.height === height ? previous : { available, height });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    if (contentRef.current) observer?.observe(contentRef.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [width]);

  const scale = zoom === 'auto' ? Math.min(0.85, size.available / width) : Number(zoom);
  return (
    <div ref={viewportRef} className="scorebook-page-view">
      <div className="scorebook-page-stage" style={{ width: width * scale, height: size.height ? size.height * scale : undefined }}>
        <div ref={contentRef} className="scorebook-page-content" style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
