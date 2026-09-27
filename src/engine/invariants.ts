import { periods } from './timeline';
import type { Game, GameEvent } from './types';

/** Returns a list of violated invariants (empty when the state is sound). */
export function checkInvariants(g: Game, events: readonly GameEvent[] = []): string[] {
  const out: string[] = [];
  const ps = periods(g);
  if (ps.length) {
    const start = ps[0]!;
    const end = ps[ps.length - 1]!;
    if (start.bookend !== 'start') out.push('first Period is not the start Bookend');
    if (end.bookend !== 'end') out.push('last Period is not the end Bookend');
  }
  for (const e of Object.values(g.entries)) {
    if (e.kind === 'event' && g.entries[e.periodId]?.kind !== 'period')
      out.push(`event ${e.id} has no Period`);
    if (e.kind === 'scene' && g.entries[e.eventId]?.kind !== 'event')
      out.push(`scene ${e.id} has no Event`);
  }
  if (g.legacies.length > 6) out.push('more than 6 Legacies');
  for (const r of g.rounds) {
    if (r.turns.filter((t) => t.kind === 'normal').length > g.settings.cohesionCap) {
      out.push(`round ${r.n} exceeds the turn cap`);
    }
  }
  // Deck: no card drawn twice between reshuffles.
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'DeckReshuffled') seen.clear();
    if (ev.type === 'CardDrawn') {
      if (seen.has(ev.payload.cardId))
        out.push(`card ${ev.payload.cardId} drawn twice before reshuffle`);
      seen.add(ev.payload.cardId);
    }
  }
  // Locked facts change only through Retconned: after TurnCommitted, no event but Retconned touches facts.
  const lockedAt = new Map<string, number>();
  for (const ev of events) {
    if (ev.type === 'TurnCommitted') lockedAt.set(ev.payload.entryId, ev.seq);
    if (ev.type === 'EntryCreated' && ev.payload.entry.locked)
      lockedAt.set(ev.payload.entry.id, ev.seq);
    const target =
      ev.type === 'SceneFramed' ||
      ev.type === 'SceneResolved' ||
      ev.type === 'EntryProseEdited' ||
      ev.type === 'ReversalPlaced'
        ? ev.payload.entryId
        : undefined;
    if (target && lockedAt.has(target)) out.push(`${ev.type} modified locked entry ${target}`);
  }
  // Seq is gapless.
  events.forEach((ev, i) => {
    if (ev.seq !== i + 1) out.push(`seq gap at index ${i}`);
  });
  return out;
}
