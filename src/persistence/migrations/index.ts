import { SCHEMA_VERSION, type GameEvent } from '../../engine';

type Migration = (events: GameEvent[]) => GameEvent[];

/** migrations[n] upgrades an event log from schemaVersion n to n + 1. */
const migrations: Record<number, Migration> = {};

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
