import { defaultSettings } from './settings';
import type {
  Character,
  Entry,
  EventPayloads,
  Game,
  GameEvent,
  Id,
  RolledValues,
  PromptKind,
  Scene,
} from './types';
import { SCHEMA_VERSION } from './types';

export function reversalMarker(text: string): string {
  return `[[REVERSAL: ${text}]]`;
}

export function initialGame(): Game {
  return {
    id: '',
    schemaVersion: SCHEMA_VERSION,
    title: '',
    ruleset: 'lens',
    seed: '',
    rng: [0, 0, 0, 0],
    createdAt: '',
    bigPicture: '',
    palette: { yes: [], no: [] },
    paletteRolled: 0,
    dials: { mood: 5, cohesion: 5 },
    dialsSet: false,
    settings: defaultSettings(),
    seats: [],
    entries: {},
    legacies: [],
    characters: {},
    rounds: [],
    stats: { overrides: 0, retcons: 0 },
    nextSeatIndex: 0,
    pendingRoundRolls: {},
    seq: 0,
  };
}

// The reducer copies on write at the top level and for touched records, so earlier states stay valid.
type Draft = Game;

function clone(g: Game): Draft {
  return {
    ...g,
    palette: { yes: [...g.palette.yes], no: [...g.palette.no] },
    dials: { ...g.dials },
    entries: { ...g.entries },
    legacies: [...g.legacies],
    characters: { ...g.characters },
    rounds: [...g.rounds],
    stats: { ...g.stats },
    pendingRoundRolls: { ...g.pendingRoundRolls },
    turn: g.turn
      ? { ...g.turn, rolled: { ...g.turn.rolled }, prompts: [...g.turn.prompts] }
      : undefined,
    deck: g.deck
      ? { ...g.deck, remaining: [...g.deck.remaining], discards: [...g.deck.discards] }
      : undefined,
  };
}

function currentRound(g: Draft) {
  const i = g.rounds.length - 1;
  if (i < 0) return undefined;
  const r = { ...g.rounds[i]!, turns: [...g.rounds[i]!.turns] };
  g.rounds[i] = r;
  return r;
}

function updateEntry<E extends Entry>(g: Draft, id: Id, f: (e: E) => E) {
  const e = g.entries[id] as E | undefined;
  if (e) g.entries[id] = f(e);
}

function addAppearance(g: Draft, characterId: Id, entryId: Id) {
  const c = g.characters[characterId];
  if (c && !c.entryIds.includes(entryId)) {
    g.characters[characterId] = { ...c, entryIds: [...c.entryIds, entryId] };
  }
}

function recordRolled(g: Draft, purpose: string, value: unknown, at: string, seq: number) {
  if (value === undefined) return;
  const turnKeys: Record<string, keyof RolledValues> = {
    tone: 'tone',
    entryType: 'entryType',
    placement: 'placement',
    'scene.reversal': 'reversal',
  };
  const roundKeys: Record<string, keyof RolledValues> = {
    cohesion: 'cohesion',
    focus: 'focus',
    'legacy.evict': 'evict',
    'legacy.explore': 'explore',
  };
  const tk = turnKeys[purpose];
  if (tk && g.turn) {
    (g.turn.rolled as Record<string, unknown>)[tk] = value;
    return;
  }
  const rk = roundKeys[purpose];
  if (rk) {
    (g.pendingRoundRolls as Record<string, unknown>)[rk] = value;
    return;
  }
  if (purpose === 'palette') {
    const v = value as { text: string; tableId: string; rerolled: boolean };
    g.pendingPalette = { text: v.text, tableId: v.tableId, rerolled: v.rerolled };
    return;
  }
  if (purpose.startsWith('prompt.') && g.turn) {
    const v = value as { kind: PromptKind; text: string };
    g.turn.prompts.push({ kind: v.kind, text: v.text, seq });
  }
  void at;
}

type Handler<K extends keyof EventPayloads> = (
  g: Draft,
  p: EventPayloads[K],
  ev: GameEvent<K>,
) => void;
type Handlers = { [K in keyof EventPayloads]: Handler<K> };

const handlers: Handlers = {
  GameCreated: (g, p, ev) => {
    Object.assign(g, initialGame(), {
      id: p.id,
      title: p.title,
      ruleset: p.ruleset,
      seed: p.seed,
      rng: p.rng,
      createdAt: ev.at,
      settings: p.settings,
      seats: p.seats,
      schemaVersion: p.schemaVersion,
      deck: p.deck
        ? {
            deckId: p.deck.deckId,
            cardIds: p.deck.cardIds,
            remaining: [...p.deck.cardIds],
            discards: [],
          }
        : undefined,
    });
  },
  GameRenamed: (g, p) => {
    g.title = p.title;
  },
  BigPictureSet: (g, p) => {
    g.bigPicture = p.text;
  },
  SubjectSet: (g, p) => {
    g.subject = p.subject;
    g.bigPicture = p.subject.description;
  },
  BookendsSet: (g, p) => {
    for (const c of p.characters) g.characters[c.id] = c;
    g.entries[p.start.id] = p.start;
    g.entries[p.end.id] = p.end;
    for (const b of [p.start, p.end]) if (b.anchorId) addAppearance(g, b.anchorId, b.id);
  },
  PaletteItemAdded: (g, p) => {
    g.palette[p.list].push(p.item);
    if (p.item.rolled) {
      g.paletteRolled += 1;
      g.pendingPalette = undefined;
    }
  },
  PaletteItemRemoved: (g, p) => {
    g.palette.yes = g.palette.yes.filter((i) => i.id !== p.id);
    g.palette.no = g.palette.no.filter((i) => i.id !== p.id);
  },
  SeatsConfigured: (g, p) => {
    g.seats = p.seats;
    if (g.seats.length) g.nextSeatIndex %= g.seats.length;
  },
  DialsSet: (g, p) => {
    g.dials = { ...p };
    g.dialsSet = true;
  },
  SettingsChanged: (g, p) => {
    g.settings = p.settings;
  },
  RoundStarted: (g, p) => {
    g.rounds.push({ n: p.n, lensSeatId: p.lensSeatId, turns: [], ended: false });
    g.pendingRoundRolls = {};
  },
  FocusSet: (g, p) => {
    const r = currentRound(g);
    if (r) {
      r.focus = p.text;
      r.focusSource = p.source;
    }
    delete g.pendingRoundRolls.focus;
  },
  TurnStarted: (g, p, ev) => {
    const r = currentRound(g);
    r?.turns.push({ seatId: p.seatId, kind: p.kind, committed: false, startSeq: ev.seq });
    g.turn = { seatId: p.seatId, kind: p.kind, startSeq: ev.seq, rolled: {}, prompts: [] };
    if (p.legacyId) g.turn.legacyId = p.legacyId;
    const idx = g.seats.findIndex((s) => s.id === p.seatId);
    g.nextSeatIndex = g.seats.length ? (idx + 1) % g.seats.length : 0;
    delete g.pendingRoundRolls.cohesion;
  },
  EntryCreated: (g, p) => {
    const e = p.entry;
    g.entries[e.id] = e;
    if (e.kind === 'period' && e.anchorId) addAppearance(g, e.anchorId, e.id);
    if (e.kind === 'scene') for (const c of e.requiredCharacterIds) addAppearance(g, c, e.id);
    if (g.turn && !e.firstPass) {
      g.turn.entryId = e.id;
      const r = currentRound(g);
      const t = r?.turns[r.turns.length - 1];
      if (r && t) r.turns[r.turns.length - 1] = { ...t, entryId: e.id };
    }
  },
  EntryProseEdited: (g, p) => {
    updateEntry(g, p.entryId, (e) => ({ ...e, prose: p.prose }));
  },
  CharacterCreated: (g, p) => {
    g.characters[p.character.id] = { ...p.character, entryIds: [] } as Character;
  },
  SceneFramed: (g, p) => {
    updateEntry<Scene>(g, p.entryId, (e) => ({
      ...e,
      question: p.question,
      form: p.form,
      setting: p.setting,
      requiredCharacterIds: p.requiredCharacterIds,
      bannedCharacterIds: p.bannedCharacterIds,
      budget: p.budget,
    }));
    for (const c of p.requiredCharacterIds) addAppearance(g, c, p.entryId);
  },
  ReversalPlaced: (g, p) => {
    updateEntry<Scene>(g, p.entryId, (e) => ({
      ...e,
      reversal: { source: p.source, text: p.text, offset: p.offset },
      prose: e.prose.slice(0, p.offset) + reversalMarker(p.text) + e.prose.slice(p.offset),
    }));
  },
  SceneResolved: (g, p) => {
    updateEntry<Scene>(g, p.entryId, (e) => ({
      ...e,
      answer: p.answer,
      characterIds: p.characterIds,
    }));
    for (const c of p.characterIds) addAppearance(g, c, p.entryId);
  },
  TurnCommitted: (g, p, ev) => {
    updateEntry(g, p.entryId, (e) => ({
      ...e,
      locked: true,
      playProse: e.prose,
      revisions: [...e.revisions, { seq: ev.seq, at: ev.at, prose: e.prose }],
    }));
    const r = currentRound(g);
    const t = r?.turns[r.turns.length - 1];
    if (r && t) r.turns[r.turns.length - 1] = { ...t, committed: true };
    g.turn = undefined;
  },
  LegacyAdded: (g, p) => {
    g.legacies.push(p.legacy);
    const r = currentRound(g);
    if (r) r.legacyAddedId = p.legacy.id;
    delete g.pendingRoundRolls.evict;
    delete g.pendingRoundRolls.cohesion;
  },
  LegacyRemoved: (g, p) => {
    g.legacies = g.legacies.filter((l) => l.id !== p.id);
  },
  LegacyExplored: (g, p) => {
    const r = currentRound(g);
    if (r) r.legacyExploredId = p.id;
    delete g.pendingRoundRolls.explore;
  },
  DialsAdjusted: (g, p) => {
    g.dials = { ...p.after };
  },
  RoundEnded: (g) => {
    const r = currentRound(g);
    if (r) r.ended = true;
    g.pendingRoundRolls = {};
  },
  RollMade: (g, p, ev) => {
    g.rng = p.rng;
    if (p.purpose === 'seed.answer') {
      const v = p.value as { seedId: Id; optionId: Id };
      const rolled = g.pendingSeed?.seedId === v.seedId ? g.pendingSeed.rolled : {};
      g.pendingSeed = { seedId: v.seedId, rolled: { ...rolled, [p.targetId!]: v.optionId } };
      return;
    }
    if (p.purpose === 'generator.part') {
      const v = p.value as {
        generatorId: Id;
        partId: Id;
        label: string;
        index: number;
        swap?: [Id, Id];
      };
      const prev = v.index === 0 ? undefined : g.pendingGenerator;
      g.pendingGenerator = {
        generatorId: v.generatorId,
        parts: [...(prev?.parts ?? []), { id: v.partId, label: v.label, text: p.text ?? '' }],
        ...(v.swap ? { swap: v.swap } : {}),
      };
      return;
    }
    recordRolled(g, p.purpose, p.value, ev.at, ev.seq);
  },
  SeedApplied: (g, p) => {
    g.startup = p.startup;
    delete g.pendingSeed;
  },
  GeneratorReadingAccepted: (g, p) => {
    g.startup = p.startup;
    delete g.pendingGenerator;
  },
  CardDrawn: (g, p, ev) => {
    g.rng = p.rng;
    if (g.deck) {
      g.deck.remaining = g.deck.remaining.filter((c) => c !== p.cardId);
      g.deck.discards.push(p.cardId);
    }
    if (p.purpose === 'scene.spread' && p.targetId) {
      updateEntry<Scene>(g, p.targetId, (e) => ({
        ...e,
        spread: [
          ...(e.spread ?? []),
          {
            deckId: p.deckId,
            cardId: p.cardId,
            reversed: p.reversed,
            keyword: p.keyword,
            role: p.role,
          },
        ],
      }));
    }
    recordRolled(g, p.purpose, p.value, ev.at, ev.seq);
  },
  DeckReshuffled: (g, p) => {
    g.rng = p.rng;
    if (g.deck) {
      g.deck.remaining = [...g.deck.cardIds];
      g.deck.discards = [];
    }
  },
  OracleAsked: (g, p) => {
    if (p.entryId) {
      updateEntry<Scene>(g, p.entryId, (e) =>
        e.kind === 'scene' ? { ...e, oracleCalls: [...e.oracleCalls, p.call] } : e,
      );
    }
  },
  OverrideUsed: (g, p) => {
    g.stats.overrides += 1;
    if (p.mechanic === 'scene.reversal' && g.turn) {
      g.turn.rolled.reversal = p.chosen as RolledValues['reversal'];
    }
  },
  ProseRevised: (g, p, ev) => {
    updateEntry(g, p.entryId, (e) => ({
      ...e,
      prose: p.prose,
      revisions: [...e.revisions, { seq: ev.seq, at: ev.at, prose: p.prose }],
    }));
  },
  Retconned: (g, p) => {
    g.stats.retcons += 1;
    if (p.targetId === g.id) {
      if (p.field === 'bigPicture') g.bigPicture = p.after as string;
      return;
    }
    const legacy = g.legacies.find((l) => l.id === p.targetId);
    if (legacy) {
      g.legacies = g.legacies.map((l) => (l.id === p.targetId ? { ...l, [p.field]: p.after } : l));
      return;
    }
    const ch = g.characters[p.targetId];
    if (ch) {
      g.characters[p.targetId] = { ...ch, [p.field]: p.after };
      return;
    }
    updateEntry(g, p.targetId, (e) => ({ ...e, [p.field]: p.after }) as Entry);
  },
};

export const HANDLED_EVENT_TYPES = Object.keys(handlers);

export function apply(state: Game, event: GameEvent): Game {
  const g = clone(state);
  (handlers[event.type] as Handler<typeof event.type>)(g, event.payload as never, event as never);
  g.seq = event.seq;
  return g;
}

/**
 * Events eligible for replay. Undo removes events from the tail of the log, so the log never
 * contains undone events; replay is a plain fold.
 */
export function replay(events: readonly GameEvent[], from: Game = initialGame()): Game {
  return events.reduce(apply, from);
}
