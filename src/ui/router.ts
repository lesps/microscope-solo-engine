import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'new' }
  | { name: 'setup'; gameId: string; start?: StartChoice }
  | { name: 'table'; gameId: string }
  | { name: 'scene'; gameId: string; entryId: string }
  | { name: 'game-settings'; gameId: string }
  | { name: 'packs' }
  | { name: 'app-settings' }
  | { name: 'not-found'; path: string };

/** What the New game screen chose to start from; setup opens on it. */
export type StartChoice = { kind: 'blank' } | { kind: 'seed' | 'generator'; id: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: 'library' };
  if (parts[0] === 'new' && parts.length === 1) return { name: 'new' };
  if (parts[0] === 'packs' && parts.length === 1) return { name: 'packs' };
  if (parts[0] === 'settings' && parts.length === 1) return { name: 'app-settings' };
  if (parts[0] === 'game' && parts[1]) {
    const gameId = parts[1];
    if (parts.length === 2) return { name: 'table', gameId };
    if (parts[2] === 'setup' && parts.length === 3) return { name: 'setup', gameId };
    if (parts[2] === 'setup' && parts[3] === 'blank' && parts.length === 4)
      return { name: 'setup', gameId, start: { kind: 'blank' } };
    if (
      parts[2] === 'setup' &&
      (parts[3] === 'seed' || parts[3] === 'generator') &&
      parts[4] &&
      parts.length === 5
    )
      return { name: 'setup', gameId, start: { kind: parts[3], id: parts[4] } };
    if (parts[2] === 'settings' && parts.length === 3) return { name: 'game-settings', gameId };
    if (parts[2] === 'scene' && parts[3] && parts.length === 4)
      return { name: 'scene', gameId, entryId: parts[3] };
  }
  return { name: 'not-found', path };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'library':
      return '#/';
    case 'new':
      return '#/new';
    case 'packs':
      return '#/packs';
    case 'app-settings':
      return '#/settings';
    case 'setup': {
      const base = `#/game/${encodeURIComponent(r.gameId)}/setup`;
      if (!r.start) return base;
      return r.start.kind === 'blank'
        ? `${base}/blank`
        : `${base}/${r.start.kind}/${encodeURIComponent(r.start.id)}`;
    }
    case 'table':
      return `#/game/${encodeURIComponent(r.gameId)}`;
    case 'game-settings':
      return `#/game/${encodeURIComponent(r.gameId)}/settings`;
    case 'scene':
      return `#/game/${encodeURIComponent(r.gameId)}/scene/${encodeURIComponent(r.entryId)}`;
    case 'not-found':
      return '#/';
  }
}

export function navigate(r: Route) {
  window.location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
