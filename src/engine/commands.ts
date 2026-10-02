import { applyChange, traitsAt, traitsBefore } from './chronicle';
import { chaosDelta, counterTrendMoodDelta, randomDelta, toneFromRoll } from './dials';
import { wordCount } from './lint';
import { effectiveOdds, qualifierFor } from './oracle';
import { weightedSlots } from './placement';
import { apply } from './reducer';
import { fillTemplate, personText } from './startup';
import { rollDie, seedToState } from './rng';
import { clampDial, defaultSettings, focusModeFor, linkedActiveTables } from './settings';
import {
  describePlacement,
  isLegalSlot,
  legalSlots,
  orderKeyFor,
  periodOf,
  periods,
  slotKey,
} from './timeline';
import type {
  Card,
  Character,
  Content,
  Entry,
  EntryKind,
  EventDraft,
  EventPayloads,
  EventType,
  Game,
  GameEvent,
  Id,
  ListTable,
  PersonSlot,
  PromptKind,
  Seed,
  SeedStartup,
  StartupBookend,
  Mode,
  OverridableMechanic,
  Period,
  Placement,
  RngState,
  Round,
  Ruleset,
  Scene,
  Seat,
  Settings,
  Subject,
  Table,
  TableEntry,
  Tone,
  TraitChange,
} from './types';
import { SCHEMA_VERSION } from './types';

// ---------------------------------------------------------------------------------------------
// Commands

export interface AnchorInput {
  characterId?: Id;
  name?: string;
  description?: string;
  immortal?: boolean;
}
export interface BookendInput {
  title: string;
  prose: string;
  tone: Tone;
  anchor?: AnchorInput;
}
export interface SceneFrameInput {
  question: string;
  form: 'played' | 'dictated';
  setting?: string;
  requiredCharacterIds?: Id[];
  bannedCharacterIds?: Id[];
  budget?: { min: number; max: number };
}

export type Command =
  | {
      type: 'CreateGame';
      id: Id;
      title: string;
      ruleset: Ruleset;
      seed: string;
      settings?: Settings;
      seats?: Seat[];
      deckId?: Id;
    }
  | { type: 'SetBigPicture'; text: string }
  | { type: 'SetSubject'; subject: Subject }
  | { type: 'SetBookends'; start: BookendInput; end: BookendInput }
  | { type: 'AddPaletteItem'; list: 'yes' | 'no'; text: string }
  | { type: 'RemovePaletteItem'; id: Id }
  | { type: 'RollPaletteItem' }
  | { type: 'RerollPaletteItem' }
  | { type: 'AssignPaletteRoll'; list: 'yes' | 'no' }
  | { type: 'ConfigureSeats'; seats: Seat[] }
  | {
      type: 'AddFirstPassEntry';
      kind: 'period' | 'event';
      title: string;
      tone: Tone;
      prose?: string;
      placement: Placement;
      anchor?: AnchorInput;
      change?: TraitChange;
    }
  | { type: 'SetDials'; mood: number; cohesion: number; chaos?: number }
  | { type: 'ChangeSettings'; settings: Settings }
  | { type: 'StartRound' }
  | { type: 'RollFocus' }
  | { type: 'SetFocus'; text?: string }
  | { type: 'StartTurn' }
  | { type: 'RollPlacement'; kind: EntryKind }
  | {
      type: 'CreateEntry';
      kind: EntryKind;
      title: string;
      tone?: Tone;
      placement: Placement;
      prose?: string;
      anchor?: AnchorInput;
      change?: TraitChange;
      scene?: SceneFrameInput;
    }
  | { type: 'EditProse'; entryId: Id; prose: string }
  | { type: 'CreateCharacter'; name: string; description: string; immortal?: boolean }
  | { type: 'FrameScene'; entryId: Id; frame: SceneFrameInput }
  | { type: 'DrawSpread'; entryId: Id }
  | { type: 'DrawReversal'; entryId: Id }
  | { type: 'PlaceReversal'; entryId: Id; offset: number; text?: string }
  | { type: 'AskOracle'; question: string; odds: number; entryId?: Id }
  | { type: 'DrawPrompt'; kind: PromptKind }
  | { type: 'ResolveScene'; entryId: Id; answer: string; characterIds?: Id[] }
  | { type: 'CommitTurn' }
  | { type: 'RollEvict' }
  | { type: 'AddLegacy'; text: string; evictId?: Id }
  | { type: 'RollExplore' }
  | { type: 'ExploreLegacy'; legacyId?: Id }
  | { type: 'EndRound'; mood?: -1 | 0 | 1; cohesion?: -1 | 0 | 1 }
  | { type: 'ReviseProse'; entryId: Id; prose: string }
  | { type: 'Retcon'; targetId: Id; field: string; after: unknown; reason: string }
  | { type: 'RollSeedAnswer'; seedId: Id; questionId: string }
  | {
      type: 'ApplySeed';
      seedId: Id;
      answers: Record<Id, SeedAnswer>;
      start: BookendAnswer;
      end: BookendAnswer;
    }
  | { type: 'RollGenerator'; generatorId: Id }
  | { type: 'AcceptGeneratorReading'; swapped: boolean };

export type SeedAnswer = { optionIds: Id[] } | { custom: string };
export type BookendAnswer = { optionId: Id } | { custom: { title?: string; text: string } };

export type CommandType = Command['type'];

export type RejectionCode =
  | 'no-game'
  | 'game-exists'
  | 'invalid'
  | 'wrong-phase'
  | 'not-found'
  | 'locked'
  | 'enforced'
  | 'roll-required'
  | 'already-rolled'
  | 'illegal-placement'
  | 'cap-reached'
  | 'content-missing'
  | 'chronicle'
  | 'setup-advanced'
  | 'unknown-content';

export interface Rejection {
  code: RejectionCode;
  message: string;
}

export interface Env {
  newId(): Id;
  now(): string;
  content: Content;
}

export type Result =
  { ok: true; events: GameEvent[]; state: Game } | { ok: false; rejection: Rejection };

class Reject extends Error {
  constructor(public rejection: Rejection) {
    super(rejection.message);
  }
}
function reject(code: RejectionCode, message: string): never {
  throw new Reject({ code, message });
}
function check(cond: unknown, code: RejectionCode, message: string): asserts cond {
  if (!cond) reject(code, message);
}

// ---------------------------------------------------------------------------------------------
// Transaction: applies drafts as they are emitted so later steps see earlier effects.

class Tx {
  drafts: EventDraft[] = [];
  events: GameEvent[] = [];
  constructor(
    public g: Game,
    public env: Env,
  ) {}

  emit<T extends EventType>(type: T, payload: EventPayloads[T]) {
    const gameId =
      type === 'GameCreated' ? (payload as EventPayloads['GameCreated']).id : this.g.id;
    const batch = (this.events[0]?.seq ?? this.g.seq + 1) as number;
    const ev = {
      id: this.env.newId(),
      gameId,
      seq: this.g.seq + 1,
      batch,
      at: this.env.now(),
      type,
      payload,
    } as GameEvent;
    this.events.push(ev);
    this.g = apply(this.g, ev);
  }

  /** Raw die roll, recorded as RollMade. */
  roll(purpose: string, sides: number, extra: Partial<EventPayloads['RollMade']> = {}): number {
    const [result, rng] = rollDie(this.g.rng, sides);
    this.emit('RollMade', { purpose, sides, result, ...extra, rng });
    return result;
  }

  /** Rolled; the recorded value and text are computed from the result. */
  rollWith<T>(
    purpose: string,
    sides: number,
    f: (r: number) => { value: T; text?: string; tableId?: Id; targetId?: Id },
  ): T {
    const [result, rng] = rollDie(this.g.rng, sides);
    const { value, text, tableId, targetId } = f(result);
    const payload: EventPayloads['RollMade'] = { purpose, sides, result, rng };
    if (value !== undefined) payload.value = value;
    if (text !== undefined) payload.text = text;
    if (tableId !== undefined) payload.tableId = tableId;
    if (targetId !== undefined) payload.targetId = targetId;
    this.emit('RollMade', payload);
    return value;
  }

  /** Weighted pick as a single d(total) roll. `record` puts the pick into the event's value. */
  weighted<T>(
    purpose: string,
    items: { item: T; weight: number }[],
    describe: (t: T) => string,
    record = true,
  ): T {
    const live = items.filter((i) => i.weight > 0);
    check(live.length, 'content-missing', `nothing to roll for ${purpose}`);
    const total = live.reduce((s, i) => s + i.weight, 0);
    let chosen: T | undefined;
    this.rollWith(purpose, total, (r) => {
      let acc = 0;
      for (const i of live) {
        acc += i.weight;
        if (r <= acc) {
          chosen = i.item;
          break;
        }
      }
      return { value: record ? chosen : undefined, text: describe(chosen as T) };
    });
    return chosen as T;
  }

  rollTable(purpose: string, t: Table, valueFor?: (text: string) => unknown): string {
    check(t.category !== 'wordPair', 'invalid', 'word-pair tables roll through rollWordPair');
    return this.rollList(purpose, t.id, (t as ListTable).entries, t.die, valueFor);
  }

  rollList(
    purpose: string,
    tableId: Id,
    entries: TableEntry[],
    die: number | undefined,
    valueFor?: (text: string) => unknown,
  ): string {
    check(entries.length, 'content-missing', `table ${tableId} is empty`);
    const ranged = die !== undefined && entries.every((e) => e.range);
    const sides = ranged ? die! : entries.reduce((s, e) => s + (e.weight ?? 1), 0);
    let text = '';
    this.rollWith(purpose, sides, (r) => {
      if (ranged) {
        const hit = entries.find((e) => r >= e.range![0] && r <= e.range![1]);
        text = hit?.text ?? '';
      } else {
        let acc = 0;
        for (const e of entries) {
          acc += e.weight ?? 1;
          if (r <= acc) {
            text = e.text;
            break;
          }
        }
      }
      return { value: valueFor ? valueFor(text) : undefined, text, tableId };
    });
    return text;
  }

  drawCard(
    purpose: string,
    opts: {
      targetId?: Id;
      role?: string;
      filter?: (c: Card) => boolean;
      valueFor?: (c: Card, keyword: string) => unknown;
    } = {},
  ): { card: Card; reversed: boolean; keyword: string } {
    const deck = this.g.deck;
    check(deck, 'content-missing', 'this game has no deck');
    const content = this.env.content.decks[deck.deckId];
    check(content, 'content-missing', `deck ${deck.deckId} is not installed`);
    const eligible = () =>
      this.g.deck!.remaining.filter((id) => {
        const c = content.cards.find((x) => x.id === id);
        return c && (!opts.filter || opts.filter(c));
      });
    let pool = eligible();
    if (!pool.length) {
      this.emit('DeckReshuffled', { deckId: deck.deckId, rng: this.g.rng });
      pool = eligible();
      check(pool.length, 'content-missing', 'no eligible cards in deck');
    }
    const [idx, afterPick] = rollDie(this.g.rng, pool.length);
    let rng = afterPick;
    const card = content.cards.find((c) => c.id === pool[idx - 1])!;
    let reversed = false;
    if (this.g.settings.deck.reversals) {
      let r: number;
      [r, rng] = rollDie(rng, 2);
      reversed = r === 2;
    }
    const keyword = reversed ? card.reversed : card.upright;
    const payload: EventPayloads['CardDrawn'] = {
      purpose,
      deckId: deck.deckId,
      cardId: card.id,
      reversed,
      keyword,
      rng,
    };
    if (opts.targetId) payload.targetId = opts.targetId;
    if (opts.role) payload.role = opts.role;
    if (opts.valueFor) payload.value = opts.valueFor(card, keyword);
    this.emit('CardDrawn', payload);
    return { card, reversed, keyword };
  }

  override(mechanic: OverridableMechanic, rolled: unknown, chosen: unknown, targetId?: Id) {
    const p: EventPayloads['OverrideUsed'] = { mechanic, rolled, chosen };
    if (targetId) p.targetId = targetId;
    this.emit('OverrideUsed', p);
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers

const MAX = {
  bigPicture: 200,
  title: 60,
  focus: 80,
  question: 140,
  answer: 200,
  legacy: 80,
  palette: 60,
};

function requireText(v: string | undefined, max: number, what: string): string {
  const t = (v ?? '').trim();
  check(t.length > 0, 'invalid', `${what} is required`);
  check(t.length <= max, 'invalid', `${what} must be at most ${max} characters`);
  return t;
}

function mode(g: Game, m: keyof Settings['modes']): Mode {
  return g.settings.modes[m];
}

export function currentRound(g: Game): Round | undefined {
  return g.rounds[g.rounds.length - 1];
}

function openRound(g: Game): Round {
  const r = currentRound(g);
  check(r && !r.ended, 'wrong-phase', 'no round in progress');
  return r;
}

function seatById(g: Game, id: Id): Seat {
  const s = g.seats.find((x) => x.id === id);
  check(s, 'not-found', `seat ${id} not found`);
  return s;
}

export function nextSeat(g: Game): Seat {
  const s = g.seats[g.nextSeatIndex % Math.max(1, g.seats.length)];
  check(s, 'wrong-phase', 'no seats configured');
  return s;
}

/** The seat whose tables drive a draw right now: the turn's seat, else the Lens seat, else the player. */
export function activeSeat(g: Game): Seat | undefined {
  if (g.turn) return g.seats.find((s) => s.id === g.turn!.seatId);
  const r = currentRound(g);
  if (r && !r.ended) {
    if (r.legacyAddedId) return g.seats[g.nextSeatIndex % g.seats.length];
    return g.seats.find((s) => s.id === r.lensSeatId);
  }
  return g.seats.find((s) => s.kind === 'player');
}

export function seatTables(
  g: Game,
  content: Content,
  seat: Seat | undefined,
  category: Table['category'],
): Table[] {
  const active = new Set(g.settings.activeTables);
  const ids = seat && seat.tables.length ? seat.tables.filter((t) => active.has(t)) : [...active];
  return ids
    .map((id) => content.tables[id])
    .filter((t): t is Table => !!t && t.category === category);
}

function firstPassEntries(g: Game): Entry[] {
  return Object.values(g.entries).filter((e) => e.firstPass);
}

export function setupComplete(g: Game): boolean {
  const hasPremise = g.ruleset === 'chronicle' ? !!g.subject : !!g.bigPicture;
  return (
    hasPremise &&
    periods(g).some((p) => p.bookend === 'start') &&
    firstPassEntries(g).length >= g.seats.length &&
    g.dialsSet
  );
}

function inPlay(g: Game): boolean {
  return g.rounds.length > 0;
}

function betweenRounds(g: Game): boolean {
  const r = currentRound(g);
  return !r || r.ended;
}

function isPip(c: Card): boolean {
  return c.arcana === 'minor' && typeof c.rank === 'number' && c.rank >= 1 && c.rank <= 10;
}

function resolveAnchor(tx: Tx, a: AnchorInput | undefined): Character | undefined {
  if (!a) return undefined;
  if (a.characterId) {
    const c = tx.g.characters[a.characterId];
    check(c, 'not-found', `character ${a.characterId} not found`);
    return c;
  }
  const name = requireText(a.name, 60, 'anchor name');
  const character = {
    id: tx.env.newId(),
    name,
    description: (a.description ?? '').trim().slice(0, 140),
    immortal: !!a.immortal,
  };
  tx.emit('CharacterCreated', { character });
  return tx.g.characters[character.id]!;
}

function anchorPeriods(g: Game, characterId: Id): Id[] {
  return periods(g)
    .filter((p) => p.anchorId === characterId)
    .map((p) => p.id);
}

/** Chronicle hard rule: a mortal Anchor may not appear in a Period other than the one it anchors. */
function checkMortalAnchors(g: Game, characterIds: Id[], periodId: Id | undefined) {
  if (g.ruleset !== 'chronicle' || !periodId) return;
  for (const id of characterIds) {
    const c = g.characters[id];
    if (!c || c.immortal) continue;
    const anchored = anchorPeriods(g, id);
    check(
      anchored.length === 0 || anchored.every((p) => p === periodId),
      'chronicle',
      `${c.name} is the mortal Anchor of another Period and cannot appear here`,
    );
  }
}

function validateChronicleCharacters(g: Game, ids: Id[], periodId: Id | undefined) {
  for (const id of ids) check(g.characters[id], 'not-found', `character ${id} not found`);
  checkMortalAnchors(g, ids, periodId);
}

// ---------------------------------------------------------------------------------------------
// Entry construction

function buildEntry(
  tx: Tx,
  args: {
    kind: EntryKind;
    title: string;
    tone: Tone;
    placement: Placement;
    prose?: string;
    seatId: Id;
    round: number;
    focus?: string;
    legacyId?: Id;
    firstPass?: boolean;
    anchor?: AnchorInput;
    change?: TraitChange;
  },
): Entry {
  const g = tx.g;
  const title = requireText(args.title, MAX.title, 'title');
  check(
    isLegalSlot(g, args.kind, args.placement),
    'illegal-placement',
    `illegal ${args.kind} placement ${slotKey(args.placement)}`,
  );
  const order = orderKeyFor(g, args.kind, args.placement);
  const base = {
    id: tx.env.newId(),
    title,
    tone: args.tone,
    order,
    prose: args.prose ?? '',
    revisions: [],
    createdInRound: args.round,
    seatId: args.seatId,
    locked: !!args.firstPass,
    ...(args.focus ? { focus: args.focus } : {}),
    ...(args.legacyId ? { legacyId: args.legacyId } : {}),
    ...(args.firstPass ? { firstPass: true } : {}),
  };
  if (args.kind === 'period') {
    const period: Period = { ...base, kind: 'period' };
    if (g.ruleset === 'chronicle') {
      check(args.anchor, 'chronicle', 'a Chronicle Period needs an Anchor');
      check(args.change, 'chronicle', 'a Chronicle Period needs a Change to the subject');
      const next = applyChange(traitsBefore(g, order), args.change);
      check(
        Array.isArray(next),
        'chronicle',
        `invalid Change: ${(next as { error: string }).error}`,
      );
      const anchor = resolveAnchor(tx, args.anchor)!;
      check(
        anchor.immortal || anchor.entryIds.every((id) => !periodOf(tx.g, id)),
        'chronicle',
        `${anchor.name} is mortal and already appears in another Period`,
      );
      period.anchorId = anchor.id;
      period.change = args.change;
    }
    return period;
  }
  if (args.kind === 'event') {
    const parent = g.entries[args.placement.parentId ?? ''];
    check(parent?.kind === 'period', 'illegal-placement', 'an Event belongs to a Period');
    return { ...base, kind: 'event', periodId: parent.id };
  }
  const parent = g.entries[args.placement.parentId ?? ''];
  check(parent?.kind === 'event', 'illegal-placement', 'a Scene belongs to an Event');
  return {
    ...base,
    kind: 'scene',
    eventId: parent.id,
    question: '',
    form: 'played',
    requiredCharacterIds: [],
    bannedCharacterIds: [],
    budget: { ...g.settings.scene.defaultBudget },
    oracleCalls: [],
    characterIds: [],
  };
}

function frameScene(tx: Tx, entryId: Id, f: SceneFrameInput | undefined) {
  check(f, 'invalid', 'a Scene needs a frame (Question, form)');
  const question = requireText(f.question, MAX.question, 'Question');
  const req = f.requiredCharacterIds ?? [];
  const banned = f.bannedCharacterIds ?? [];
  check(req.length <= 2, 'invalid', 'at most 2 required characters');
  check(banned.length <= 1, 'invalid', 'at most 1 banned character');
  check(
    !req.some((r) => banned.includes(r)),
    'invalid',
    'a character cannot be both required and banned',
  );
  for (const id of [...req, ...banned])
    check(tx.g.characters[id], 'not-found', `character ${id} not found`);
  checkMortalAnchors(tx.g, req, periodOf(tx.g, entryId)?.id);
  const budget = f.budget ?? tx.g.settings.scene.defaultBudget;
  check(budget.min >= 0 && budget.max >= budget.min, 'invalid', 'invalid word budget');
  check(f.form === 'played' || f.form === 'dictated', 'invalid', 'form must be played or dictated');
  const payload: EventPayloads['SceneFramed'] = {
    entryId,
    question,
    form: f.form,
    requiredCharacterIds: req,
    bannedCharacterIds: banned,
    budget: { min: budget.min, max: budget.max },
  };
  const setting = f.setting?.trim();
  if (setting) payload.setting = setting.slice(0, 140);
  tx.emit('SceneFramed', payload);
}

// ---------------------------------------------------------------------------------------------
// Rolls used by several commands

function rollTone(tx: Tx) {
  const g = tx.g;
  if (mode(g, 'tone') === 'off') return;
  if (g.settings.deck.toneFromPip && g.deck) {
    const drawn = tx.drawCard('tone', {
      valueFor: (c) => (isPip(c) ? toneFromRoll(c.rank as number, g.dials.mood) : undefined),
    });
    if (isPip(drawn.card)) return;
  }
  tx.rollWith('tone', 10, (r) => {
    const value = toneFromRoll(r, tx.g.dials.mood);
    return { value, text: value === 'light' ? 'Light' : 'Dark' };
  });
}

function rollEntryType(tx: Tx, seat: Seat, legacyTurn: boolean) {
  if (mode(tx.g, 'entryType') === 'off') return;
  const kinds = (legacyTurn ? ['event', 'scene'] : ['period', 'event', 'scene']).filter(
    (k) => legalSlots(tx.g, k as EntryKind).length > 0,
  ) as EntryKind[];
  // Seat weights, then global weights, then uniform — whichever gives a legal kind a chance.
  const tables = [
    seat.entryTypeWeights,
    tx.g.settings.entryTypeWeights,
    { period: 1, event: 1, scene: 1 },
  ];
  const w = tables.find((t) => t && kinds.some((k) => t[k] > 0))!;
  tx.weighted(
    'entryType',
    kinds.map((k) => ({ item: k, weight: w[k] })),
    (k) => k,
  );
}

function startTurn(tx: Tx, seat: Seat, kind: 'normal' | 'legacy', legacyId?: Id) {
  const p: EventPayloads['TurnStarted'] = { seatId: seat.id, kind };
  if (legacyId) p.legacyId = legacyId;
  tx.emit('TurnStarted', p);
  rollTone(tx);
  rollEntryType(tx, seat, kind === 'legacy');
}

/** Resolve a player's choice against a rolled value under a mode. Returns the effective value. */
function choose<T>(
  tx: Tx,
  mechanic: OverridableMechanic,
  m: Mode,
  rolled: T | undefined,
  chosen: T | undefined,
  eq: (a: T, b: T) => boolean = (a, b) => a === b,
  targetId?: Id,
): T {
  if (m === 'off') {
    check(chosen !== undefined, 'invalid', `${mechanic} must be chosen`);
    return chosen;
  }
  check(rolled !== undefined, 'roll-required', `${mechanic} must be rolled first`);
  if (chosen === undefined || eq(rolled, chosen)) return rolled;
  check(
    m === 'prompt',
    'enforced',
    `${mechanic} is enforced; the roll stands (retcon to change it later)`,
  );
  tx.override(mechanic, rolled, chosen, targetId);
  return chosen;
}

const samePlacement = (a: Placement, b: Placement) => slotKey(a) === slotKey(b);

// ---------------------------------------------------------------------------------------------
// Round-phase helpers (also used by the UI)

export type Step =
  | 'setup'
  | 'start-round'
  | 'focus'
  | 'start-turn'
  | 'turn'
  | 'cohesion'
  | 'add-legacy'
  | 'explore-legacy'
  | 'legacy-turn'
  | 'adjust-dials';

export function nextStep(g: Game): Step {
  if (!inPlay(g)) return setupComplete(g) ? 'start-round' : 'setup';
  const r = currentRound(g)!;
  if (r.ended) return 'start-round';
  if (!r.focus) return 'focus';
  if (g.turn) return g.turn.kind === 'legacy' ? 'legacy-turn' : 'turn';
  if (!r.turns.length) return 'start-turn';
  if (!r.legacyAddedId) {
    const normal = r.turns.filter((t) => t.kind === 'normal').length;
    return normal >= g.settings.cohesionCap ? 'add-legacy' : 'cohesion';
  }
  if (!r.legacyExploredId) return 'explore-legacy';
  return 'adjust-dials';
}

function normalTurns(r: Round): number {
  return r.turns.filter((t) => t.kind === 'normal').length;
}

/** Validates leaving the cohesion decision (take extra turn or not). */
function resolveCohesion(tx: Tx, extraTurn: boolean) {
  const g = tx.g;
  const r = openRound(g);
  if (normalTurns(r) >= g.settings.cohesionCap) {
    check(!extraTurn, 'cap-reached', `turn cap (${g.settings.cohesionCap}) reached this round`);
    return;
  }
  const m = mode(g, 'cohesion');
  if (m === 'off') return;
  const rolled = g.pendingRoundRolls.cohesion;
  check(rolled !== undefined, 'roll-required', 'cohesion must be rolled first');
  if (rolled === extraTurn) return;
  check(
    m === 'prompt',
    'enforced',
    rolled ? 'cohesion passed: take another turn' : 'cohesion failed: move on to Legacies',
  );
  tx.override('cohesion', rolled, extraTurn);
}

// ---------------------------------------------------------------------------------------------
// Command handlers

type Handler<C extends Command> = (tx: Tx, c: C) => void;
type Handlers = { [K in CommandType]: Handler<Extract<Command, { type: K }>> };

const handlers: Handlers = {
  CreateGame: (tx, c) => {
    check(!tx.g.id, 'game-exists', 'game already created');
    const title = requireText(c.title, 80, 'game title');
    const settings = c.settings ?? {
      ...defaultSettings(),
      activeTables: Object.values(tx.env.content.tables)
        .filter((t) => t.category !== 'generator' && !t.tags?.length)
        .map((t) => t.id),
    };
    const seats = c.seats ?? [
      { id: tx.env.newId(), name: 'You', kind: 'player', tables: [], placementBias: 'uniform' },
      {
        id: tx.env.newId(),
        name: 'The Stranger',
        kind: 'phantom',
        tables: [],
        placementBias: 'sparse',
      },
    ];
    validateSeats(seats);
    const deckId = c.deckId ?? Object.keys(tx.env.content.decks)[0];
    const deck = deckId ? tx.env.content.decks[deckId] : undefined;
    const payload: EventPayloads['GameCreated'] = {
      id: c.id,
      title,
      ruleset: c.ruleset,
      seed: c.seed,
      rng: seedToState(c.seed),
      settings,
      seats,
      schemaVersion: SCHEMA_VERSION,
    };
    if (deck) payload.deck = { deckId: deck.id, cardIds: deck.cards.map((x) => x.id) };
    tx.emit('GameCreated', payload);
  },

  SetBigPicture: (tx, c) => {
    check(tx.g.ruleset === 'lens', 'wrong-phase', 'Chronicle games set a Subject instead');
    check(
      !inPlay(tx.g),
      'wrong-phase',
      'the Big Picture is fixed once play starts (retcon to change it)',
    );
    tx.emit('BigPictureSet', { text: requireText(c.text, MAX.bigPicture, 'Big Picture') });
  },

  SetSubject: (tx, c) => {
    check(tx.g.ruleset === 'chronicle', 'wrong-phase', 'only Chronicle games have a Subject');
    check(
      !inPlay(tx.g) && !periods(tx.g).length,
      'wrong-phase',
      'the Subject is set before the Bookends',
    );
    const name = requireText(c.subject.name, 60, 'subject name');
    const description = requireText(c.subject.description, MAX.bigPicture, 'subject description');
    const traits = c.subject.traits.map((t) => t.trim()).filter(Boolean);
    check(traits.length >= 3 && traits.length <= 5, 'invalid', 'a Subject needs 3–5 traits');
    check(new Set(traits).size === traits.length, 'invalid', 'traits must be distinct');
    tx.emit('SubjectSet', { subject: { name, description, traits } });
  },

  SetBookends: (tx, c) => {
    const g = tx.g;
    check(
      g.ruleset === 'chronicle' ? g.subject : g.bigPicture,
      'wrong-phase',
      'set the premise first',
    );
    check(!periods(g).length, 'wrong-phase', 'Bookends are already set');
    const characters: Character[] = [];
    const mk = (b: BookendInput, which: 'start' | 'end', order: string): Period => {
      const p: Period = {
        id: tx.env.newId(),
        kind: 'period',
        bookend: which,
        title: requireText(b.title, MAX.title, `${which} Bookend title`),
        tone: b.tone,
        order,
        prose: b.prose ?? '',
        revisions: [],
        createdInRound: 0,
        seatId: g.seats.find((s) => s.kind === 'player')!.id,
        locked: true,
      };
      if (g.ruleset === 'chronicle') {
        check(b.anchor, 'chronicle', `the ${which} Bookend needs an Anchor`);
        let anchorId = b.anchor.characterId;
        if (anchorId) {
          check(
            characters.some((x) => x.id === anchorId) || g.characters[anchorId],
            'not-found',
            'anchor not found',
          );
        } else {
          const ch: Character = {
            id: tx.env.newId(),
            name: requireText(b.anchor.name, 60, 'anchor name'),
            description: (b.anchor.description ?? '').trim().slice(0, 140),
            immortal: !!b.anchor.immortal,
            entryIds: [],
          };
          characters.push(ch);
          anchorId = ch.id;
        }
        p.anchorId = anchorId;
      }
      return p;
    };
    const start = mk(c.start, 'start', 'a0');
    const end = mk(c.end, 'end', 'a1');
    if (g.ruleset === 'chronicle' && start.anchorId === end.anchorId) {
      const ch = characters.find((x) => x.id === start.anchorId) ?? g.characters[start.anchorId!];
      check(ch?.immortal, 'chronicle', 'a mortal Anchor cannot anchor both Bookends');
    }
    tx.emit('BookendsSet', { start, end, characters });
  },

  AddPaletteItem: (tx, c) => {
    check(!tx.g.turn, 'wrong-phase', 'finish the open turn first');
    const text = requireText(c.text, MAX.palette, 'Palette item');
    tx.emit('PaletteItemAdded', {
      list: c.list,
      item: { id: tx.env.newId(), text, rolled: false },
    });
  },

  RemovePaletteItem: (tx, c) => {
    check(
      !inPlay(tx.g) || betweenRounds(tx.g),
      'wrong-phase',
      'the Palette changes between rounds',
    );
    check(
      [...tx.g.palette.yes, ...tx.g.palette.no].some((i) => i.id === c.id),
      'not-found',
      'no such Palette item',
    );
    tx.emit('PaletteItemRemoved', { id: c.id });
  },

  RollPaletteItem: (tx) => {
    const g = tx.g;
    check(mode(g, 'palette.roll') !== 'off', 'wrong-phase', 'rolled Palette items are off');
    check(!inPlay(g), 'wrong-phase', 'rolled Palette items are part of setup');
    check(!g.pendingPalette, 'already-rolled', 'assign the rolled item first');
    check(
      g.paletteRolled < g.settings.paletteRollCount,
      'cap-reached',
      'all rolled Palette items are placed',
    );
    rollPalette(tx, false);
  },

  RerollPaletteItem: (tx) => {
    const g = tx.g;
    check(g.pendingPalette, 'wrong-phase', 'nothing to reroll');
    check(
      mode(g, 'palette.roll') === 'prompt',
      'enforced',
      'rerolls are only allowed in prompt mode',
    );
    check(!g.pendingPalette.rerolled, 'cap-reached', 'one reroll per item');
    rollPalette(tx, true);
  },

  AssignPaletteRoll: (tx, c) => {
    const pending = tx.g.pendingPalette;
    check(pending, 'wrong-phase', 'no rolled Palette item to assign');
    tx.emit('PaletteItemAdded', {
      list: c.list,
      item: { id: tx.env.newId(), text: pending.text, rolled: true },
    });
  },

  ConfigureSeats: (tx, c) => {
    const g = tx.g;
    const sameRoster =
      c.seats.length === g.seats.length &&
      c.seats.every((s, i) => s.id === g.seats[i]?.id && s.kind === g.seats[i]?.kind);
    const okTime = inPlay(g) ? betweenRounds(g) : sameRoster || !firstPassEntries(g).length;
    check(
      okTime,
      'wrong-phase',
      'seats change between rounds; the roster is fixed once the First Pass starts',
    );
    validateSeats(c.seats);
    tx.emit('SeatsConfigured', { seats: c.seats });
  },

  AddFirstPassEntry: (tx, c) => {
    const g = tx.g;
    check(periods(g).length >= 2, 'wrong-phase', 'set the Bookends first');
    check(!inPlay(g), 'wrong-phase', 'the First Pass is over');
    const done = firstPassEntries(g).length;
    check(done < g.seats.length, 'cap-reached', 'every seat has added its First Pass entry');
    check(
      c.kind === 'period' || c.kind === 'event',
      'invalid',
      'the First Pass adds a Period or an Event',
    );
    const entry = buildEntry(tx, {
      kind: c.kind,
      title: c.title,
      tone: c.tone,
      placement: c.placement,
      prose: c.prose,
      seatId: g.seats[done]!.id,
      round: 0,
      firstPass: true,
      anchor: c.anchor,
      change: c.change,
    });
    tx.emit('EntryCreated', { entry });
  },

  SetDials: (tx, c) => {
    check(!inPlay(tx.g), 'wrong-phase', 'dials are set at setup; they drift after each round');
    for (const [k, v] of Object.entries({ mood: c.mood, cohesion: c.cohesion })) {
      check(Number.isInteger(v) && v >= 1 && v <= 9, 'invalid', `${k} must be 1–9`);
    }
    const p: EventPayloads['DialsSet'] = { mood: c.mood, cohesion: c.cohesion };
    if (tx.g.settings.chaos) {
      const chaos = c.chaos ?? 5;
      check(Number.isInteger(chaos) && chaos >= 1 && chaos <= 9, 'invalid', 'chaos must be 1–9');
      p.chaos = chaos;
    }
    tx.emit('DialsSet', p);
  },

  ChangeSettings: (tx, c) => {
    check(!tx.g.turn, 'wrong-phase', 'settings change between turns');
    const s = c.settings;
    check(s.cohesionCap >= 1 && s.cohesionCap <= 50, 'invalid', 'cohesion cap must be 1–50');
    check(
      Object.values(s.entryTypeWeights).every((w) => w >= 0),
      'invalid',
      'weights must be ≥ 0',
    );
    tx.emit('SettingsChanged', { settings: s });
    if (s.chaos && tx.g.dials.chaos === undefined && tx.g.dialsSet) {
      tx.emit('DialsSet', { ...tx.g.dials, chaos: 5 });
    }
  },

  StartRound: (tx) => {
    const g = tx.g;
    check(setupComplete(g), 'wrong-phase', 'finish setup first');
    check(betweenRounds(g), 'wrong-phase', 'the current round has not ended');
    const n = g.rounds.length + 1;
    const lens = g.seats[(n - 1) % g.seats.length]!;
    tx.emit('RoundStarted', { n, lensSeatId: lens.id });
    if (focusModeFor(g.settings, lens) === 'enforce') {
      const f = rollFocus(tx, lens);
      tx.emit('FocusSet', f);
    }
  },

  RollFocus: (tx) => {
    const r = openRound(tx.g);
    check(!r.focus, 'already-rolled', 'the Focus is set');
    check(!tx.g.pendingRoundRolls.focus, 'already-rolled', 'the Focus is already rolled');
    const lens = seatById(tx.g, r.lensSeatId);
    const m = focusModeFor(tx.g.settings, lens);
    check(m !== 'off', 'wrong-phase', 'the Focus is written by the player this round');
    const f = rollFocus(tx, lens);
    if (m === 'enforce') tx.emit('FocusSet', f);
  },

  SetFocus: (tx, c) => {
    const r = openRound(tx.g);
    check(!r.focus, 'wrong-phase', 'the Focus is set');
    const lens = seatById(tx.g, r.lensSeatId);
    const m = focusModeFor(tx.g.settings, lens);
    const rolled = tx.g.pendingRoundRolls.focus;
    const text = c.text === undefined ? undefined : requireText(c.text, MAX.focus, 'Focus');
    if (m === 'off') {
      tx.emit('FocusSet', { text: text ?? reject('invalid', 'write a Focus'), source: 'player' });
      return;
    }
    const chosen = choose(tx, 'focus.source', m, rolled?.text, text);
    tx.emit('FocusSet', {
      text: chosen,
      source: chosen === rolled?.text ? rolled.source : 'player',
    });
  },

  StartTurn: (tx) => {
    const g = tx.g;
    const r = openRound(g);
    check(r.focus, 'wrong-phase', 'set the Focus first');
    check(!g.turn, 'wrong-phase', 'a turn is already open');
    check(!r.legacyAddedId, 'wrong-phase', 'this round has moved on to Legacies');
    if (r.turns.length) resolveCohesion(tx, true);
    startTurn(tx, nextSeat(g), 'normal');
  },

  RollPlacement: (tx, c) => {
    const g = tx.g;
    const t = g.turn;
    check(t, 'wrong-phase', 'no open turn');
    check(!t.entryId, 'wrong-phase', 'the entry is already placed');
    check(mode(g, 'placement') !== 'off', 'wrong-phase', 'placement is chosen by the player');
    check(!t.rolled.placement, 'already-rolled', 'placement is already rolled this turn');
    check(
      !(t.kind === 'legacy' && c.kind === 'period'),
      'invalid',
      'a Legacy turn adds an Event or Scene',
    );
    const em = mode(g, 'entryType');
    if (em !== 'off') {
      const rolled = t.rolled.entryType;
      check(rolled, 'roll-required', 'entry type must be rolled first');
      if (rolled !== c.kind) {
        check(em === 'prompt', 'enforced', `entry type is enforced: ${rolled}`);
        tx.override('entryType', rolled, c.kind);
      }
    }
    const seat = seatById(g, t.seatId);
    const slots = weightedSlots(tx.g, c.kind, seat.placementBias);
    check(slots.length, 'illegal-placement', `no legal slot for a ${c.kind}`);
    tx.weighted(
      'placement',
      slots.map((s) => ({ item: { kind: c.kind, placement: s.slot.placement }, weight: s.weight })),
      (v) => describePlacement(tx.g, v.kind, v.placement),
    );
  },

  CreateEntry: (tx, c) => {
    const g = tx.g;
    const t = g.turn;
    check(t, 'wrong-phase', 'no open turn');
    check(!t.entryId, 'wrong-phase', 'this turn already has its entry');
    check(
      !(t.kind === 'legacy' && c.kind === 'period'),
      'invalid',
      'a Legacy turn adds an Event or Scene',
    );
    const r = openRound(g);

    const pm = mode(g, 'placement');
    const rolledPlacement = t.rolled.placement;
    let kind = c.kind;
    if (rolledPlacement) {
      check(
        rolledPlacement.kind === kind,
        'invalid',
        `placement was rolled for a ${rolledPlacement.kind}`,
      );
    } else {
      const em = mode(g, 'entryType');
      if (em !== 'off') kind = choose(tx, 'entryType', em, t.rolled.entryType, c.kind);
    }
    const placement =
      pm === 'off'
        ? c.placement
        : choose(tx, 'placement', pm, rolledPlacement?.placement, c.placement, samePlacement);
    const tone = choose(tx, 'tone', mode(g, 'tone'), t.rolled.tone, c.tone);

    const entry = buildEntry(tx, {
      kind,
      title: c.title,
      tone,
      placement,
      prose: c.prose,
      seatId: t.seatId,
      round: r.n,
      focus: t.kind === 'normal' ? r.focus : undefined,
      legacyId: t.legacyId,
      anchor: c.anchor,
      change: c.change,
    });
    tx.emit('EntryCreated', { entry });
    if (entry.kind === 'scene') frameScene(tx, entry.id, c.scene);
  },

  EditProse: (tx, c) => {
    const e = tx.g.entries[c.entryId];
    check(e, 'not-found', 'entry not found');
    check(!e.locked, 'locked', 'locked entries are revised, not edited');
    check(tx.g.turn?.entryId === e.id, 'wrong-phase', 'only the open turn’s entry is edited');
    tx.emit('EntryProseEdited', { entryId: e.id, prose: c.prose });
  },

  CreateCharacter: (tx, c) => {
    const character = {
      id: tx.env.newId(),
      name: requireText(c.name, 60, 'character name'),
      description: (c.description ?? '').trim().slice(0, 140),
      immortal: !!c.immortal,
    };
    tx.emit('CharacterCreated', { character });
  },

  FrameScene: (tx, c) => {
    const e = openScene(tx.g, c.entryId);
    check(
      !e.prose.trim() && !e.spread?.length && !e.reversal,
      'wrong-phase',
      'the frame is fixed once drafting starts',
    );
    frameScene(tx, e.id, c.frame);
  },

  DrawSpread: (tx, c) => {
    const e = openScene(tx.g, c.entryId);
    check(!e.spread?.length, 'already-rolled', 'the spread is already drawn');
    for (const role of ['setup', 'complication', 'pressure']) {
      tx.drawCard('scene.spread', { targetId: e.id, role });
    }
  },

  DrawReversal: (tx, c) => {
    const g = tx.g;
    const e = openScene(g, c.entryId);
    check(mode(g, 'scene.reversal') !== 'off', 'wrong-phase', 'reversals are off');
    check(!g.turn!.rolled.reversal && !e.reversal, 'already-rolled', 'one reversal per Scene');
    const seat = seatById(g, g.turn!.seatId);
    const tables = seatTables(g, tx.env.content, seat, 'reversal');
    if (tables.length) {
      const table = tables.length === 1 ? tables[0]! : pickTable(tx, tables);
      tx.rollTable('scene.reversal', table, (text) => ({ source: table.name, text }));
    } else {
      tx.drawCard('scene.reversal', {
        targetId: e.id,
        valueFor: (card, kw) => ({ source: card.name, text: kw }),
      });
    }
  },

  PlaceReversal: (tx, c) => {
    const g = tx.g;
    const e = openScene(g, c.entryId);
    check(!e.reversal, 'already-rolled', 'the reversal is placed');
    const rolled = g.turn!.rolled.reversal;
    check(rolled, 'roll-required', 'draw the reversal first');
    check(
      Number.isInteger(c.offset) && c.offset >= 0 && c.offset <= e.prose.length,
      'invalid',
      'offset outside the draft',
    );
    const text = c.text === undefined ? rolled.text : requireText(c.text, 140, 'reversal');
    let source = rolled.source;
    if (text !== rolled.text) {
      check(mode(g, 'scene.reversal') === 'prompt', 'enforced', 'the reversal is enforced');
      tx.override('scene.reversal', rolled, { source: 'player', text }, e.id);
      source = 'player';
    }
    tx.emit('ReversalPlaced', { entryId: e.id, source, text, offset: c.offset });
  },

  AskOracle: (tx, c) => {
    const g = tx.g;
    const question = requireText(c.question, 200, 'question');
    check(Number.isInteger(c.odds) && c.odds >= 1 && c.odds <= 9, 'invalid', 'odds must be 1–9');
    if (c.entryId) {
      const e = g.entries[c.entryId];
      check(e?.kind === 'scene', 'not-found', 'oracle calls attach to a Scene');
      check(!e.locked, 'locked', 'the Scene is resolved');
    }
    const chaos = g.settings.chaos ? g.dials.chaos : undefined;
    const eff = effectiveOdds(c.odds, chaos);
    const roll = tx.rollWith('oracle', 10, (r) => ({
      value: r,
      text: `${r <= eff ? 'Yes' : 'No'} (${eff}/10)`,
    }));
    let qualifierRoll: number | undefined;
    if (g.settings.oracle.qualifiers) {
      qualifierRoll = tx.rollWith('oracle.qualifier', 6, (r) => ({
        value: r,
        text: qualifierFor(r) ?? 'no qualifier',
      }));
    }
    const call = {
      question,
      odds: c.odds,
      effectiveOdds: eff,
      roll,
      answer: roll <= eff,
      seq: tx.g.seq + 1,
      ...(qualifierRoll !== undefined ? { qualifierRoll } : {}),
      ...(qualifierRoll !== undefined && qualifierFor(qualifierRoll)
        ? { qualifier: qualifierFor(qualifierRoll) }
        : {}),
    };
    const p: EventPayloads['OracleAsked'] = { call };
    if (c.entryId) p.entryId = c.entryId;
    tx.emit('OracleAsked', p);
  },

  DrawPrompt: (tx, c) => {
    const g = tx.g;
    const seat = activeSeat(g);
    if (c.kind === 'card') {
      tx.drawCard('prompt.card', {
        valueFor: (card, kw) => ({ kind: 'card', text: `${card.name}: ${kw}` }),
      });
      return;
    }
    if (c.kind === 'character') {
      tx.drawCard('prompt.character', {
        filter: (card) => card.tier === 'character',
        valueFor: (card, kw) => ({ kind: 'character', text: `${card.name}: ${kw}` }),
      });
      return;
    }
    if (c.kind === 'person') {
      const people = seatTables(g, tx.env.content, seat, 'person') as ListTable[];
      const slots = PERSON_SLOTS.map(
        (slot) => [slot, people.filter((t) => t.slot === slot)] as const,
      ).filter(([, ts]) => ts.length);
      check(slots.length, 'content-missing', 'no active person tables');
      const parts: Partial<Record<PersonSlot, string>> = {};
      slots.forEach(([slot, ts], i) => {
        const table = ts.length === 1 ? ts[0]! : pickTable(tx, ts);
        const last = i === slots.length - 1;
        parts[slot] = tx.rollTable(
          `prompt.person.${slot}`,
          table,
          last
            ? (text) => ({ kind: 'person', text: personText({ ...parts, [slot]: text }) })
            : undefined,
        );
      });
      return;
    }
    const tables = seatTables(g, tx.env.content, seat, c.kind);
    check(tables.length, 'content-missing', `no active ${c.kind} tables`);
    const table = tables.length === 1 ? tables[0]! : pickTable(tx, tables);
    if (c.kind === 'domain' || c.kind === 'question') {
      const kind = c.kind;
      tx.rollTable(`prompt.${kind}`, table, (text) => ({ kind, text }));
    } else {
      const wp = table as Extract<Table, { category: 'wordPair' }>;
      const action = tx.rollList('prompt.wordPair.action', wp.id, wp.action, wp.die);
      tx.rollList('prompt.wordPair', wp.id, wp.subject, wp.die, (subject) => ({
        kind: 'wordPair',
        text: `${action} ${subject}`,
      }));
    }
  },

  ResolveScene: (tx, c) => {
    const g = tx.g;
    const e = openScene(g, c.entryId);
    check(e.question, 'invalid', 'frame the Scene first');
    check(e.prose.trim().length > 0, 'invalid', 'the draft may not be committed empty');
    if (g.settings.scene.budget === 'enforce') {
      const n = wordCount(e.prose);
      check(
        n >= e.budget.min && n <= e.budget.max,
        'invalid',
        `the draft is ${n} words; budget ${e.budget.min}–${e.budget.max}`,
      );
    }
    if (mode(g, 'scene.reversal') === 'enforce')
      check(e.reversal, 'invalid', 'place the reversal before resolving');
    const answer = requireText(c.answer, MAX.answer, 'answer');
    const characterIds = [...new Set([...(c.characterIds ?? []), ...e.requiredCharacterIds])];
    for (const b of e.bannedCharacterIds) {
      check(
        !characterIds.includes(b),
        'invalid',
        `${g.characters[b]?.name ?? b} is banned from this Scene`,
      );
    }
    validateChronicleCharacters(g, characterIds, periodOf(g, e.id)?.id);
    tx.emit('SceneResolved', { entryId: e.id, answer, characterIds });
    commitTurn(tx);
  },

  CommitTurn: (tx) => {
    const t = tx.g.turn;
    check(t, 'wrong-phase', 'no open turn');
    check(t.entryId, 'wrong-phase', 'write the entry first');
    check(
      tx.g.entries[t.entryId]!.kind !== 'scene',
      'wrong-phase',
      'a Scene commits when it is resolved',
    );
    commitTurn(tx);
  },

  RollEvict: (tx) => {
    const g = tx.g;
    const r = openRound(g);
    check(
      !g.turn && r.turns.length && !r.legacyAddedId,
      'wrong-phase',
      'evictions happen when adding a Legacy',
    );
    check(g.legacies.length >= 6, 'wrong-phase', 'there is room for another Legacy');
    check(
      mode(g, 'legacy.evict') !== 'off',
      'wrong-phase',
      'the player chooses which Legacy leaves',
    );
    check(!g.pendingRoundRolls.evict, 'already-rolled', 'eviction already rolled');
    tx.weighted(
      'legacy.evict',
      g.legacies.map((l) => ({ item: l.id, weight: 1 })),
      (id) => g.legacies.find((l) => l.id === id)!.text,
    );
  },

  AddLegacy: (tx, c) => {
    const g = tx.g;
    const r = openRound(g);
    check(r.turns.length > 0 && !g.turn, 'wrong-phase', 'add a Legacy after the round’s turns');
    check(!r.legacyAddedId, 'wrong-phase', 'this round already added its Legacy');
    const text = requireText(c.text, MAX.legacy, 'Legacy');
    resolveCohesion(tx, false);
    if (g.legacies.length >= 6) {
      const evictId = choose(
        tx,
        'legacy.evict',
        mode(g, 'legacy.evict'),
        g.pendingRoundRolls.evict,
        c.evictId,
      );
      check(
        g.legacies.some((l) => l.id === evictId),
        'not-found',
        'no such Legacy',
      );
      tx.emit('LegacyRemoved', { id: evictId });
    }
    const seat = seatById(g, r.lensSeatId);
    tx.emit('LegacyAdded', {
      legacy: { id: tx.env.newId(), text, seatId: seat.id, addedInRound: r.n },
    });
  },

  RollExplore: (tx) => {
    const g = tx.g;
    const r = openRound(g);
    check(r.legacyAddedId && !r.legacyExploredId, 'wrong-phase', 'explore after adding a Legacy');
    check(mode(g, 'legacy.explore') !== 'off', 'wrong-phase', 'the player chooses the Legacy');
    check(!g.pendingRoundRolls.explore, 'already-rolled', 'already rolled');
    const seat = nextSeat(g);
    tx.weighted(
      'legacy.explore',
      g.legacies.map((l) => ({ item: l.id, weight: l.seatId === seat.id ? 2 : 1 })),
      (id) => g.legacies.find((l) => l.id === id)!.text,
    );
  },

  ExploreLegacy: (tx, c) => {
    const g = tx.g;
    const r = openRound(g);
    check(
      r.legacyAddedId && !r.legacyExploredId && !g.turn,
      'wrong-phase',
      'explore after adding a Legacy',
    );
    const id = choose(
      tx,
      'legacy.explore',
      mode(g, 'legacy.explore'),
      g.pendingRoundRolls.explore,
      c.legacyId,
    );
    check(
      g.legacies.some((l) => l.id === id),
      'not-found',
      'no such Legacy',
    );
    tx.emit('LegacyExplored', { id });
    startTurn(tx, nextSeat(tx.g), 'legacy', id);
  },

  EndRound: (tx, c) => {
    const g = tx.g;
    const r = openRound(g);
    check(r.legacyExploredId && !g.turn, 'wrong-phase', 'explore a Legacy first');
    const before = { ...g.dials };
    const after = { ...g.dials };
    const tones = Object.values(g.entries)
      .filter((e) => e.createdInRound === r.n)
      .map((e) => e.tone);
    const rnd = (dial: string) => randomDelta(tx.roll(`drift.${dial}`, 6));
    switch (g.settings.drift) {
      case 'preference':
        for (const d of [c.mood, c.cohesion])
          check(
            d === undefined || [-1, 0, 1].includes(d),
            'invalid',
            'move each dial by -1, 0 or +1',
          );
        after.mood = clampDial(after.mood + (c.mood ?? 0));
        after.cohesion = clampDial(after.cohesion + (c.cohesion ?? 0));
        break;
      case 'random':
        after.mood = clampDial(after.mood + rnd('mood'));
        after.cohesion = clampDial(after.cohesion + rnd('cohesion'));
        break;
      case 'counter-trend':
        after.mood = clampDial(after.mood + counterTrendMoodDelta(tones));
        after.cohesion = clampDial(after.cohesion + rnd('cohesion'));
        break;
    }
    if (g.settings.chaos && after.chaos !== undefined)
      after.chaos = clampDial(after.chaos + chaosDelta(tones));
    tx.emit('DialsAdjusted', { before, after, drift: g.settings.drift });
    tx.emit('RoundEnded', { n: r.n });
  },

  ReviseProse: (tx, c) => {
    const e = tx.g.entries[c.entryId];
    check(e, 'not-found', 'entry not found');
    check(e.locked, 'wrong-phase', 'revise after the turn commits');
    check(e.prose !== c.prose, 'invalid', 'no change');
    tx.emit('ProseRevised', { entryId: e.id, prose: c.prose });
  },

  Retcon: (tx, c) => {
    const g = tx.g;
    const reason = requireText(c.reason, 500, 'retcon reason');
    let before: unknown;
    let after = c.after;
    if (c.targetId === g.id) {
      check(
        c.field === 'bigPicture',
        'invalid',
        'only the Big Picture can be retconned on the game',
      );
      before = g.bigPicture;
      after = requireText(String(c.after), MAX.bigPicture, 'Big Picture');
    } else if (g.legacies.some((l) => l.id === c.targetId)) {
      check(c.field === 'text', 'invalid', 'a Legacy retcons its text');
      before = g.legacies.find((l) => l.id === c.targetId)!.text;
      after = requireText(String(c.after), MAX.legacy, 'Legacy');
    } else if (g.characters[c.targetId]) {
      const ch = g.characters[c.targetId]!;
      check(
        ['name', 'description', 'immortal'].includes(c.field),
        'invalid',
        `cannot retcon ${c.field}`,
      );
      before = ch[c.field as 'name'];
      if (c.field === 'name') after = requireText(String(c.after), 60, 'name');
      if (c.field === 'immortal') after = !!c.after;
    } else {
      const e = g.entries[c.targetId];
      check(e, 'not-found', 'nothing to retcon');
      check(e.locked, 'wrong-phase', 'unlocked entries are changed by undo, not retcon');
      const fields: Record<Entry['kind'], string[]> = {
        period: ['title', 'tone'],
        event: ['title', 'tone'],
        scene: ['title', 'tone', 'question', 'answer', 'setting'],
      };
      check(fields[e.kind].includes(c.field), 'invalid', `cannot retcon ${c.field} on a ${e.kind}`);
      before = (e as unknown as Record<string, unknown>)[c.field];
      if (c.field === 'tone')
        check(after === 'light' || after === 'dark', 'invalid', 'tone is light or dark');
      if (c.field === 'title') after = requireText(String(after), MAX.title, 'title');
      if (c.field === 'question') after = requireText(String(after), MAX.question, 'Question');
      if (c.field === 'answer') after = requireText(String(after), MAX.answer, 'answer');
    }
    check(
      JSON.stringify(before) !== JSON.stringify(after),
      'invalid',
      'the retcon changes nothing',
    );
    tx.emit('Retconned', { targetId: c.targetId, field: c.field, before, after, reason });
  },

  RollSeedAnswer: (tx, c) => {
    startupOpen(tx.g);
    const seed = seedFor(tx, c.seedId);
    check(
      mode(tx.g, 'seed.answers') !== 'off',
      'wrong-phase',
      'seed answers are chosen, not rolled',
    );
    const options = seedOptions(seed, c.questionId);
    check(options, 'invalid', `seed ${seed.id} has no question ${c.questionId}`);
    tx.rollWith('seed.answer', options.length, (r) => {
      const o = options[r - 1]!;
      return { value: { seedId: seed.id, optionId: o.id }, text: o.text, targetId: c.questionId };
    });
  },

  ApplySeed: (tx, c) => {
    const g = tx.g;
    startupOpen(g);
    const seed = seedFor(tx, c.seedId);
    check(
      seed.ruleset === 'any' || seed.ruleset === g.ruleset,
      'invalid',
      `“${seed.title}” is a ${seed.ruleset} seed`,
    );
    const m = mode(g, 'seed.answers');
    const rolled = g.pendingSeed?.seedId === seed.id ? g.pendingSeed.rolled : {};
    for (const qid of Object.keys(c.answers)) {
      check(
        seed.questions.some((q) => q.id === qid),
        'invalid',
        `seed ${seed.id} has no question ${qid}`,
      );
    }
    const notes = seed.questions.map((q) => {
      const a = c.answers[q.id];
      check(a, 'invalid', `answer “${q.text}”`);
      if ('custom' in a) {
        check(q.allowCustom, 'invalid', `“${q.text}” takes one of its options`);
        const text = requireText(a.custom, 200, 'answer');
        honorSeedRoll(tx, m, rolled[q.id], [], q.id, { custom: text });
        return { question: q.text, answers: [text] };
      }
      const ids = a.optionIds;
      check(new Set(ids).size === ids.length, 'invalid', 'an option is picked twice');
      const allowed = { one: [1], two: [2], oneOrTwo: [1, 2] }[q.pick];
      check(
        allowed.includes(ids.length),
        'invalid',
        `“${q.text}”: pick ${q.pick === 'oneOrTwo' ? 'one or two' : q.pick}`,
      );
      const texts = ids.map((id) => {
        const o = q.options.find((x) => x.id === id);
        check(o, 'invalid', `“${q.text}” has no option ${id}`);
        return o.text;
      });
      honorSeedRoll(tx, m, rolled[q.id], ids, q.id, ids);
      return { question: q.text, answers: texts };
    });
    const bookend = (which: 'start' | 'end'): StartupBookend => {
      const a = c[which];
      const question = which === 'start' ? seed.startBookend : seed.endBookend;
      if ('custom' in a) {
        const text = requireText(a.custom.text, 200, `${which} Bookend`);
        const title = a.custom.title?.trim()
          ? requireText(a.custom.title, MAX.title, `${which} Bookend title`)
          : undefined;
        honorSeedRoll(tx, m, rolled[which], [], which, { custom: text });
        return title ? { title, text } : { text };
      }
      const o = question.options.find((x) => x.id === a.optionId);
      check(o, 'invalid', `the ${which} Bookend has no option ${a.optionId}`);
      honorSeedRoll(tx, m, rolled[which], [o.id], which, o.id);
      return o.title ? { title: o.title, text: o.text } : { text: o.text };
    };
    const startup: SeedStartup = {
      kind: 'seed',
      packId: seed.packId,
      packName: seed.packName,
      seedId: seed.id,
      title: seed.title,
      pitch: seed.pitch,
      notes,
      bookends: { start: bookend('start'), end: bookend('end') },
    };
    if (seed.bigPicture) startup.bigPictureDraft = seed.bigPicture;
    if (seed.subject) startup.subject = seed.subject;
    if (seed.note) startup.note = seed.note;
    if (seed.palette) startup.palette = seed.palette;
    tx.emit('SeedApplied', { startup });
    linkGroup(tx, seed.group);
  },

  RollGenerator: (tx, c) => {
    startupOpen(tx.g);
    const gen = tx.env.content.generators[c.generatorId];
    check(gen, 'unknown-content', `generator ${c.generatorId} is not installed`);
    const tables = gen.parts.map((part) => {
      const t = tx.env.content.tables[part.tableId];
      check(
        t && t.category === 'generator',
        'unknown-content',
        `generator table ${part.tableId} is not installed`,
      );
      return t;
    });
    gen.parts.forEach((part, index) => {
      tx.rollTable('generator.part', tables[index]!, () => ({
        generatorId: gen.id,
        partId: part.id,
        label: part.label,
        index,
        count: gen.parts.length,
        ...(gen.swap ? { swap: gen.swap } : {}),
      }));
    });
  },

  AcceptGeneratorReading: (tx, c) => {
    startupOpen(tx.g);
    const pending = tx.g.pendingGenerator;
    check(pending, 'roll-required', 'roll the generator first');
    const gen = tx.env.content.generators[pending.generatorId];
    check(gen, 'unknown-content', `generator ${pending.generatorId} is not installed`);
    if (c.swapped) check(pending.swap, 'invalid', `${gen.name} has no swap`);
    const reading = fillTemplate(gen.template, pending.parts, c.swapped ? pending.swap : undefined);
    tx.emit('GeneratorReadingAccepted', {
      startup: {
        kind: 'generator',
        packId: gen.packId,
        packName: gen.packName,
        generatorId: gen.id,
        name: gen.name,
        reading,
      },
    });
    linkGroup(tx, gen.group);
  },
};

/** Startup content is chosen before the Bookends; after that the premise is set. */
function startupOpen(g: Game) {
  check(
    periods(g).length < 2 && !inPlay(g),
    'setup-advanced',
    'the startup is chosen before the Bookends',
  );
}

function seedFor(tx: Tx, id: Id) {
  const seed = tx.env.content.seeds[id];
  check(seed, 'unknown-content', `seed ${id} is not installed`);
  return seed;
}

function seedOptions(seed: Seed, questionId: string): { id: Id; text: string }[] | undefined {
  if (questionId === 'start') return seed.startBookend.options;
  if (questionId === 'end') return seed.endBookend.options;
  return seed.questions.find((q) => q.id === questionId)?.options;
}

/** Resolves a seed answer against its roll under the seed.answers mode. */
function honorSeedRoll(
  tx: Tx,
  m: Mode,
  rolledId: Id | undefined,
  picked: Id[],
  targetId: string,
  chosen: unknown,
) {
  if (m === 'off') return;
  if (m === 'enforce') {
    check(rolledId !== undefined, 'roll-required', `roll “${targetId}” first`);
    check(
      picked.includes(rolledId),
      'enforced',
      'seed answers are enforced: keep the rolled option',
    );
    return;
  }
  if (rolledId !== undefined && !picked.includes(rolledId))
    tx.override('seed.answers', rolledId, chosen, targetId);
}

const PERSON_SLOTS: PersonSlot[] = ['name', 'role', 'want'];

/** After a seed or generator is applied: link its group's tables, if that changes anything. */
function linkGroup(tx: Tx, group: Id | undefined) {
  if (!group) return;
  const s = tx.g.settings;
  const activeTables = linkedActiveTables(tx.env.content, s.activeTables, [group]);
  if (activeTables.join('\n') === s.activeTables.join('\n')) return;
  tx.emit('SettingsChanged', { settings: { ...s, activeTables } });
}

function pickTable(tx: Tx, tables: Table[]): Table {
  const idx = tx.roll('table.pick', tables.length, { text: tables.map((t) => t.name).join(' / ') });
  return tables[idx - 1]!;
}

function openScene(g: Game, id: Id): Scene {
  const e = g.entries[id];
  check(e?.kind === 'scene', 'not-found', 'Scene not found');
  check(!e.locked, 'locked', 'the Scene is resolved');
  check(g.turn?.entryId === id, 'wrong-phase', 'this Scene is not the open turn’s entry');
  return e;
}

function commitTurn(tx: Tx) {
  const g = tx.g;
  const t = g.turn!;
  const entry = g.entries[t.entryId!]!;
  if (entry.kind === 'scene') check(entry.answer, 'invalid', 'resolve the Scene first');
  tx.emit('TurnCommitted', { entryId: entry.id });
  const r = openRound(tx.g);
  if (
    t.kind === 'normal' &&
    mode(tx.g, 'cohesion') !== 'off' &&
    normalTurns(r) < tx.g.settings.cohesionCap
  ) {
    tx.rollWith('cohesion', 10, (x) => {
      const value = x <= tx.g.dials.cohesion;
      return { value, text: value ? 'Another turn' : 'On to Legacies' };
    });
  }
}

function rollPalette(tx: Tx, rerolled: boolean) {
  const tables = seatTables(
    tx.g,
    tx.env.content,
    tx.g.seats.find((s) => s.kind === 'player'),
    'palette',
  );
  check(tables.length, 'content-missing', 'no active palette tables');
  const table = tables.length === 1 ? tables[0]! : pickTable(tx, tables);
  tx.rollTable('palette', table, (text) => ({ text, tableId: table.id, rerolled }));
}

function rollFocus(tx: Tx, seat: Seat): { text: string; source: string } {
  const g = tx.g;
  if (g.ruleset === 'chronicle' && g.subject) {
    const options = [g.subject.name, ...currentTraits(g)];
    return tx.weighted(
      'focus',
      options.map((o, i) => ({
        item: { text: o, source: i === 0 ? 'subject' : 'trait' },
        weight: 1,
      })),
      (v) => v.text,
    );
  }
  const w = g.settings.focusSourceWeights;
  const domain = [
    ...seatTables(g, tx.env.content, seat, 'domain'),
    ...seatTables(g, tx.env.content, seat, 'focus'),
  ];
  const sources: { item: 'legacy' | 'domain' | 'deck'; weight: number }[] = [
    { item: 'legacy', weight: g.legacies.length ? w.legacy : 0 },
    { item: 'domain', weight: domain.length ? w.domain : 0 },
    { item: 'deck', weight: g.deck && tx.env.content.decks[g.deck.deckId] ? w.deck : 0 },
  ];
  const source = tx.weighted('focus.source', sources, (s) => s, false);
  if (source === 'legacy') {
    return tx.weighted(
      'focus',
      g.legacies.map((l) => ({ item: { text: l.text, source: 'legacy' }, weight: 1 })),
      (v) => v.text,
    );
  }
  if (source === 'deck') {
    let value = { text: '', source: 'deck' };
    tx.drawCard('focus', {
      valueFor: (card, kw) => {
        value = { text: `${kw} (${card.name})`.slice(0, MAX.focus), source: 'deck' };
        return value;
      },
    });
    return value;
  }
  const table = domain.length === 1 ? domain[0]! : pickTable(tx, domain);
  let value = { text: '', source: 'domain' };
  tx.rollTable(
    'focus',
    table,
    (text) => (value = { text: text.slice(0, MAX.focus), source: `table:${table.id}` }),
  );
  return value;
}

export function currentTraits(g: Game): string[] {
  return traitsAt(g, null).traits;
}

function validateSeats(seats: Seat[]) {
  check(
    seats.filter((s) => s.kind === 'player').length === 1,
    'invalid',
    'exactly one player seat',
  );
  check(
    seats.filter((s) => s.kind === 'phantom').length <= 3,
    'invalid',
    'at most three phantom seats',
  );
  check(
    new Set(seats.map((s) => s.id)).size === seats.length,
    'invalid',
    'seat ids must be unique',
  );
  for (const s of seats) {
    requireText(s.name, 40, 'seat name');
    check(
      ['uniform', 'early', 'late', 'sparse'].includes(s.placementBias),
      'invalid',
      'unknown placement bias',
    );
  }
}

// ---------------------------------------------------------------------------------------------

export function execute(state: Game, command: Command, env: Env): Result {
  if (command.type !== 'CreateGame' && !state.id) {
    return { ok: false, rejection: { code: 'no-game', message: 'create the game first' } };
  }
  const tx = new Tx(state, env);
  try {
    (handlers[command.type] as Handler<Command>)(tx, command);
  } catch (e) {
    if (e instanceof Reject) return { ok: false, rejection: e.rejection };
    throw e;
  }
  return { ok: true, events: tx.events, state: tx.g };
}

export type { RngState };
