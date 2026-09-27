import { generateKeyBetween } from 'fractional-indexing';
import type { Entry, EntryKind, EventEntry, Game, Id, Period, Placement, Scene } from './types';

const byOrder = (a: Entry, b: Entry) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

export function periods(g: Game): Period[] {
  return Object.values(g.entries)
    .filter((e): e is Period => e.kind === 'period')
    .sort(byOrder);
}
export function eventsOf(g: Game, periodId: Id): EventEntry[] {
  return Object.values(g.entries)
    .filter((e): e is EventEntry => e.kind === 'event' && e.periodId === periodId)
    .sort(byOrder);
}
export function scenesOf(g: Game, eventId: Id): Scene[] {
  return Object.values(g.entries)
    .filter((e): e is Scene => e.kind === 'scene' && e.eventId === eventId)
    .sort(byOrder);
}

export function siblings(g: Game, kind: EntryKind, parentId: Id | null): Entry[] {
  if (kind === 'period') return periods(g);
  if (kind === 'event') return parentId ? eventsOf(g, parentId) : [];
  return parentId ? scenesOf(g, parentId) : [];
}

/** Entries in chronological (timeline) order: each Period, then its Events, each followed by its Scenes. */
export function chronological(g: Game): Entry[] {
  const out: Entry[] = [];
  for (const p of periods(g)) {
    out.push(p);
    for (const e of eventsOf(g, p.id)) {
      out.push(e);
      out.push(...scenesOf(g, e.id));
    }
  }
  return out;
}

export function periodOf(g: Game, entryId: Id): Period | undefined {
  const e = g.entries[entryId];
  if (!e) return undefined;
  if (e.kind === 'period') return e;
  if (e.kind === 'event') return g.entries[e.periodId] as Period | undefined;
  const ev = g.entries[e.eventId];
  return ev && ev.kind === 'event' ? (g.entries[ev.periodId] as Period | undefined) : undefined;
}

export interface Slot {
  kind: EntryKind;
  placement: Placement;
  /** Number of existing children in the containing Period/Event (used by sparse bias). */
  density: number;
}

export function slotKey(p: Placement): string {
  return `${p.parentId ?? 'root'}#${p.index}`;
}

/** Legal slots in chronological order. */
export function legalSlots(g: Game, kind: EntryKind): Slot[] {
  const ps = periods(g);
  if (kind === 'period') {
    const slots: Slot[] = [];
    for (let i = 1; i < ps.length; i++) {
      const density = eventsOf(g, ps[i - 1]!.id).length + eventsOf(g, ps[i]!.id).length;
      slots.push({ kind, placement: { parentId: null, index: i }, density });
    }
    return slots;
  }
  if (kind === 'event') {
    return ps.flatMap((p) => {
      const n = eventsOf(g, p.id).length;
      return Array.from({ length: n + 1 }, (_, i) => ({
        kind,
        placement: { parentId: p.id, index: i },
        density: n,
      }));
    });
  }
  return ps.flatMap((p) =>
    eventsOf(g, p.id).flatMap((e) => {
      const n = scenesOf(g, e.id).length;
      return Array.from({ length: n + 1 }, (_, i) => ({
        kind,
        placement: { parentId: e.id, index: i },
        density: n,
      }));
    }),
  );
}

export function isLegalSlot(g: Game, kind: EntryKind, p: Placement): boolean {
  return legalSlots(g, kind).some((s) => slotKey(s.placement) === slotKey(p));
}

export function orderKeyFor(g: Game, kind: EntryKind, p: Placement): string {
  const sibs = siblings(g, kind, p.parentId);
  const before = sibs[p.index - 1]?.order ?? null;
  const after = sibs[p.index]?.order ?? null;
  return generateKeyBetween(before, after);
}

export function describePlacement(g: Game, kind: EntryKind, p: Placement): string {
  if (kind === 'period') {
    const ps = periods(g);
    return `between “${ps[p.index - 1]?.title ?? '?'}” and “${ps[p.index]?.title ?? '?'}”`;
  }
  const parent = p.parentId ? g.entries[p.parentId] : undefined;
  const sibs = siblings(g, kind, p.parentId);
  const where =
    sibs.length === 0
      ? 'first'
      : p.index === 0
        ? 'at the start'
        : p.index >= sibs.length
          ? 'at the end'
          : `after “${sibs[p.index - 1]!.title}”`;
  return `in “${parent?.title ?? '?'}”, ${where}`;
}
