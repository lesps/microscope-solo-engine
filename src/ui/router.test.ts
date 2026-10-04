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
    { name: 'setup', gameId: '01J', start: { kind: 'blank' } },
    { name: 'setup', gameId: '01J', start: { kind: 'seed', id: 'toolkit.far.long-signal' } },
    { name: 'setup', gameId: '01J', start: { kind: 'generator', id: 'g/1' } },
    { name: 'game-settings', gameId: '01J' },
    { name: 'scene', gameId: '01J', entryId: 'E1' },
  ];
  it.each(routes)('round-trips %j', (r) => expect(parseHash(href(r))).toEqual(r));
  it('unknown paths are not-found', () => expect(parseHash('#/nope/x').name).toBe('not-found'));
  it('malformed setup starts are not-found', () => {
    for (const h of ['#/game/g/setup/seed', '#/game/g/setup/other/x', '#/game/g/setup/blank/x'])
      expect(parseHash(h).name).toBe('not-found');
  });
  it('empty hash is the library', () => expect(parseHash('')).toEqual({ name: 'library' }));
});
