import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type GameEvent } from '../engine';
import { migrateEvents } from './migrations';
import { requestPersistence, storageInfo } from './storage';

function mockStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal('navigator', storage === undefined ? {} : { storage });
}

describe('storage persistence API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports unsupported without navigator.storage', async () => {
    mockStorage(undefined);
    expect(await requestPersistence()).toBe('unsupported');
    expect(await storageInfo()).toEqual({ status: 'unsupported' });
  });

  it('maps persist() results, including a thrown error', async () => {
    mockStorage({ persist: async () => true });
    expect(await requestPersistence()).toBe('persisted');
    mockStorage({ persist: async () => false });
    expect(await requestPersistence()).toBe('best-effort');
    mockStorage({ persist: () => Promise.reject(new Error('denied')) });
    expect(await requestPersistence()).toBe('best-effort');
  });

  it('reads persisted() and estimate()', async () => {
    mockStorage({ persisted: async () => true, estimate: async () => ({ usage: 10, quota: 100 }) });
    expect(await storageInfo()).toEqual({ status: 'persisted', usage: 10, quota: 100 });
    mockStorage({ persisted: async () => false });
    expect(await storageInfo()).toEqual({
      status: 'best-effort',
      usage: undefined,
      quota: undefined,
    });
  });
});

describe('migrations', () => {
  const events = [] as GameEvent[];
  it('passes the current schema through unchanged', () => {
    expect(migrateEvents(SCHEMA_VERSION, events)).toBe(events);
  });
  it('refuses files from a newer app', () => {
    expect(() => migrateEvents(SCHEMA_VERSION + 1, events)).toThrow(/newer than this app/);
  });
  it('refuses a schema with no migration path', () => {
    expect(() => migrateEvents(0, events)).toThrow(/no migration from schema 0/);
  });
});
