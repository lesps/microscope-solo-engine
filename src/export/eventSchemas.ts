import { z } from 'zod';
import type { EventType } from '../engine';

// Payload schemas for importing game files. The log is otherwise trusted by the reducer, so a file
// with a mangled payload must be rejected here rather than imported into a state that later crashes.

const id = z.string().min(1);
const int = z.number().int();
const nat = int.min(0);
const uint32 = int.min(0).max(0xffffffff);
const rng = z.tuple([uint32, uint32, uint32, uint32]);
const tone = z.enum(['light', 'dark']);
const mode = z.enum(['off', 'prompt', 'enforce']);
const weights = z.object({ period: nat, event: nat, scene: nat });
const dials = z.object({
  mood: int.min(1).max(9),
  cohesion: int.min(1).max(9),
  chaos: int.min(1).max(9).optional(),
});

const settings = z.object({
  modes: z.object({
    tone: mode,
    cohesion: mode,
    'focus.source': mode,
    'focus.sourcePhantom': mode,
    entryType: mode,
    placement: mode,
    'palette.roll': mode,
    'legacy.evict': mode,
    'legacy.explore': mode,
    'scene.reversal': mode,
    'seed.answers': mode,
  }),
  drift: z.enum(['preference', 'random', 'counter-trend']),
  chaos: z.boolean(),
  cohesionCap: int.min(1),
  entryTypeWeights: weights,
  focusSourceWeights: z.object({ legacy: nat, domain: nat, deck: nat }),
  activeTables: z.array(id),
  deck: z.object({ reversals: z.boolean(), toneFromPip: z.boolean() }),
  oracle: z.object({ qualifiers: z.boolean() }),
  scene: z.object({
    budget: z.enum(['warn', 'enforce']),
    pause: z.boolean(),
    pauseSeconds: nat,
    defaultBudget: z.object({ min: nat, max: nat }),
  }),
  paletteRollCount: nat,
});

const seat = z.object({
  id,
  name: z.string(),
  kind: z.enum(['player', 'phantom']),
  tables: z.array(id),
  placementBias: z.enum(['uniform', 'early', 'late', 'sparse']),
  entryTypeWeights: weights.optional(),
  focusMode: mode.optional(),
});

const traitChange = z.object({
  op: z.enum(['add', 'remove', 'modify']),
  trait: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const oracleCall = z.object({
  question: z.string(),
  odds: int.min(1).max(9),
  effectiveOdds: int.min(1).max(9),
  roll: int.min(1).max(10),
  answer: z.boolean(),
  qualifierRoll: int.min(1).max(6).optional(),
  qualifier: z.enum(['but', 'and']).optional(),
  seq: nat,
});

const entryBase = {
  id,
  title: z.string(),
  tone,
  order: z.string().min(1),
  prose: z.string(),
  playProse: z.string().optional(),
  revisions: z.array(z.object({ seq: nat, at: z.string(), prose: z.string() })),
  createdInRound: nat,
  seatId: id,
  focus: z.string().optional(),
  legacyId: id.optional(),
  locked: z.boolean(),
  firstPass: z.boolean().optional(),
};

const period = z.object({
  ...entryBase,
  kind: z.literal('period'),
  bookend: z.enum(['start', 'end']).optional(),
  anchorId: id.optional(),
  change: traitChange.optional(),
});

const entry = z.discriminatedUnion('kind', [
  period,
  z.object({ ...entryBase, kind: z.literal('event'), periodId: id }),
  z.object({
    ...entryBase,
    kind: z.literal('scene'),
    eventId: id,
    question: z.string(),
    answer: z.string().optional(),
    form: z.enum(['played', 'dictated']),
    requiredCharacterIds: z.array(id),
    bannedCharacterIds: z.array(id),
    setting: z.string().optional(),
    budget: z.object({ min: nat, max: nat }),
    spread: z
      .array(
        z.object({
          deckId: id,
          cardId: id,
          reversed: z.boolean(),
          keyword: z.string(),
          role: z.string().optional(),
        }),
      )
      .optional(),
    reversal: z.object({ source: z.string(), text: z.string(), offset: nat }).optional(),
    oracleCalls: z.array(oracleCall),
    characterIds: z.array(id),
  }),
]);

const subject = z.object({
  name: z.string(),
  description: z.string(),
  traits: z.array(z.string()),
});
const startupBookend = z.object({ title: z.string().optional(), text: z.string() });
const fromPack = { packId: id, packName: z.string() };

const character = z.object({
  id,
  name: z.string(),
  description: z.string(),
  immortal: z.boolean(),
});

export const payloadSchemas: { [K in EventType]: z.ZodType<unknown> } = {
  GameCreated: z.object({
    id,
    title: z.string(),
    ruleset: z.enum(['lens', 'chronicle']),
    seed: z.string().regex(/^[0-9a-f]{32}$/i),
    rng,
    settings,
    seats: z.array(seat).min(1),
    deck: z.object({ deckId: id, cardIds: z.array(id) }).optional(),
    schemaVersion: int.min(1),
  }),
  BigPictureSet: z.object({ text: z.string() }),
  SubjectSet: z.object({
    subject: z.object({ name: z.string(), description: z.string(), traits: z.array(z.string()) }),
  }),
  BookendsSet: z.object({
    start: period,
    end: period,
    characters: z.array(character.extend({ entryIds: z.array(id) })),
  }),
  PaletteItemAdded: z.object({
    list: z.enum(['yes', 'no']),
    item: z.object({ id, text: z.string(), rolled: z.boolean() }),
  }),
  PaletteItemRemoved: z.object({ id }),
  SeatsConfigured: z.object({ seats: z.array(seat).min(1) }),
  DialsSet: dials,
  SettingsChanged: z.object({ settings }),
  RoundStarted: z.object({ n: int.min(1), lensSeatId: id }),
  FocusSet: z.object({ text: z.string(), source: z.string() }),
  TurnStarted: z.object({
    seatId: id,
    kind: z.enum(['normal', 'legacy']),
    legacyId: id.optional(),
  }),
  EntryCreated: z.object({ entry }),
  EntryProseEdited: z.object({ entryId: id, prose: z.string() }),
  CharacterCreated: z.object({ character }),
  SceneFramed: z.object({
    entryId: id,
    question: z.string(),
    form: z.enum(['played', 'dictated']),
    setting: z.string().optional(),
    requiredCharacterIds: z.array(id),
    bannedCharacterIds: z.array(id),
    budget: z.object({ min: nat, max: nat }),
  }),
  ReversalPlaced: z.object({ entryId: id, source: z.string(), text: z.string(), offset: nat }),
  SceneResolved: z.object({ entryId: id, answer: z.string(), characterIds: z.array(id) }),
  TurnCommitted: z.object({ entryId: id }),
  LegacyAdded: z.object({
    legacy: z.object({ id, text: z.string(), seatId: id, addedInRound: nat }),
  }),
  LegacyRemoved: z.object({ id }),
  LegacyExplored: z.object({ id }),
  DialsAdjusted: z.object({
    before: dials,
    after: dials,
    drift: z.enum(['preference', 'random', 'counter-trend']),
  }),
  RoundEnded: z.object({ n: int.min(1) }),
  RollMade: z.object({
    purpose: z.string().min(1),
    sides: int.min(1),
    result: int.min(1),
    value: z.unknown().optional(),
    text: z.string().optional(),
    tableId: id.optional(),
    targetId: id.optional(),
    rng,
  }),
  CardDrawn: z.object({
    purpose: z.string().min(1),
    deckId: id,
    cardId: id,
    reversed: z.boolean(),
    keyword: z.string(),
    value: z.unknown().optional(),
    targetId: id.optional(),
    role: z.string().optional(),
    rng,
  }),
  DeckReshuffled: z.object({ deckId: id, rng }),
  OracleAsked: z.object({ entryId: id.optional(), call: oracleCall }),
  OverrideUsed: z.object({
    mechanic: z.string().min(1),
    rolled: z.unknown(),
    chosen: z.unknown(),
    targetId: id.optional(),
  }),
  ProseRevised: z.object({ entryId: id, prose: z.string() }),
  SeedApplied: z.object({
    startup: z.object({
      kind: z.literal('seed'),
      ...fromPack,
      seedId: id,
      title: z.string(),
      pitch: z.string(),
      bigPictureDraft: z.string().optional(),
      subject: subject.optional(),
      note: z.string().optional(),
      notes: z.array(z.object({ question: z.string(), answers: z.array(z.string()).min(1) })),
      bookends: z.object({ start: startupBookend, end: startupBookend }),
      palette: z.object({ yes: z.array(z.string()), no: z.array(z.string()) }).optional(),
    }),
  }),
  GeneratorReadingAccepted: z.object({
    startup: z.object({
      kind: z.literal('generator'),
      ...fromPack,
      generatorId: id,
      name: z.string(),
      reading: z.string(),
    }),
  }),
  Retconned: z.object({
    targetId: id,
    field: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
    reason: z.string().min(1),
  }),
};
