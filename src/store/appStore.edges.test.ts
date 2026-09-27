import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { STARTER_PACK } from '../content';
import { SoloDB } from '../persistence';
import * as repo from '../persistence/repo';
import { createAppStore } from './appStore';
import { selectStep, selectWarnings } from './selectors';

let n = 0;
async function make() {
  let id = 0;
  const store = createAppStore({
    db: new SoloDB(`edges-${++n}`),
    newId: () => `E${String(++id).padStart(6, '0')}`,
    randomSeed: () => '0123456789abcdef0123456789abcdef',
    requestPersist: async () => 'persisted',
    storage: async () => ({ status: 'persisted' }),
  });
  await store.getState().init();
  return store;
}

describe('store edge cases', () => {
  it('dispatch and undo without an open game', async () => {
    const store = await make();
    expect(await store.getState().dispatch({ type: 'StartRound' })).toEqual({
      ok: false,
      rejection: { code: 'no-game', message: 'no game open' },
    });
    expect(await store.getState().undo()).toBe(false);
    expect(store.getState().canUndo()).toBe(false);
  });

  it('openGame reports a missing game; opening the current game is a no-op', async () => {
    const store = await make();
    expect(await store.getState().openGame('nope')).toBe(false);
    const id = await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    expect(await store.getState().openGame(id)).toBe(true);
    store.getState().closeGame();
    expect(store.getState().current).toBeUndefined();
    expect(await store.getState().openGame(id)).toBe(true);
  });

  it('a failed append marks the save as failed but keeps the state', async () => {
    const store = await make();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    const spy = vi
      .spyOn(repo, 'appendEvents')
      .mockRejectedValueOnce(new Error('QuotaExceededError'));
    const r = await store.getState().dispatch({ type: 'SetBigPicture', text: 'x' });
    expect(r.ok).toBe(true);
    expect(store.getState().current).toMatchObject({
      save: 'error',
      saveError: 'QuotaExceededError',
    });
    expect(store.getState().current!.state.bigPicture).toBe('x');
    spy.mockRestore();
    await store
      .getState()
      .dispatch({ type: 'AddPaletteItem', list: 'yes', text: 'y' })
      .catch(() => undefined);
  });

  it('createGame surfaces an engine rejection', async () => {
    const store = await make();
    await expect(store.getState().createGame({ title: ' ', ruleset: 'lens' })).rejects.toThrow(
      'game title is required',
    );
  });

  it('clearRejection is a no-op without a rejection', async () => {
    const store = await make();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    const before = store.getState().current;
    store.getState().clearRejection();
    expect(store.getState().current).toBe(before);
  });

  it('a malformed bundle is reported as one failure', async () => {
    const store = await make();
    const r = await store.getState().importBundle({ format: 'nope' });
    expect(r.imported).toEqual([]);
    expect(r.failed[0]!.title).toBe('(bundle)');
    const r2 = await store.getState().importBundle({
      format: 'solo-microscope/bundle',
      schemaVersion: 1,
      exportedAt: 'x',
      games: [{ title: 'Broken' }, null],
    });
    expect(r2.failed.map((f) => f.title)).toEqual(['Broken', '(untitled)']);
  });

  it('refuses a pack claiming the starter id or colliding ids; the starter cannot be removed', async () => {
    const store = await make();
    expect(await store.getState().importPack({ ...STARTER_PACK })).toEqual({
      ok: false,
      errors: [{ path: 'id', message: 'the starter pack is built in' }],
    });
    const clash = await store.getState().importPack({ ...STARTER_PACK, id: 'copy' });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.errors[0]!.message).toMatch(/already used by an installed pack/);
    await store.getState().removePack('starter');
    expect(store.getState().packs.map((p) => p.id)).toEqual(['starter']);
  });

  it('keeps the stored starter pack current with the build and persistence requests once', async () => {
    const db = new SoloDB(`edges-${++n}`);
    await db.packs.put({
      id: 'starter',
      pack: { ...STARTER_PACK, version: '0.0.1' },
      enabled: true,
      installedAt: 'x',
    });
    await db.meta.put({ key: 'persist.requested', value: 'best-effort' });
    const persist = vi.fn(async () => 'persisted' as const);
    const store = createAppStore({
      db,
      requestPersist: persist,
      storage: async () => ({ status: 'persisted' }),
    });
    await store.getState().init();
    expect(store.getState().packs[0]!.pack.version).toBe(STARTER_PACK.version);
    expect(persist).not.toHaveBeenCalled();
    await store.getState().requestPersistence();
    expect(persist).toHaveBeenCalledTimes(1);
    expect((await db.meta.get('persist.requested'))!.value).toBe('persisted');
  });

  it('uses real ids, clock and crypto seed by default', async () => {
    const store = createAppStore({
      db: new SoloDB(`edges-${++n}`),
      requestPersist: async () => 'best-effort',
      storage: async () => ({ status: 'best-effort' }),
    });
    await store.getState().init();
    const id = await store.getState().createGame({ title: 'Real', ruleset: 'lens' });
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(store.getState().current!.state.seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it('selectors derive the next step and warnings', async () => {
    const store = await make();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    expect(selectStep(store.getState().current!.state)).toBe('setup');
    expect(selectWarnings(store.getState().current!.state)).toEqual([]);
  });
});
