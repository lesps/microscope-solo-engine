import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { replay } from '../engine';
import { SoloDB } from '../persistence';
import { createAppStore } from './appStore';
import { backupDue } from './backup';
import type { GameMeta } from '../persistence';

let dbn = 0;
function makeStore(db = new SoloDB(`store-${++dbn}`)) {
  let id = 0;
  let t = Date.UTC(2026, 5, 1);
  const store = createAppStore({
    db,
    newId: () => `S${String(++id).padStart(8, '0')}`,
    now: () => new Date((t += 1000)).toISOString(),
    randomSeed: () => '0123456789abcdef0123456789abcdef',
    requestPersist: async () => 'best-effort',
    storage: async () => ({ status: 'best-effort', usage: 1, quota: 100 }),
  });
  return { store, db };
}

async function setup(store: ReturnType<typeof makeStore>['store']) {
  const s = store.getState();
  await s.init();
  const id = await s.createGame({ title: 'River', ruleset: 'lens' });
  const d = (c: Parameters<typeof s.dispatch>[0]) =>
    store
      .getState()
      .dispatch(c)
      .then((r) => {
        if (!r.ok) throw new Error(r.rejection.message);
      });
  await d({ type: 'SetBigPicture', text: 'A river city.' });
  await d({
    type: 'SetBookends',
    start: { title: 'Founding', prose: '', tone: 'light' },
    end: { title: 'Drowning', prose: '', tone: 'dark' },
  });
  await d({
    type: 'AddFirstPassEntry',
    kind: 'period',
    title: 'Canals',
    tone: 'light',
    placement: { parentId: null, index: 1 },
  });
  const start = Object.values(store.getState().current!.state.entries).find(
    (e) => e.kind === 'period' && e.bookend === 'start',
  )!;
  await d({
    type: 'AddFirstPassEntry',
    kind: 'event',
    title: 'First bridge',
    tone: 'dark',
    placement: { parentId: start.id, index: 0 },
  });
  await d({ type: 'SetDials', mood: 5, cohesion: 5 });
  await d({ type: 'StartRound' });
  await d({ type: 'SetFocus', text: 'Bridges' });
  return { id, d };
}

describe('app store', () => {
  it('installs the starter pack and requests persistence once', async () => {
    const { store, db } = makeStore();
    await store.getState().init();
    expect(store.getState().packs.map((p) => p.id)).toEqual(['starter']);
    expect(store.getState().storage.status).toBe('best-effort');
    expect((await db.meta.get('persist.requested'))?.value).toBe('best-effort');
  });

  it('reloading mid-turn restores the exact state, including recorded rolls', async () => {
    const { store, db } = makeStore();
    const { id, d } = await setup(store);
    await d({ type: 'StartTurn' });
    await d({ type: 'RollPlacement', kind: 'event' });
    const live = store.getState().current!.state;
    const { store: store2 } = makeStore(db);
    await store2.getState().init();
    await store2.getState().openGame(id);
    expect(store2.getState().current!.state).toEqual(live);
    expect(store2.getState().current!.state.turn!.rolled.placement).toEqual(
      live.turn!.rolled.placement,
    );
  });

  it('undo cannot change a recorded roll', async () => {
    const { store, db } = makeStore();
    const { id, d } = await setup(store);
    await d({ type: 'StartTurn' });
    const tone = store.getState().current!.state.turn!.rolled.tone;
    expect(store.getState().canUndo()).toBe(false);
    await d({ type: 'RollPlacement', kind: 'event' });
    const placement = store.getState().current!.state.turn!.rolled.placement!;
    await d({ type: 'CreateEntry', kind: 'event', title: 'Toll', placement: placement.placement });
    expect(store.getState().canUndo()).toBe(true);
    expect(await store.getState().undo()).toBe(true);
    expect(await store.getState().undo()).toBe(false);
    const s = store.getState().current!.state;
    expect(s.turn!.rolled).toMatchObject({ tone, placement });
    // Persisted log matches after undo.
    const { store: store2 } = makeStore(db);
    await store2.getState().openGame(id);
    expect(store2.getState().current!.state).toEqual(s);
  });

  it('keeps rejections visible without persisting anything', async () => {
    const { store, db } = makeStore();
    await setup(store);
    const before = await db.events.count();
    const r = await store.getState().dispatch({ type: 'CommitTurn' });
    expect(r.ok).toBe(false);
    expect(store.getState().current!.rejection?.code).toBe('wrong-phase');
    expect(await db.events.count()).toBe(before);
  });

  it('exports a game file that re-imports to an identical state; duplicates are refused unless copied', async () => {
    const { store } = makeStore();
    const { id } = await setup(store);
    const file = await store.getState().exportGameFile(id);
    const again = await store.getState().importGameFile(JSON.parse(JSON.stringify(file)));
    expect(again.ok).toBe(false);
    const copy = await store
      .getState()
      .importGameFile(JSON.parse(JSON.stringify(file)), { asCopy: true });
    expect(copy.ok).toBe(true);
    const { store: other } = makeStore();
    await other.getState().init();
    const r = await other.getState().importGameFile(JSON.parse(JSON.stringify(file)));
    expect(r.ok).toBe(true);
    await other.getState().openGame(id);
    expect(other.getState().current!.state).toEqual(store.getState().current!.state);
    if (copy.ok) {
      await store.getState().openGame(copy.id);
      const c = store.getState().current!.state;
      expect(c.id).toBe(copy.id);
      expect(c.entries).toEqual(replay(file.events).entries);
    }
  });

  it('export all and import a bundle', async () => {
    const { store } = makeStore();
    await setup(store);
    const bundle = await store.getState().exportAll();
    expect(bundle.games).toHaveLength(1);
    const { store: other } = makeStore();
    await other.getState().init();
    const r = await other.getState().importBundle(JSON.parse(JSON.stringify(bundle)));
    expect(r.imported).toHaveLength(1);
    expect(other.getState().games).toHaveLength(1);
  });

  it('rejects a corrupted game file with reasons', async () => {
    const { store } = makeStore();
    const { id } = await setup(store);
    const file = await store.getState().exportGameFile(id);
    const broken = { ...file, events: file.events.slice(1) };
    const r = await store.getState().importGameFile(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/GameCreated/);
  });

  it('importing an invalid pack shows per-entry errors and changes nothing', async () => {
    const { store, db } = makeStore();
    await store.getState().init();
    const before = await db.packs.toArray();
    const r = await store
      .getState()
      .importPack({
        schemaVersion: 1,
        id: 'x',
        name: 'X',
        version: '1',
        tables: [{ id: 't', name: 'T', category: 'domain', entries: [{ text: '' }] }],
      });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.path).toBe('tables[0].entries[0].text');
    expect(await db.packs.toArray()).toEqual(before);
    const ok = await store
      .getState()
      .importPack({
        schemaVersion: 1,
        id: 'x',
        name: 'X',
        version: '1',
        tables: [{ id: 'x.t', name: 'T', category: 'domain', entries: [{ text: 'hello' }] }],
      });
    expect(ok.ok).toBe(true);
    expect(store.getState().content.tables['x.t']).toBeDefined();
    await store.getState().setPackEnabled('x', false);
    expect(store.getState().content.tables['x.t']).toBeUndefined();
  });
});

describe('backup reminder', () => {
  const meta = (m: Partial<GameMeta>): GameMeta => ({
    id: 'g',
    title: 't',
    ruleset: 'lens',
    rounds: 0,
    roundsEnded: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    eventCount: 1,
    ...m,
  });
  const at = (iso: string) => new Date(iso);
  it.each([
    [{ roundsEnded: 0 }, '2026-02-01T00:00:00Z', false],
    [{ roundsEnded: 2 }, '2026-01-02T00:00:00Z', false],
    [{ roundsEnded: 3 }, '2026-01-02T00:00:00Z', true],
    [{ roundsEnded: 1 }, '2026-01-08T00:00:00Z', true],
    [
      { roundsEnded: 4, roundsAtLastExport: 3, lastExportedAt: '2026-01-05T00:00:00Z' },
      '2026-01-06T00:00:00Z',
      false,
    ],
    [
      { roundsEnded: 6, roundsAtLastExport: 3, lastExportedAt: '2026-01-05T00:00:00Z' },
      '2026-01-06T00:00:00Z',
      true,
    ],
    [{ roundsEnded: 3, backupSnoozedAtRound: 3 }, '2026-01-02T00:00:00Z', false],
    [{ roundsEnded: 4, backupSnoozedAtRound: 3 }, '2026-01-02T00:00:00Z', true],
  ] as const)('%j at %s → %s', (m, now, due) => {
    expect(backupDue(meta(m), at(now))).toBe(due);
  });
});
