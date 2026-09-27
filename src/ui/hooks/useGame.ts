import { useCallback } from 'react';
import type { Command, Rejection } from '../../engine';
import { useApp, useAppStore } from '../StoreContext';

export function useGame() {
  const cur = useApp((s) => s.current);
  if (!cur) throw new Error('no game open');
  return cur;
}

export function useDispatch() {
  const store = useAppStore();
  return useCallback(
    async (cmd: Command): Promise<{ ok: true } | { ok: false; rejection: Rejection }> =>
      store.getState().dispatch(cmd),
    [store],
  );
}
