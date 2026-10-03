import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';
import {
  LAST_ROUTE_KEY,
  isStandalone,
  localStore,
  markStandalone,
  rememberRoute,
  restoreLastRoute,
} from './standalone';

type Nav = NonNullable<Parameters<typeof downloadText>[3]>;

function fakeNav(over: Record<string, unknown> = {}): Nav {
  return { standalone: true, canShare: () => true, share: vi.fn(async () => {}), ...over } as Nav;
}

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    map: m,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('downloadText', () => {
  const clicks = () => vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  it('in a browser tab, downloads through a link', async () => {
    const click = clicks();
    const share = vi.fn();
    await downloadText('a.md', '# A', 'text/markdown', fakeNav({ standalone: undefined, share }));
    expect(click).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
  });

  it('as an iOS Home Screen app, opens the share sheet with the file', async () => {
    const click = clicks();
    const nav = fakeNav();
    await downloadText('game.microscope.json', '{}', 'application/json', nav);
    expect(click).not.toHaveBeenCalled();
    const [[arg]] = (nav.share as ReturnType<typeof vi.fn>).mock.calls as [[ShareData]];
    expect(arg.files![0]!.name).toBe('game.microscope.json');
    expect(arg.files![0]!.type).toBe('application/json');
    expect(await arg.files![0]!.text()).toBe('{}');
  });

  it('retries as plain text when the type cannot be shared', async () => {
    clicks();
    const nav = fakeNav({ canShare: (d: ShareData) => d.files![0]!.type === 'text/plain' });
    await downloadText('a.md', '# A', 'text/markdown', nav);
    const [[arg]] = (nav.share as ReturnType<typeof vi.fn>).mock.calls as [[ShareData]];
    expect(arg.files![0]!.name).toBe('a.md');
    expect(arg.files![0]!.type).toBe('text/plain');
  });

  it('falls back to a download when nothing can be shared or sharing fails', async () => {
    const click = clicks();
    await downloadText('a.md', '# A', 'text/markdown', fakeNav({ canShare: () => false }));
    const failing = fakeNav({ share: vi.fn(async () => Promise.reject(new Error('nope'))) });
    await downloadText('a.md', '# A', 'text/markdown', failing);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('does nothing more when the player cancels the share sheet', async () => {
    const click = clicks();
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    await downloadText(
      'a.md',
      '# A',
      'text/markdown',
      fakeNav({ share: vi.fn(async () => Promise.reject(abort)) }),
    );
    expect(click).not.toHaveBeenCalled();
  });
});

describe('standalone launch', () => {
  const win = (hash: string, standalone: boolean) => ({
    location: { hash, replace: vi.fn() },
    navigator: {} as Navigator,
    matchMedia: (q: string) => ({ matches: standalone && q === '(display-mode: standalone)' }),
  });

  it('detects display-mode standalone and iOS navigator.standalone', () => {
    expect(isStandalone(win('', true))).toBe(true);
    expect(isStandalone(win('', false))).toBe(false);
    expect(
      isStandalone({ ...win('', false), navigator: { standalone: true } as unknown as Navigator }),
    ).toBe(true);
  });

  it('marks <html> as standalone only in the installed app', () => {
    const root = document.createElement('html');
    markStandalone(win('', true), root);
    expect(root.classList.contains('standalone')).toBe(true);
    markStandalone(win('', false), root);
    expect(root.classList.contains('standalone')).toBe(false);
  });

  it('remembers the route', () => {
    const s = memoryStorage();
    rememberRoute(s, '#/game/g1/scene/e1');
    expect(s.map.get(LAST_ROUTE_KEY)).toBe('#/game/g1/scene/e1');
  });

  it('a cold launch from the Home Screen reopens the last route', () => {
    const w = win('', true);
    restoreLastRoute(w, memoryStorage({ [LAST_ROUTE_KEY]: '#/game/g1' }));
    expect(w.location.replace).toHaveBeenCalledWith('#/game/g1');
  });

  it('does not restore in a browser tab, over an explicit route, or to an unknown route', () => {
    const s = memoryStorage({ [LAST_ROUTE_KEY]: '#/game/g1' });
    for (const w of [win('', false), win('#/packs', true)]) {
      restoreLastRoute(w, s);
      expect(w.location.replace).not.toHaveBeenCalled();
    }
    for (const saved of ['#/nowhere/x', '#/', '']) {
      const w = win('#/', true);
      restoreLastRoute(w, memoryStorage({ [LAST_ROUTE_KEY]: saved }));
      expect(w.location.replace).not.toHaveBeenCalled();
    }
  });

  it('localStore falls back to a stand-in when storage access throws', () => {
    expect(localStore(window)).toBe(window.localStorage);
    const blocked = {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    };
    const s = localStore(blocked);
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBeNull();
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const w = win('', true);
    expect(() => restoreLastRoute(w, broken)).not.toThrow();
    expect(() => rememberRoute(broken, '#/')).not.toThrow();
  });
});
