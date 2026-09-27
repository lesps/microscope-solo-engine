import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { replay } from '../engine';
import { autoplay, cyclePick, setupGame } from '../../tests/support/autoplay';
import { Driver } from '../../tests/support/driver';
import { SoloDB, SNAPSHOT_EVERY } from './db';
import { appendEvents, deleteGame, loadGame, truncateEvents } from './repo';

let n = 0;
const freshDb = () => new SoloDB(`test-${++n}`);

async function persistDriver(db: SoloDB, d: Driver) {
  // Append batch by batch, as the store does.
  let i = 0;
  while (i < d.events.length) {
    const batch = d.events[i]!.batch;
    const evs = d.events.filter((e) => e.batch === batch);
    await appendEvents(db, evs, replay(d.events.slice(0, i + evs.length)));
    i += evs.length;
  }
}

describe('persistence', () => {
  it('appends, reloads and replays; snapshot load equals replay from zero', async () => {
    const db = freshDb();
    const d = new Driver();
    setupGame(d);
    autoplay(d, cyclePick([3, 1, 4, 1, 5, 9, 2, 6]), { rounds: 12, maxSteps: 5000 });
    expect(d.events.length).toBeGreaterThan(SNAPSHOT_EVERY);
    await persistDriver(db, d);
    expect(await db.snapshots.count()).toBeGreaterThan(0);
    const fromSnap = await loadGame(db, d.state.id);
    const fromZero = await loadGame(db, d.state.id, { useSnapshot: false });
    expect(fromSnap!.state).toEqual(d.state);
    expect(fromZero!.state).toEqual(d.state);
    const meta = await db.games.get(d.state.id);
    expect(meta).toMatchObject({
      title: 'Test history',
      rounds: 12,
      roundsEnded: 12,
      eventCount: d.events.length,
    });
  });

  it('rejects a seq gap', async () => {
    const db = freshDb();
    const d = new Driver();
    setupGame(d);
    await persistDriver(db, d);
    const bad = { ...d.events[d.events.length - 1]!, seq: d.events.length + 5 };
    await expect(appendEvents(db, [bad], d.state)).rejects.toThrow(/seq gap/);
  });

  it('truncates the tail and stale snapshots', async () => {
    const db = freshDb();
    const d = new Driver();
    setupGame(d);
    await persistDriver(db, d);
    const keep = d.events.length - 1;
    await truncateEvents(db, d.state.id, keep + 1, replay(d.events.slice(0, keep)));
    expect((await loadGame(db, d.state.id))!.events).toHaveLength(keep);
  });

  it('deletes a game and all its rows', async () => {
    const db = freshDb();
    const d = new Driver();
    setupGame(d);
    await persistDriver(db, d);
    await deleteGame(db, d.state.id);
    expect(await db.events.count()).toBe(0);
    expect(await db.games.count()).toBe(0);
  });
});
