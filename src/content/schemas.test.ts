import { describe, expect, it } from 'vitest';
import malformed from '../../tests/fixtures/packs/malformed.json';
import { STARTER_PACK, buildContent, collisions, validatePack } from '.';

describe('content packs', () => {
  it('the starter pack validates, with a full 78-card deck and one keyword per side', () => {
    expect(validatePack(STARTER_PACK).ok).toBe(true);
    const deck = STARTER_PACK.decks[0]!;
    expect(deck.cards).toHaveLength(78);
    expect(deck.cards.filter((c) => c.arcana === 'major')).toHaveLength(22);
    expect(deck.cards.filter((c) => c.tier === 'character')).toHaveLength(16);
    expect(new Set(STARTER_PACK.tables.map((t) => t.category))).toEqual(
      new Set(['domain', 'focus', 'wordPair', 'palette', 'reversal']),
    );
  });

  it('reports malformed packs with specific error paths', () => {
    const r = validatePack(malformed);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const paths = r.errors.map((e) => `${e.path}: ${e.message}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^id: ids use/),
        expect.stringMatching(/^tables\[1\]\.entries\[0\]\.text: must not be empty/),
        expect.stringMatching(/^tables\[2\]\.category/),
        expect.stringMatching(/^decks\[0\]\.cards\[0\]\.suit: minor cards need a suit/),
        expect.stringMatching(/^decks\[0\]\.cards\[0\]\.upright: a keyword is one or two words/),
        expect.stringMatching(/^decks\[0\]\.cards\[1\]\.tier: tier should be "grand"/),
      ]),
    );
  });

  it('semantic checks run once the shape is valid: range coverage and duplicate ids', () => {
    const pack = {
      schemaVersion: 1,
      id: 'p',
      name: 'P',
      version: '1',
      tables: [
        {
          id: 't',
          name: 'R',
          category: 'domain',
          die: 6,
          entries: [
            { text: 'a', range: [1, 2] },
            { text: 'b', range: [2, 6] },
          ],
        },
        { id: 't', name: 'D', category: 'focus', entries: [{ text: 'x' }] },
      ],
    };
    const r = validatePack(pack);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual(
        expect.arrayContaining([
          { path: 'tables[0].entries', message: 'result 2 is covered 2 times' },
          { path: 'tables[1].id', message: 'duplicate table id "t"' },
        ]),
      );
    }
  });

  it('builds engine content and detects id collisions', () => {
    const c = buildContent([STARTER_PACK]);
    expect(Object.keys(c.tables)).toContain('starter.domains');
    expect(c.decks['starter.deck']!.cards).toHaveLength(78);
    expect(collisions({ ...STARTER_PACK, id: 'copy' }, [STARTER_PACK])).toContain(
      'starter.domains',
    );
  });
});
