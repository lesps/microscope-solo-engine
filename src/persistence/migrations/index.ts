import { SCHEMA_VERSION, type GameEvent } from '../../engine';

type Migration = (events: GameEvent[]) => GameEvent[];

/** Adds a mode, defaulting it, to a settings payload that lacks it. Tolerates malformed input. */
function withMode(settings: unknown, mechanic: string, mode: string): unknown {
  if (!settings || typeof settings !== 'object') return settings;
  const s = settings as { modes?: unknown };
  if (!s.modes || typeof s.modes !== 'object' || mechanic in s.modes) return settings;
  return { ...s, modes: { ...s.modes, [mechanic]: mode } };
}

/** migrations[n] upgrades an event log from schemaVersion n to n + 1. */
const migrations: Record<number, Migration> = {
  // 1 → 2: startup packs add the `seed.answers` mechanic, off for existing games.
  1: (events) =>
    events.map((e) => {
      if (e.type === 'GameCreated') {
        const payload = {
          ...e.payload,
          schemaVersion: 2,
          settings: withMode(e.payload.settings, 'seed.answers', 'off'),
        };
        return { ...e, payload } as GameEvent;
      }
      if (e.type === 'SettingsChanged') {
        return {
          ...e,
          payload: { ...e.payload, settings: withMode(e.payload.settings, 'seed.answers', 'off') },
        } as GameEvent;
      }
      return e;
    }),
};

export function migrateEvents(fromVersion: number, events: GameEvent[]): GameEvent[] {
  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(`game file schema ${fromVersion} is newer than this app (${SCHEMA_VERSION})`);
  }
  let out = events;
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`no migration from schema ${v}`);
    out = m(out);
  }
  return out;
}
