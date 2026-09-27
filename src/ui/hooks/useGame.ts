import { useCallback } from 'react';
import type { Command, Rejection } from '../../engine';
import { useAppStore } from '../StoreContext';

export function useDispatch() {
  const store = useAppStore();
  return useCallback(
    async (cmd: Command): Promise<{ ok: true } | { ok: false; rejection: Rejection }> =>
      store.getState().dispatch(cmd),
    [store],
  );
}
