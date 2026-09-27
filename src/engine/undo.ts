import type { Game, GameEvent } from './types';
import { ROLL_EVENT_TYPES } from './types';

const NEVER_UNDO = new Set(['TurnStarted', 'TurnCommitted', 'GameCreated']);

/**
 * The tail batch that undo would remove, or undefined. Undo is allowed only inside an open turn,
 * only for a batch the player authored (no rolls or draws), and only at the tail of the log — so a
 * recorded roll can never be removed or re-rolled.
 */
export function undoableTail(state: Game, events: readonly GameEvent[]): GameEvent[] | undefined {
  if (!state.turn || !events.length) return undefined;
  const last = events[events.length - 1]!;
  const batch = events.filter((e) => e.batch === last.batch);
  if (batch[0]!.seq <= state.turn.startSeq) return undefined;
  if (batch.some((e) => ROLL_EVENT_TYPES.has(e.type) || NEVER_UNDO.has(e.type))) return undefined;
  return batch;
}
