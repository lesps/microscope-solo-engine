import { parseHash } from '../router';

export const LAST_ROUTE_KEY = 'solo-microscope:last-route';

interface Win {
  location: { hash: string; replace(url: string): void };
  navigator: Navigator;
  matchMedia(query: string): { matches: boolean };
}
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Running as an installed app: display-mode standalone, or iOS's own flag for Home Screen apps. */
export function isStandalone(w: Win): boolean {
  return (
    w.matchMedia('(display-mode: standalone)').matches ||
    (w.navigator as { standalone?: boolean }).standalone === true
  );
}

/** localStorage, or a stand-in that keeps nothing where touching storage throws. */
export function localStore(w: { localStorage: Storage }): Store {
  try {
    return w.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
}

/** Tags <html> with `standalone` so styles for the installed app apply wherever we detect it. */
export function markStandalone(w: Win, root: { classList: DOMTokenList }) {
  root.classList.toggle('standalone', isStandalone(w));
}

export function rememberRoute(storage: Store, hash: string) {
  try {
    storage.setItem(LAST_ROUTE_KEY, hash);
  } catch {
    // Private browsing or blocked storage: resuming is a convenience only.
  }
}

/**
 * iOS relaunches a Home Screen app at its start URL whenever it was evicted in the background.
 * Reopen the last route instead, as a native app would. Explicit routes are left alone.
 */
export function restoreLastRoute(w: Win, storage: Store) {
  if (!isStandalone(w) || !['', '#', '#/'].includes(w.location.hash)) return;
  let saved: string | null = null;
  try {
    saved = storage.getItem(LAST_ROUTE_KEY);
  } catch {
    return;
  }
  if (!saved) return;
  const route = parseHash(saved);
  if (route.name === 'library' || route.name === 'not-found') return;
  w.location.replace(saved);
}
