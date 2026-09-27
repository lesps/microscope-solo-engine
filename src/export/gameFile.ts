import { z } from 'zod';
import { SCHEMA_VERSION, checkInvariants, replay, type Game, type GameEvent } from '../engine';

export const GAME_FILE_FORMAT = 'solo-microscope/game';
export const BUNDLE_FORMAT = 'solo-microscope/bundle';

const EVENT_TYPES = [
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
] as const;

const eventSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().min(1),
  seq: z.number().int().min(1),
  batch: z.number().int().min(1),
  at: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  payload: z.record(z.unknown()),
});

export const gameFileSchema = z
  .object({
    format: z.literal(GAME_FILE_FORMAT),
    schemaVersion: z.number().int().min(1),
    exportedAt: z.string(),
    gameId: z.string().min(1),
    title: z.string(),
    events: z.array(eventSchema).min(1),
  })
  .superRefine((f, ctx) => {
    if (f.events[0]?.type !== 'GameCreated')
      ctx.addIssue({
        code: 'custom',
        path: ['events', 0, 'type'],
        message: 'the log must start with GameCreated',
      });
    f.events.forEach((e, i) => {
      if (e.seq !== i + 1)
        ctx.addIssue({
          code: 'custom',
          path: ['events', i, 'seq'],
          message: `expected seq ${i + 1}`,
        });
      if (e.gameId !== f.gameId)
        ctx.addIssue({
          code: 'custom',
          path: ['events', i, 'gameId'],
          message: 'event belongs to another game',
        });
    });
  });

export const bundleSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  games: z.array(z.unknown()),
});

export interface GameFile {
  format: typeof GAME_FILE_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  gameId: string;
  title: string;
  events: GameEvent[];
}

export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  games: GameFile[];
}

export function toGameFile(
  state: Game,
  events: readonly GameEvent[],
  exportedAt: string,
): GameFile {
  return {
    format: GAME_FILE_FORMAT,
    schemaVersion: state.schemaVersion ?? SCHEMA_VERSION,
    exportedAt,
    gameId: state.id,
    title: state.title,
    events: [...events],
  };
}

export function toBundle(files: GameFile[], exportedAt: string): Bundle {
  return { format: BUNDLE_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt, games: files };
}

export type ParsedGame =
  { ok: true; file: GameFile; state: Game } | { ok: false; errors: string[] };

/** Validates shape, then replays the log and checks invariants. `migrate` upgrades older schemas. */
export function parseGameFile(
  input: unknown,
  migrate: (v: number, e: GameEvent[]) => GameEvent[] = (_v, e) => e,
): ParsedGame {
  const r = gameFileSchema.safeParse(input);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || '(file)'}: ${i.message}`),
    };
  }
  try {
    const events = migrate(r.data.schemaVersion, r.data.events as unknown as GameEvent[]);
    const state = replay(events);
    const violations = checkInvariants(state, events);
    if (violations.length) return { ok: false, errors: violations };
    return {
      ok: true,
      file: { ...(r.data as unknown as GameFile), events, schemaVersion: SCHEMA_VERSION },
      state,
    };
  } catch (e) {
    return { ok: false, errors: [`replay failed: ${(e as Error).message}`] };
  }
}

/** Re-keys a game's log under a new game id (import as copy). */
export function rewriteGameId(events: readonly GameEvent[], newId: string): GameEvent[] {
  const oldId = events[0]?.gameId;
  return events.map((e) => {
    const out = { ...e, gameId: newId } as GameEvent;
    if (out.type === 'GameCreated') out.payload = { ...out.payload, id: newId };
    if (out.type === 'Retconned' && out.payload.targetId === oldId)
      out.payload = { ...out.payload, targetId: newId };
    return out;
  });
}
