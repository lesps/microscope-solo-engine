import { ulid } from 'ulid';
import { createStore } from 'zustand/vanilla';
import {
  BUNDLED_PACKS,
  buildContent,
  collisions,
  normalizePack,
  validatePack,
  type PackError,
} from '../content';
import {
  emptyContent,
  execute,
  initialGame,
  replay,
  seedFromBytes,
  undoableTail,
  type Command,
  type Content,
  type Env,
  type Game,
  type GameEvent,
  type Rejection,
  type Ruleset,
} from '../engine';
import {
  bundleSchema,
  parseGameFile,
  rewriteGameId,
  toBundle,
  toGameFile,
  type Bundle,
  type GameFile,
} from '../export';
import {
  appendEvents,
  deleteGame,
  getMeta,
  listGames,
  loadEvents,
  loadGame,
  markExported,
  migrateEvents,
  requestPersistence,
  saveImportedGame,
  setMeta,
  snoozeBackup,
  storageInfo,
  truncateEvents,
  type GameMeta,
  type InstalledPack,
  type SoloDB,
  type StorageInfo,
} from '../persistence';
import { DEFAULT_BACKUP, backupDue, type BackupThresholds } from './backup';

export interface AppDeps {
  db: SoloDB;
  newId?: () => string;
  now?: () => string;
  randomSeed?: () => string;
  requestPersist?: () => Promise<StorageInfo['status']>;
  storage?: () => Promise<StorageInfo>;
}

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface CurrentGame {
  id: string;
  state: Game;
  events: GameEvent[];
  rejection?: Rejection;
  save: SaveStatus;
  saveError?: string;
}

export interface AppState {
  ready: boolean;
  packs: InstalledPack[];
  content: Content;
  games: GameMeta[];
  current?: CurrentGame;
  storage: StorageInfo;
  backup: BackupThresholds;

  init(): Promise<void>;
  refreshGames(): Promise<void>;
  createGame(opts: { title: string; ruleset: Ruleset; deckId?: string }): Promise<string>;
  openGame(id: string): Promise<boolean>;
  closeGame(): void;
  dispatch(cmd: Command): Promise<{ ok: true } | { ok: false; rejection: Rejection }>;
  canUndo(): boolean;
  undo(): Promise<boolean>;
  clearRejection(): void;

  exportGameFile(id: string): Promise<GameFile>;
  exportAll(): Promise<Bundle>;
  importGameFile(
    input: unknown,
    opts?: { asCopy?: boolean },
  ): Promise<{ ok: true; id: string } | { ok: false; errors: string[]; exists?: boolean }>;
  importBundle(
    input: unknown,
    opts?: { asCopy?: boolean },
  ): Promise<{
    imported: string[];
    failed: { title: string; errors: string[] }[];
    existing?: Bundle;
  }>;
  duplicateGame(id: string): Promise<string>;
  removeGame(id: string): Promise<void>;
  isBackupDue(meta: GameMeta): boolean;
  snoozeBackup(id: string): Promise<void>;
  setBackupThresholds(t: BackupThresholds): Promise<void>;
  requestPersistence(): Promise<void>;

  importPack(input: unknown): Promise<{ ok: true } | { ok: false; errors: PackError[] }>;
  setPackEnabled(id: string, enabled: boolean): Promise<void>;
  removePack(id: string): Promise<void>;
}

function defaultSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return seedFromBytes(bytes);
}

export function createAppStore(deps: AppDeps) {
  const { db } = deps;
  const newId = deps.newId ?? (() => ulid());
  const now = deps.now ?? (() => new Date().toISOString());
  const randomSeed = deps.randomSeed ?? defaultSeed;
  const doPersist = deps.requestPersist ?? requestPersistence;
  const doStorage = deps.storage ?? storageInfo;

  // Commands run strictly one after another so appends never interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const p = queue.then(f, f);
    queue = p.catch(() => undefined);
    return p;
  };

  const store = createStore<AppState>()((set, get) => {
    const env = (): Env => ({ newId, now, content: get().content });
    const enabledContent = (packs: InstalledPack[]) =>
      buildContent(packs.filter((p) => p.enabled).map((p) => p.pack));

    const loadPacks = async () => {
      const stored = new Map((await db.packs.toArray()).map((p) => [p.id, p]));
      const packs: InstalledPack[] = [];
      // Bundled packs come first (so their ids win), refreshed from the build on every load.
      for (const pack of BUNDLED_PACKS) {
        const row = stored.get(pack.id);
        if (row) packs.push({ ...row, pack });
        else {
          const installed: InstalledPack = { id: pack.id, pack, enabled: true, installedAt: now() };
          await db.packs.put(installed);
          packs.push(installed);
        }
        stored.delete(pack.id);
      }
      // Packs stored before pack schema 2 lack the startup arrays; normalize them in memory.
      for (const row of stored.values()) packs.push({ ...row, pack: normalizePack(row.pack) });
      set({ packs, content: enabledContent(packs) });
    };

    const freshGameId = async () => {
      let id = newId();
      while (await db.games.get(id)) id = newId();
      return id;
    };

    const saveImport = async (events: GameEvent[], state: Game) => {
      await saveImportedGame(db, events, state);
      await get().refreshGames();
    };

    return {
      ready: false,
      packs: [],
      content: emptyContent(),
      games: [],
      storage: { status: 'unsupported' },
      backup: DEFAULT_BACKUP,

      async init() {
        await loadPacks();
        const backup = (await getMeta<BackupThresholds>(db, 'backup.thresholds')) ?? DEFAULT_BACKUP;
        if (!(await getMeta<string>(db, 'persist.requested'))) {
          const status = await doPersist();
          await setMeta(db, 'persist.requested', status);
        }
        const storage = await doStorage();
        set({ backup, storage });
        await get().refreshGames();
        set({ ready: true });
      },

      async refreshGames() {
        set({ games: await listGames(db) });
      },

      async createGame({ title, ruleset, deckId }) {
        const id = newId();
        const content = get().content;
        const r = execute(
          initialGame(),
          { type: 'CreateGame', id, title, ruleset, seed: randomSeed(), deckId },
          { newId, now, content },
        );
        if (!r.ok) throw new Error(r.rejection.message);
        await appendEvents(db, r.events, r.state, now());
        set({ current: { id, state: r.state, events: r.events, save: 'saved' } });
        await get().refreshGames();
        return id;
      },

      async openGame(id) {
        if (get().current?.id === id) return true;
        const loaded = await loadGame(db, id);
        if (!loaded) return false;
        set({ current: { id, state: loaded.state, events: loaded.events, save: 'saved' } });
        return true;
      },

      closeGame() {
        set({ current: undefined });
      },

      dispatch(cmd) {
        return serial(async () => {
          const cur = get().current;
          if (!cur)
            return {
              ok: false as const,
              rejection: { code: 'no-game' as const, message: 'no game open' },
            };
          const r = execute(cur.state, cmd, env());
          if (!r.ok) {
            set({ current: { ...cur, rejection: r.rejection } });
            return { ok: false as const, rejection: r.rejection };
          }
          const next: CurrentGame = {
            ...cur,
            state: r.state,
            events: [...cur.events, ...r.events],
            rejection: undefined,
            save: 'saving',
          };
          set({ current: next });
          try {
            await appendEvents(db, r.events, r.state, now());
            const latest = get().current;
            if (latest?.id === cur.id)
              set({ current: { ...latest, save: 'saved', saveError: undefined } });
            const listed = new Set(['RoundEnded', 'RoundStarted', 'GameRenamed']);
            if (r.events.some((e) => listed.has(e.type))) await get().refreshGames();
          } catch (e) {
            const latest = get().current;
            if (latest?.id === cur.id)
              set({ current: { ...latest, save: 'error', saveError: (e as Error).message } });
          }
          return { ok: true as const };
        });
      },

      canUndo() {
        const cur = get().current;
        return !!cur && !!undoableTail(cur.state, cur.events);
      },

      undo() {
        return serial(async () => {
          const cur = get().current;
          if (!cur) return false;
          const tail = undoableTail(cur.state, cur.events);
          if (!tail) return false;
          const events = cur.events.slice(0, cur.events.length - tail.length);
          const state = replay(events);
          set({ current: { ...cur, events, state, rejection: undefined, save: 'saving' } });
          await truncateEvents(db, cur.id, tail[0]!.seq, state);
          set({ current: { ...get().current!, save: 'saved' } });
          return true;
        });
      },

      clearRejection() {
        const cur = get().current;
        if (cur?.rejection) set({ current: { ...cur, rejection: undefined } });
      },

      async exportGameFile(id) {
        const cur = get().current;
        const events = cur?.id === id ? cur.events : await loadEvents(db, id);
        const state = cur?.id === id ? cur.state : replay(events);
        const file = toGameFile(state, events, now());
        await markExported(db, id, state.rounds.filter((r) => r.ended).length, now());
        await get().refreshGames();
        return file;
      },

      async exportAll() {
        const files: GameFile[] = [];
        for (const meta of await listGames(db)) {
          const events = await loadEvents(db, meta.id);
          if (events.length) files.push(toGameFile(replay(events), events, now()));
        }
        for (const f of files)
          await markExported(
            db,
            f.gameId,
            replay(f.events).rounds.filter((r) => r.ended).length,
            now(),
          );
        await get().refreshGames();
        return toBundle(files, now());
      },

      async importGameFile(input, opts = {}) {
        const parsed = parseGameFile(input, migrateEvents);
        if (!parsed.ok) return parsed;
        let { events, state } = { events: parsed.file.events, state: parsed.state };
        const exists = !!(await db.games.get(state.id));
        if (exists && !opts.asCopy) {
          return {
            ok: false as const,
            exists: true,
            errors: [`a game with id ${state.id} already exists — import as a copy instead`],
          };
        }
        if (opts.asCopy) {
          events = rewriteGameId(events, await freshGameId());
          state = replay(events);
        }
        await saveImport(events, state);
        return { ok: true as const, id: state.id };
      },

      async importBundle(input, opts = {}) {
        const b = bundleSchema.safeParse(input);
        if (!b.success)
          return {
            imported: [],
            failed: [{ title: '(bundle)', errors: b.error.issues.map((i) => i.message) }],
          };
        const imported: string[] = [];
        const failed: { title: string; errors: string[] }[] = [];
        const existing: unknown[] = [];
        for (const g of b.data.games) {
          const r = await get().importGameFile(g, opts);
          if (r.ok) imported.push(r.id);
          else if (r.exists) existing.push(g);
          else
            failed.push({
              title: (g as { title?: string })?.title ?? '(untitled)',
              errors: r.errors,
            });
        }
        // Games whose ids already exist come back as a bundle the caller can re-import as copies.
        if (!existing.length) return { imported, failed };
        return {
          imported,
          failed,
          existing: { ...(b.data as Bundle), games: existing as GameFile[] },
        };
      },

      async duplicateGame(id) {
        const events = rewriteGameId(await loadEvents(db, id), await freshGameId());
        const state = replay(events);
        await saveImport(events, state);
        return state.id;
      },

      async removeGame(id) {
        await deleteGame(db, id);
        if (get().current?.id === id) set({ current: undefined });
        await get().refreshGames();
      },

      isBackupDue(meta) {
        return backupDue(meta, new Date(now()), get().backup);
      },

      async snoozeBackup(id) {
        const meta = await db.games.get(id);
        if (meta) await snoozeBackup(db, id, meta.roundsEnded);
        await get().refreshGames();
      },

      async setBackupThresholds(t) {
        await setMeta(db, 'backup.thresholds', t);
        set({ backup: t });
      },

      async requestPersistence() {
        const status = await doPersist();
        await setMeta(db, 'persist.requested', status);
        set({ storage: await doStorage() });
      },

      async importPack(input) {
        const r = validatePack(input);
        if (!r.ok) return r;
        if (BUNDLED_PACKS.some((p) => p.id === r.pack.id))
          return { ok: false, errors: [{ path: 'id', message: 'bundled packs are built in' }] };
        const clash = collisions(
          r.pack,
          get().packs.map((p) => p.pack),
        );
        if (clash.length)
          return {
            ok: false,
            errors: clash.map((id) => ({
              path: 'id',
              message: `id "${id}" is already used by an installed pack`,
            })),
          };
        const row: InstalledPack = {
          id: r.pack.id,
          pack: r.pack,
          enabled: true,
          installedAt: now(),
        };
        await db.packs.put(row);
        await loadPacks();
        return { ok: true };
      },

      async setPackEnabled(id, enabled) {
        await db.packs.update(id, { enabled });
        await loadPacks();
      },

      async removePack(id) {
        if (BUNDLED_PACKS.some((p) => p.id === id)) return;
        await db.packs.delete(id);
        await loadPacks();
      },
    };
  });
  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
