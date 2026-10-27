import { useEffect, useState } from 'react';

export default function useNarrowScreen(breakpoint = 768) {
  const measure = () => typeof window !== 'undefined' && window.innerWidth < breakpoint;
  const [narrow, setNarrow] = useState(measure);
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [breakpoint]);
  return narrow;
}
