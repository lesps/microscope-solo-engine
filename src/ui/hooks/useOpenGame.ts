import { useEffect, useState } from 'react';
import { useApp, useAppStore } from '../StoreContext';

/** Opens the game for a route; returns 'loading' | 'missing' | 'ready'. */
export function useOpenGame(gameId: string): 'loading' | 'missing' | 'ready' {
  const store = useAppStore();
  const currentId = useApp((s) => s.current?.id);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    setMissing(false);
    store
      .getState()
      .openGame(gameId)
      .then((ok) => live && !ok && setMissing(true));
    return () => {
      live = false;
    };
  }, [gameId, store]);
  if (missing) return 'missing';
  return currentId === gameId ? 'ready' : 'loading';
}
