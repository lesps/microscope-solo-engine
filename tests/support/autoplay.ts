import {
  focusModeFor,
  legalSlots,
  nextStep,
  type Command,
  type EntryKind,
  type Game,
  type Mode,
  type Settings,
} from '../../src/engine';
import type { Driver } from './driver';

export type Pick = (n: number) => number; // returns 0..n-1

export function cyclePick(values: number[]): Pick {
  let i = 0;
  return (n) => (n <= 1 ? 0 : Math.abs(values[i++ % values.length] ?? 0) % n);
}

const m = (g: Game, k: keyof Settings['modes']): Mode => g.settings.modes[k];

function overrideOr<T>(
  _g: Game,
  mode: Mode,
  rolled: T,
  alternatives: T[],
  pick: Pick,
): T | undefined {
  if (mode !== 'prompt' || !alternatives.length) return undefined;
  const i = pick(alternatives.length + 3);
  return i < alternatives.length ? alternatives[i] : rolled;
}

let counter = 0;

/** The next command for a legal, rules-following game, with choices driven by `pick`. */
export function autoCommand(g: Game, pick: Pick): Command {
  const step = nextStep(g);
  const r = g.rounds[g.rounds.length - 1];
  switch (step) {
    case 'setup':
      throw new Error('autoplay starts after setup');
    case 'start-round':
      return { type: 'StartRound' };
    case 'focus': {
      const lens = g.seats.find((s) => s.id === r!.lensSeatId)!;
      const fm = focusModeFor(g.settings, lens);
      if (fm === 'off') return { type: 'SetFocus', text: `focus ${++counter}` };
      if (!g.pendingRoundRolls.focus) return { type: 'RollFocus' };
      return fm === 'prompt' && pick(3) === 0
        ? { type: 'SetFocus', text: `own focus ${++counter}` }
        : { type: 'SetFocus' };
    }
    case 'start-turn':
      return { type: 'StartTurn' };
    case 'cohesion': {
      const cm = m(g, 'cohesion');
      const rolled = g.pendingRoundRolls.cohesion;
      let extra: boolean;
      if (cm === 'enforce') extra = !!rolled;
      else if (cm === 'prompt') extra = pick(4) === 0 ? !rolled : !!rolled;
      else extra = pick(2) === 0;
      return extra ? { type: 'StartTurn' } : addLegacy(g, pick);
    }
    case 'add-legacy':
      return addLegacy(g, pick);
    case 'explore-legacy': {
      const em = m(g, 'legacy.explore');
      if (em === 'off')
        return { type: 'ExploreLegacy', legacyId: g.legacies[pick(g.legacies.length)]!.id };
      if (!g.pendingRoundRolls.explore) return { type: 'RollExplore' };
      const alt = overrideOr(
        g,
        em,
        g.pendingRoundRolls.explore,
        g.legacies.map((l) => l.id),
        pick,
      );
      return alt ? { type: 'ExploreLegacy', legacyId: alt } : { type: 'ExploreLegacy' };
    }
    case 'adjust-dials':
      return {
        type: 'EndRound',
        mood: (pick(3) - 1) as -1 | 0 | 1,
        cohesion: (pick(3) - 1) as -1 | 0 | 1,
      };
    case 'turn':
    case 'legacy-turn':
      return turnCommand(g, pick);
  }
}

function addLegacy(g: Game, pick: Pick): Command {
  const text = `legacy ${++counter}`;
  if (g.legacies.length < 6) return { type: 'AddLegacy', text };
  const em = m(g, 'legacy.evict');
  if (em === 'off') return { type: 'AddLegacy', text, evictId: g.legacies[pick(6)]!.id };
  if (!g.pendingRoundRolls.evict) return { type: 'RollEvict' };
  const alt = overrideOr(
    g,
    em,
    g.pendingRoundRolls.evict,
    g.legacies.map((l) => l.id),
    pick,
  );
  return alt ? { type: 'AddLegacy', text, evictId: alt } : { type: 'AddLegacy', text };
}

function turnCommand(g: Game, pick: Pick): Command {
  const t = g.turn!;
  if (t.entryId) {
    const e = g.entries[t.entryId]!;
    if (e.kind !== 'scene') {
      if (!e.prose && pick(2) === 0)
        return { type: 'EditProse', entryId: e.id, prose: `prose for ${e.title}` };
      return { type: 'CommitTurn' };
    }
    if (!e.prose)
      return { type: 'EditProse', entryId: e.id, prose: 'word '.repeat(e.budget.min + 1).trim() };
    if (m(g, 'scene.reversal') === 'enforce' && !e.reversal) {
      return t.rolled.reversal
        ? { type: 'PlaceReversal', entryId: e.id, offset: 0 }
        : { type: 'DrawReversal', entryId: e.id };
    }
    return { type: 'ResolveScene', entryId: e.id, answer: `answer to ${e.question}` };
  }
  const allowed: EntryKind[] = (
    t.kind === 'legacy' ? ['event', 'scene'] : ['period', 'event', 'scene']
  ).filter((k) => legalSlots(g, k as EntryKind).length > 0) as EntryKind[];
  let kind: EntryKind;
  if (t.rolled.placement) kind = t.rolled.placement.kind;
  else if (
    m(g, 'entryType') !== 'off' &&
    t.rolled.entryType &&
    allowed.includes(t.rolled.entryType)
  ) {
    kind =
      m(g, 'entryType') === 'prompt' && pick(4) === 0
        ? allowed[pick(allowed.length)]!
        : t.rolled.entryType;
  } else if (m(g, 'entryType') === 'enforce' && t.rolled.entryType) {
    throw new Error(`enforced entry type ${t.rolled.entryType} has no legal slot`);
  } else kind = allowed[pick(allowed.length)]!;

  const pm = m(g, 'placement');
  if (pm !== 'off' && !t.rolled.placement) return { type: 'RollPlacement', kind };
  const slots = legalSlots(g, kind).map((s) => s.placement);
  let placement = t.rolled.placement?.placement ?? slots[pick(slots.length)]!;
  if (pm === 'prompt' && pick(4) === 0) placement = slots[pick(slots.length)]!;

  const tm = m(g, 'tone');
  let tone = t.rolled.tone;
  if (tm === 'off' || (tm === 'prompt' && pick(4) === 0)) tone = pick(2) ? 'light' : 'dark';

  const n = ++counter;
  const cmd: Command = { type: 'CreateEntry', kind, title: `${kind} ${n}`, placement };
  if (tone) cmd.tone = tone;
  if (kind === 'scene')
    cmd.scene = { question: `Why ${n}?`, form: pick(2) ? 'played' : 'dictated' };
  if (kind === 'period' && g.ruleset === 'chronicle') {
    cmd.anchor = { name: `Anchor ${n}` };
    cmd.change = { op: 'add', trait: `trait ${n}` };
  }
  return cmd;
}

export function autoplay(d: Driver, pick: Pick, opts: { rounds?: number; maxSteps?: number } = {}) {
  const rounds = opts.rounds ?? 3;
  for (let i = 0; i < (opts.maxSteps ?? 2000); i++) {
    const g = d.state;
    const last = g.rounds[g.rounds.length - 1];
    if (g.rounds.length >= rounds && last?.ended) return;
    d.run(autoCommand(g, pick));
  }
  throw new Error('autoplay did not finish');
}

export function setupGame(
  d: Driver,
  opts: {
    ruleset?: 'lens' | 'chronicle';
    settings?: (s: Settings) => Settings;
    phantoms?: number;
    /** Runs after the settings and seats are configured, before the premise and Bookends. */
    beforeBookends?: (d: Driver) => void;
  } = {},
) {
  const ruleset = opts.ruleset ?? 'lens';
  d.run({
    type: 'CreateGame',
    id: 'game1',
    title: 'Test history',
    ruleset,
    seed: '00112233445566778899aabbccddeeff',
  });
  if (opts.settings) d.run({ type: 'ChangeSettings', settings: opts.settings(d.state.settings) });
  if (opts.phantoms !== undefined) {
    const player = d.state.seats.find((s) => s.kind === 'player')!;
    const seats = [
      player,
      ...Array.from({ length: opts.phantoms }, (_, i) => ({
        id: `phantom${i}`,
        name: `Phantom ${i}`,
        kind: 'phantom' as const,
        tables: [],
        placementBias: (['early', 'late', 'sparse'] as const)[i % 3]!,
      })),
    ];
    d.run({ type: 'ConfigureSeats', seats });
  }
  opts.beforeBookends?.(d);
  if (ruleset === 'chronicle') {
    d.run({
      type: 'SetSubject',
      subject: {
        name: 'The Lighthouse',
        description: 'A lighthouse on a cold coast.',
        traits: ['tall', 'lonely', 'bright'],
      },
    });
    d.run({
      type: 'SetBookends',
      start: { title: 'The first lamp', prose: '', tone: 'light', anchor: { name: 'The Builder' } },
      end: {
        title: 'The last keeper leaves',
        prose: '',
        tone: 'dark',
        anchor: { name: 'The Last Keeper' },
      },
    });
  } else {
    d.run({ type: 'SetBigPicture', text: 'A river city rises and drowns.' });
    d.run({
      type: 'SetBookends',
      start: { title: 'Fishers settle the delta', prose: '', tone: 'light' },
      end: { title: 'The sea takes the towers', prose: '', tone: 'dark' },
    });
  }
  d.run({ type: 'AddPaletteItem', list: 'yes', text: 'bridges' });
  d.run({ type: 'AddPaletteItem', list: 'no', text: 'dragons' });
  const start = Object.values(d.state.entries).find(
    (e) => e.kind === 'period' && e.bookend === 'start',
  )!;
  for (let i = 0; i < d.state.seats.length; i++) {
    if (i === 0) {
      d.run({
        type: 'AddFirstPassEntry',
        kind: 'period',
        title: `First pass period ${i}`,
        tone: 'light',
        placement: { parentId: null, index: 1 },
        ...(ruleset === 'chronicle'
          ? {
              anchor: { name: `FP anchor ${i}` },
              change: { op: 'add' as const, trait: `fp trait ${i}` },
            }
          : {}),
      });
    } else {
      d.run({
        type: 'AddFirstPassEntry',
        kind: 'event',
        title: `First pass event ${i}`,
        tone: 'dark',
        placement: { parentId: start.id, index: 0 },
      });
    }
  }
  d.run({ type: 'SetDials', mood: 5, cohesion: 5, chaos: 5 });
}
