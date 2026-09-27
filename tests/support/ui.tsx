import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Command, Settings } from '../../src/engine';
import { SoloDB } from '../../src/persistence';
import { createAppStore, type AppStore } from '../../src/store';
import { StoreContext } from '../../src/ui/StoreContext';

let dbCount = 0;

export async function makeStore(
  opts: { persist?: 'persisted' | 'best-effort' } = {},
): Promise<AppStore> {
  let id = 0;
  let t = Date.UTC(2026, 0, 1);
  const store = createAppStore({
    db: new SoloDB(`ui-test-${++dbCount}`),
    newId: () => `U${String(++id).padStart(8, '0')}`,
    now: () => new Date((t += 1000)).toISOString(),
    randomSeed: () => '00112233445566778899aabbccddeeff',
    requestPersist: async () => opts.persist ?? 'best-effort',
    storage: async () => ({
      status: opts.persist ?? 'best-effort',
      usage: 2_500_000,
      quota: 1_000_000_000,
    }),
  });
  await store.getState().init();
  return store;
}

export async function run(store: AppStore, cmd: Command) {
  const r = await store.getState().dispatch(cmd);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.rejection.message}`);
}

export function startPeriodId(store: AppStore): string {
  return Object.values(store.getState().current!.state.entries).find(
    (e) => e.kind === 'period' && e.bookend === 'start',
  )!.id;
}

/** A game with setup done up to (and optionally including) starting round 1. */
export async function gameInPlay(
  store: AppStore,
  opts: {
    ruleset?: 'lens' | 'chronicle';
    settings?: (s: Settings) => Settings;
    start?: boolean;
    focus?: string;
  } = {},
): Promise<string> {
  const ruleset = opts.ruleset ?? 'lens';
  const id = await store.getState().createGame({ title: 'River', ruleset });
  if (opts.settings)
    await run(store, {
      type: 'ChangeSettings',
      settings: opts.settings(store.getState().current!.state.settings),
    });
  if (ruleset === 'chronicle') {
    await run(store, {
      type: 'SetSubject',
      subject: {
        name: 'Saltmark Light',
        description: 'A lighthouse.',
        traits: ['tall', 'lonely', 'bright'],
      },
    });
    await run(store, {
      type: 'SetBookends',
      start: { title: 'First lamp', prose: '', tone: 'light', anchor: { name: 'The Builder' } },
      end: { title: 'Last keeper', prose: '', tone: 'dark', anchor: { name: 'The Keeper' } },
    });
    await run(store, {
      type: 'AddFirstPassEntry',
      kind: 'period',
      title: 'Wreck years',
      tone: 'dark',
      placement: { parentId: null, index: 1 },
      anchor: { name: 'Ada' },
      change: { op: 'add', trait: 'haunted' },
    });
  } else {
    await run(store, { type: 'SetBigPicture', text: 'A river city rises and drowns.' });
    await run(store, {
      type: 'SetBookends',
      start: { title: 'Founding', prose: 'Mud.', tone: 'light' },
      end: { title: 'Drowning', prose: '', tone: 'dark' },
    });
    await run(store, {
      type: 'AddFirstPassEntry',
      kind: 'period',
      title: 'Canals',
      tone: 'light',
      placement: { parentId: null, index: 1 },
    });
  }
  await run(store, { type: 'AddPaletteItem', list: 'yes', text: 'Bridges' });
  await run(store, { type: 'AddPaletteItem', list: 'no', text: 'Dragons' });
  await run(store, {
    type: 'AddFirstPassEntry',
    kind: 'event',
    title: 'First bridge',
    tone: 'dark',
    placement: { parentId: startPeriodId(store), index: 0 },
  });
  await run(store, { type: 'SetDials', mood: 5, cohesion: 5, chaos: 5 });
  if (opts.start !== false) {
    await run(store, { type: 'StartRound' });
    if (opts.focus !== undefined) await run(store, { type: 'SetFocus', text: opts.focus });
  }
  return id;
}

export function renderWith(store: AppStore, ui: ReactElement): RenderResult {
  return render(<StoreContext.Provider value={store}>{ui}</StoreContext.Provider>);
}

export const withModes =
  (modes: Partial<Settings['modes']>, rest: Partial<Settings> = {}) =>
  (s: Settings): Settings => ({ ...s, ...rest, modes: { ...s.modes, ...modes } });

/** Plays one complete round from "start-round" (cohesion should be off or the cap 1). */
export async function playRound(store: AppStore, focus = 'Focus') {
  const g = () => store.getState().current!.state;
  await run(store, { type: 'StartRound' });
  if (!g().rounds.at(-1)!.focus) await run(store, { type: 'SetFocus', text: focus });
  const turn = async () => {
    const placementOff = g().settings.modes.placement === 'off';
    if (!placementOff) await run(store, { type: 'RollPlacement', kind: 'event' });
    const placement = placementOff
      ? { parentId: startPeriodId(store), index: 0 }
      : g().turn!.rolled.placement!.placement;
    await run(store, {
      type: 'CreateEntry',
      kind: 'event',
      title: 'An event',
      tone: g().turn!.rolled.tone ?? 'light',
      placement,
    });
    await run(store, { type: 'CommitTurn' });
  };
  await run(store, { type: 'StartTurn' });
  await turn();
  const evict = g().legacies.length >= 6 ? g().legacies[0]!.id : undefined;
  if (evict && g().settings.modes['legacy.evict'] !== 'off')
    await run(store, { type: 'RollEvict' });
  await run(store, {
    type: 'AddLegacy',
    text: `Legacy ${g().rounds.length}`,
    evictId: g().settings.modes['legacy.evict'] === 'off' ? evict : undefined,
  });
  if (g().settings.modes['legacy.explore'] === 'off')
    await run(store, { type: 'ExploreLegacy', legacyId: g().legacies[0]!.id });
  else {
    await run(store, { type: 'RollExplore' });
    await run(store, { type: 'ExploreLegacy' });
  }
  await turn();
  await run(store, { type: 'EndRound', mood: 0, cohesion: 0 });
}
