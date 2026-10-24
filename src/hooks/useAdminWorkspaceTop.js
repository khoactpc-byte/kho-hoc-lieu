import { useLayoutEffect, useState } from 'react';

export default function useAdminWorkspaceTop() {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const header = document.querySelector('[data-admin-menu-bar]')?.parentElement;
    if (!header) return undefined;
    const measure = () => setTop(Math.max(0, Math.ceil(header.getBoundingClientRect().bottom)));
    measure();
    const observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null;
    observer?.observe(header);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);
  return top;
}
