import { initialGame, replay, type Game, type GameEvent } from '../engine';
import { SNAPSHOT_EVERY, type GameMeta, type SoloDB } from './db';

function metaFor(state: Game, prev: GameMeta | undefined, now: string): GameMeta {
  const meta: GameMeta = {
    ...(prev ?? {}),
    id: state.id,
    title: state.title,
    ruleset: state.ruleset,
    rounds: state.rounds.length,
    roundsEnded: state.rounds.filter((r) => r.ended).length,
    createdAt: prev?.createdAt ?? state.createdAt ?? now,
    updatedAt: now,
    eventCount: state.seq,
  };
  return meta;
}

/** Appends a command's events atomically, updating metadata and writing a snapshot every 200 events. */
export async function appendEvents(
  db: SoloDB,
  events: GameEvent[],
  state: Game,
  now = new Date().toISOString(),
) {
  if (!events.length) return;
  const gameId = state.id;
  await db.transaction('rw', db.events, db.games, db.snapshots, async () => {
    const last = await db.events.where('gameId').equals(gameId).last();
    const expected = (last?.seq ?? 0) + 1;
    if (events[0]!.seq !== expected)
      throw new Error(`seq gap: expected ${expected}, got ${events[0]!.seq}`);
    await db.events.bulkAdd(events.map((event) => ({ gameId, seq: event.seq, event })));
    await db.games.put(metaFor(state, await db.games.get(gameId), now));
    const crossed =
      Math.floor(events[events.length - 1]!.seq / SNAPSHOT_EVERY) >
      Math.floor((events[0]!.seq - 1) / SNAPSHOT_EVERY);
    if (crossed) await db.snapshots.put({ gameId, seq: state.seq, state });
  });
}

/** Removes events with seq ≥ fromSeq (undo within an open turn) and any snapshot past them. */
export async function truncateEvents(db: SoloDB, gameId: string, fromSeq: number, state: Game) {
  await db.transaction('rw', db.events, db.games, db.snapshots, async () => {
    await db.events.where('[gameId+seq]').between([gameId, fromSeq], [gameId, Infinity]).delete();
    await db.snapshots
      .where('[gameId+seq]')
      .between([gameId, fromSeq], [gameId, Infinity])
      .delete();
    await db.games.put(metaFor(state, await db.games.get(gameId), new Date().toISOString()));
  });
}

export async function loadEvents(db: SoloDB, gameId: string): Promise<GameEvent[]> {
  const rows = await db.events
    .where('[gameId+seq]')
    .between([gameId, 0], [gameId, Infinity])
    .toArray();
  return rows.map((r) => r.event);
}

/** Loads a game from its latest snapshot plus the events after it. The log stays authoritative. */
export async function loadGame(db: SoloDB, gameId: string, opts: { useSnapshot?: boolean } = {}) {
  const events = await loadEvents(db, gameId);
  if (!events.length) return undefined;
  let base: Game = initialGame();
  let from = 0;
  if (opts.useSnapshot !== false) {
    const snap = await db.snapshots
      .where('[gameId+seq]')
      .between([gameId, 0], [gameId, Infinity])
      .last();
    if (snap && snap.seq <= events.length && events[snap.seq - 1]?.seq === snap.seq) {
      base = snap.state;
      from = snap.seq;
    }
  }
  const state = replay(events.slice(from), base);
  return { events, state };
}

export async function saveImportedGame(
  db: SoloDB,
  events: GameEvent[],
  state: Game,
  extra: Partial<GameMeta> = {},
) {
  await db.transaction('rw', db.events, db.games, db.snapshots, async () => {
    await db.events.bulkAdd(events.map((event) => ({ gameId: state.id, seq: event.seq, event })));
    await db.games.put({ ...metaFor(state, undefined, new Date().toISOString()), ...extra });
    if (events.length >= SNAPSHOT_EVERY)
      await db.snapshots.put({ gameId: state.id, seq: state.seq, state });
  });
}

export async function deleteGame(db: SoloDB, gameId: string) {
  await db.transaction('rw', db.events, db.games, db.snapshots, async () => {
    await db.events.where('gameId').equals(gameId).delete();
    await db.snapshots.where('gameId').equals(gameId).delete();
    await db.games.delete(gameId);
  });
}

export async function listGames(db: SoloDB): Promise<GameMeta[]> {
  return db.games.orderBy('updatedAt').reverse().toArray();
}

export async function markExported(
  db: SoloDB,
  gameId: string,
  roundsEnded: number,
  at = new Date().toISOString(),
) {
  await db.games.update(gameId, {
    lastExportedAt: at,
    roundsAtLastExport: roundsEnded,
    backupSnoozedAtRound: undefined,
  });
}

export async function snoozeBackup(db: SoloDB, gameId: string, roundsEnded: number) {
  await db.games.update(gameId, { backupSnoozedAtRound: roundsEnded });
}

export async function getMeta<T>(db: SoloDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(db: SoloDB, key: string, value: unknown) {
  await db.meta.put({ key, value });
}
