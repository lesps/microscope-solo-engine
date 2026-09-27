import { describe, expect, it } from 'vitest';
import { href, parseHash, type Route } from './router';

describe('hash routing', () => {
  const routes: Route[] = [
    { name: 'library' },
    { name: 'new' },
    { name: 'packs' },
    { name: 'app-settings' },
    { name: 'table', gameId: '01J' },
    { name: 'setup', gameId: '01J' },
    { name: 'game-settings', gameId: '01J' },
    { name: 'scene', gameId: '01J', entryId: 'E1' },
  ];
  it.each(routes)('round-trips %j', (r) => expect(parseHash(href(r))).toEqual(r));
  it('unknown paths are not-found', () => expect(parseHash('#/nope/x').name).toBe('not-found'));
  it('empty hash is the library', () => expect(parseHash('')).toEqual({ name: 'library' }));
});
