import { periods } from './timeline';
import type { Game, Id, Subject, TraitChange } from './types';

export function applyChange(traits: string[], c: TraitChange): string[] | { error: string } {
  switch (c.op) {
    case 'add': {
      const t = c.trait?.trim();
      if (!t) return { error: 'add needs a trait' };
      if (traits.includes(t)) return { error: `trait "${t}" already present` };
      return [...traits, t];
    }
    case 'remove': {
      const t = c.trait?.trim();
      if (!t || !traits.includes(t)) return { error: `trait "${t ?? ''}" not present` };
      return traits.filter((x) => x !== t);
    }
    case 'modify': {
      const from = c.from?.trim();
      const to = c.to?.trim();
      if (!from || !traits.includes(from)) return { error: `trait "${from ?? ''}" not present` };
      if (!to) return { error: 'modify needs a new trait' };
      if (to !== from && traits.includes(to)) return { error: `trait "${to}" already present` };
      return traits.map((x) => (x === from ? to : x));
    }
  }
}

/**
 * Traits as of a timeline position: changes of all Periods up to and including `upToOrder` apply in
 * chronological order. Changes invalidated by later insertions are skipped (and reported).
 */
export function traitsAt(g: Game, upToOrder: string | null): { traits: string[]; skipped: Id[] } {
  let traits = [...(g.subject?.traits ?? [])];
  const skipped: Id[] = [];
  for (const p of periods(g)) {
    if (upToOrder !== null && p.order > upToOrder) break;
    if (!p.change) continue;
    const next = applyChange(traits, p.change);
    if (Array.isArray(next)) traits = next;
    else skipped.push(p.id);
  }
  return { traits, skipped };
}

export function subjectAt(g: Game, periodId: Id): Subject | undefined {
  if (!g.subject) return undefined;
  const p = g.entries[periodId];
  if (!p || p.kind !== 'period') return undefined;
  return { ...g.subject, traits: traitsAt(g, p.order).traits };
}

/** Traits in force just before a new Period inserted with the given order key. */
export function traitsBefore(g: Game, order: string): string[] {
  let traits = [...(g.subject?.traits ?? [])];
  for (const p of periods(g)) {
    if (p.order >= order) break;
    if (!p.change) continue;
    const next = applyChange(traits, p.change);
    if (Array.isArray(next)) traits = next;
  }
  return traits;
}

export function describeChange(c: TraitChange): string {
  if (c.op === 'add') return `+ ${c.trait}`;
  if (c.op === 'remove') return `− ${c.trait}`;
  return `${c.from} → ${c.to}`;
}
