import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const q =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : undefined;
  const [reduced, setReduced] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return;
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [q]);
  return reduced;
}
