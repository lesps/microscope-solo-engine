import Dexie, { type Table } from 'dexie';
import type { Game, GameEvent, Ruleset } from '../engine';
import type { Pack } from '../content';

export const DB_NAME = 'solo-microscope';
export const SNAPSHOT_EVERY = 200;

export interface GameMeta {
  id: string;
  title: string;
  ruleset: Ruleset;
  rounds: number;
  roundsEnded: number;
  createdAt: string;
  updatedAt: string;
  eventCount: number;
  lastExportedAt?: string;
  roundsAtLastExport?: number;
  backupSnoozedAtRound?: number;
}

export interface StoredEvent {
  gameId: string;
  seq: number;
  event: GameEvent;
}

export interface Snapshot {
  gameId: string;
  seq: number;
  state: Game;
}

export interface InstalledPack {
  id: string;
  pack: Pack;
  enabled: boolean;
  installedAt: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class SoloDB extends Dexie {
  games!: Table<GameMeta, string>;
  events!: Table<StoredEvent, [string, number]>;
  snapshots!: Table<Snapshot, [string, number]>;
  packs!: Table<InstalledPack, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      games: 'id, updatedAt',
      events: '[gameId+seq], gameId',
      snapshots: '[gameId+seq], gameId',
      packs: 'id',
      meta: 'key',
    });
  }
}
