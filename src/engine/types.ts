export type Id = string;
export type OrderKey = string;
export type Tone = 'light' | 'dark';
export type Mode = 'off' | 'prompt' | 'enforce';
export type EntryKind = 'period' | 'event' | 'scene';
export type Ruleset = 'lens' | 'chronicle';
export type PlacementBias = 'uniform' | 'early' | 'late' | 'sparse';
export type DriftMode = 'preference' | 'random' | 'counter-trend';
export type RngState = [number, number, number, number];

export const SCHEMA_VERSION = 1;

export type ModedMechanic =
  | 'tone'
  | 'cohesion'
  | 'focus.source'
  | 'focus.sourcePhantom'
  | 'entryType'
  | 'placement'
  | 'palette.roll'
  | 'legacy.evict'
  | 'legacy.explore'
  | 'scene.reversal';

export type OverridableMechanic = ModedMechanic;

export interface Settings {
  modes: Record<ModedMechanic, Mode>;
  drift: DriftMode;
  chaos: boolean;
  cohesionCap: number;
  entryTypeWeights: Record<EntryKind, number>;
  focusSourceWeights: { legacy: number; domain: number; deck: number };
  activeTables: Id[];
  deck: { reversals: boolean; toneFromPip: boolean };
  oracle: { qualifiers: boolean };
  scene: {
    budget: 'warn' | 'enforce';
    pause: boolean;
    pauseSeconds: number;
    defaultBudget: { min: number; max: number };
  };
  paletteRollCount: number;
}

// ---- Content (supplied by packs; the engine never hard-codes table text) ----

export interface TableEntry {
  text: string;
  weight?: number;
  range?: [number, number];
}
export type TableCategory = 'domain' | 'wordPair' | 'palette' | 'reversal' | 'focus';
export interface ListTable {
  id: Id;
  name: string;
  category: Exclude<TableCategory, 'wordPair'>;
  die?: number;
  entries: TableEntry[];
}
export interface WordPairTable {
  id: Id;
  name: string;
  category: 'wordPair';
  die?: number;
  action: TableEntry[];
  subject: TableEntry[];
}
export type Table = ListTable | WordPairTable;

export type CardTier = 'grand' | 'character' | 'moment';
export interface Card {
  id: Id;
  arcana: 'major' | 'minor';
  suit?: string;
  rank?: number | 'page' | 'knight' | 'queen' | 'king';
  name: string;
  upright: string;
  reversed: string;
  tier: CardTier;
}
export interface Deck {
  id: Id;
  name: string;
  cards: Card[];
}
export interface Content {
  tables: Record<Id, Table>;
  decks: Record<Id, Deck>;
}

// ---- Domain ----

export interface PaletteItem {
  id: Id;
  text: string;
  rolled: boolean;
}

export interface Seat {
  id: Id;
  name: string;
  kind: 'player' | 'phantom';
  tables: Id[];
  placementBias: PlacementBias;
  entryTypeWeights?: Record<EntryKind, number>;
  focusMode?: Mode;
}

export interface Revision {
  seq: number;
  at: string;
  prose: string;
}

export interface CardRef {
  deckId: Id;
  cardId: Id;
  reversed: boolean;
  keyword: string;
  role?: string;
}

export interface OracleCall {
  question: string;
  odds: number;
  effectiveOdds: number;
  roll: number;
  answer: boolean;
  qualifierRoll?: number;
  qualifier?: 'but' | 'and';
  seq: number;
}

export interface Placement {
  parentId: Id | null;
  index: number;
}

export interface TraitChange {
  op: 'add' | 'remove' | 'modify';
  trait?: string;
  from?: string;
  to?: string;
}

export interface EntryBase {
  id: Id;
  title: string;
  tone: Tone;
  order: OrderKey;
  prose: string;
  playProse?: string;
  revisions: Revision[];
  createdInRound: number;
  seatId: Id;
  focus?: string;
  legacyId?: Id;
  locked: boolean;
  firstPass?: boolean;
}
export interface Period extends EntryBase {
  kind: 'period';
  bookend?: 'start' | 'end';
  anchorId?: Id;
  change?: TraitChange;
}
export interface EventEntry extends EntryBase {
  kind: 'event';
  periodId: Id;
}
export interface Scene extends EntryBase {
  kind: 'scene';
  eventId: Id;
  question: string;
  answer?: string;
  form: 'played' | 'dictated';
  requiredCharacterIds: Id[];
  bannedCharacterIds: Id[];
  setting?: string;
  budget: { min: number; max: number };
  spread?: CardRef[];
  reversal?: { source: string; text: string; offset: number };
  oracleCalls: OracleCall[];
  characterIds: Id[];
}
export type Entry = Period | EventEntry | Scene;

export interface Legacy {
  id: Id;
  text: string;
  seatId: Id;
  addedInRound: number;
}

export interface Character {
  id: Id;
  name: string;
  description: string;
  immortal: boolean;
  entryIds: Id[];
}

export interface Subject {
  name: string;
  description: string;
  traits: string[];
}

export interface TurnRecord {
  seatId: Id;
  kind: 'normal' | 'legacy';
  entryId?: Id;
  committed: boolean;
  startSeq: number;
}

export interface Round {
  n: number;
  lensSeatId: Id;
  focus?: string;
  focusSource?: string;
  turns: TurnRecord[];
  legacyAddedId?: Id;
  legacyExploredId?: Id;
  ended: boolean;
}

export interface DeckState {
  deckId: Id;
  cardIds: Id[];
  remaining: Id[];
  discards: Id[];
}

export interface RolledValues {
  tone?: Tone;
  entryType?: EntryKind;
  placement?: { kind: EntryKind; placement: Placement };
  cohesion?: boolean;
  focus?: { text: string; source: string };
  evict?: Id;
  explore?: Id;
  reversal?: { source: string; text: string };
}

export interface OpenTurn {
  seatId: Id;
  kind: 'normal' | 'legacy';
  legacyId?: Id;
  startSeq: number;
  rolled: RolledValues;
  entryId?: Id;
  prompts: PromptResult[];
}

export interface PromptResult {
  kind: 'domain' | 'wordPair' | 'card' | 'character';
  text: string;
  seq: number;
}

export interface PendingPaletteRoll {
  text: string;
  tableId: Id;
  rerolled: boolean;
}

export interface Game {
  id: Id;
  schemaVersion: number;
  title: string;
  ruleset: Ruleset;
  seed: string;
  rng: RngState;
  createdAt: string;
  bigPicture: string;
  subject?: Subject;
  palette: { yes: PaletteItem[]; no: PaletteItem[] };
  paletteRolled: number;
  pendingPalette?: PendingPaletteRoll;
  dials: { mood: number; cohesion: number; chaos?: number };
  dialsSet: boolean;
  settings: Settings;
  seats: Seat[];
  entries: Record<Id, Entry>;
  legacies: Legacy[];
  characters: Record<Id, Character>;
  rounds: Round[];
  deck?: DeckState;
  stats: { overrides: number; retcons: number };
  nextSeatIndex: number;
  turn?: OpenTurn;
  pendingRoundRolls: RolledValues;
  seq: number;
}

// ---- Events ----

export interface EventPayloads {
  GameCreated: {
    id: Id;
    title: string;
    ruleset: Ruleset;
    seed: string;
    rng: RngState;
    settings: Settings;
    seats: Seat[];
    deck?: { deckId: Id; cardIds: Id[] };
    schemaVersion: number;
  };
  BigPictureSet: { text: string };
  SubjectSet: { subject: Subject };
  BookendsSet: { start: Period; end: Period; characters: Character[] };
  PaletteItemAdded: { list: 'yes' | 'no'; item: PaletteItem };
  PaletteItemRemoved: { id: Id };
  SeatsConfigured: { seats: Seat[] };
  DialsSet: { mood: number; cohesion: number; chaos?: number };
  SettingsChanged: { settings: Settings };
  RoundStarted: { n: number; lensSeatId: Id };
  FocusSet: { text: string; source: string };
  TurnStarted: { seatId: Id; kind: 'normal' | 'legacy'; legacyId?: Id };
  EntryCreated: { entry: Entry };
  EntryProseEdited: { entryId: Id; prose: string };
  CharacterCreated: { character: Omit<Character, 'entryIds'> };
  SceneFramed: {
    entryId: Id;
    question: string;
    form: 'played' | 'dictated';
    setting?: string;
    requiredCharacterIds: Id[];
    bannedCharacterIds: Id[];
    budget: { min: number; max: number };
  };
  ReversalPlaced: { entryId: Id; source: string; text: string; offset: number };
  SceneResolved: { entryId: Id; answer: string; characterIds: Id[] };
  TurnCommitted: { entryId: Id };
  LegacyAdded: { legacy: Legacy };
  LegacyRemoved: { id: Id };
  LegacyExplored: { id: Id };
  DialsAdjusted: {
    before: { mood: number; cohesion: number; chaos?: number };
    after: { mood: number; cohesion: number; chaos?: number };
    drift: DriftMode;
  };
  RoundEnded: { n: number };
  RollMade: {
    purpose: string;
    sides: number;
    result: number;
    value?: unknown;
    tableId?: Id;
    text?: string;
    targetId?: Id;
    rng: RngState;
  };
  CardDrawn: {
    purpose: string;
    deckId: Id;
    cardId: Id;
    reversed: boolean;
    keyword: string;
    value?: unknown;
    targetId?: Id;
    role?: string;
    rng: RngState;
  };
  DeckReshuffled: { deckId: Id; rng: RngState };
  OracleAsked: { entryId?: Id; call: OracleCall };
  OverrideUsed: { mechanic: OverridableMechanic; rolled: unknown; chosen: unknown; targetId?: Id };
  ProseRevised: { entryId: Id; prose: string };
  Retconned: { targetId: Id; field: string; before: unknown; after: unknown; reason: string };
}

export type EventType = keyof EventPayloads;

export const EVENT_TYPES = [
  'GameCreated',
  'BigPictureSet',
  'SubjectSet',
  'BookendsSet',
  'PaletteItemAdded',
  'PaletteItemRemoved',
  'SeatsConfigured',
  'DialsSet',
  'SettingsChanged',
  'RoundStarted',
  'FocusSet',
  'TurnStarted',
  'EntryCreated',
  'EntryProseEdited',
  'CharacterCreated',
  'SceneFramed',
  'ReversalPlaced',
  'SceneResolved',
  'TurnCommitted',
  'LegacyAdded',
  'LegacyRemoved',
  'LegacyExplored',
  'DialsAdjusted',
  'RoundEnded',
  'RollMade',
  'CardDrawn',
  'DeckReshuffled',
  'OracleAsked',
  'OverrideUsed',
  'ProseRevised',
  'Retconned',
] as const satisfies readonly EventType[];

// Compile-time check that EVENT_TYPES lists every event type.
type _AllListed = Exclude<EventType, (typeof EVENT_TYPES)[number]> extends never ? true : never;
export const _allEventTypesListed: _AllListed = true;

export interface EventDraft<T extends EventType = EventType> {
  type: T;
  payload: EventPayloads[T];
}

export type GameEvent<T extends EventType = EventType> = {
  [K in T]: {
    id: Id;
    gameId: Id;
    seq: number;
    batch: number;
    at: string;
    type: K;
    payload: EventPayloads[K];
  };
}[T];

export const ROLL_EVENT_TYPES: ReadonlySet<EventType> = new Set([
  'RollMade',
  'CardDrawn',
  'DeckReshuffled',
  'OracleAsked',
]);
