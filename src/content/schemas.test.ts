import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import malformed from '../../tests/fixtures/packs/malformed.json';
import { STARTER_PACK, buildContent, collisions, packWarnings, validatePack } from '.';

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

  it('every JSON example in docs/content-packs.md validates without warnings', () => {
    const doc = fs.readFileSync(
      path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/content-packs.md'),
      'utf8',
    );
    const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]!);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const json of blocks) {
      const r = validatePack(JSON.parse(json));
      expect(r.ok ? packWarnings(r.pack) : r.errors).toEqual([]);
    }
  });
});

describe('pack semantic checks', () => {
  const pack = (tables: unknown[]) => ({
    schemaVersion: 1,
    id: 'p',
    name: 'P',
    version: '1',
    tables,
  });
  const errors = (tables: unknown[]) => {
    const r = validatePack(pack(tables));
    return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`);
  };

  it.each([
    [
      [
        {
          id: 't',
          name: 'T',
          category: 'domain',
          entries: [{ text: 'a', range: [1, 1] }, { text: 'b' }],
        },
      ],
      'tables[0].entries: either every entry has a range or none does',
    ],
    [
      [{ id: 't', name: 'T', category: 'domain', entries: [{ text: 'a', range: [1, 2] }] }],
      'tables[0].die: ranged tables need a die',
    ],
    [
      [{ id: 't', name: 'T', category: 'domain', die: 2, entries: [{ text: 'a', range: [1, 3] }] }],
      'tables[0].entries[0].range: range exceeds d2',
    ],
    [
      [{ id: 't', name: 'T', category: 'domain', die: 3, entries: [{ text: 'a', range: [1, 2] }] }],
      'tables[0].entries: result 3 is not covered',
    ],
    [
      [
        {
          id: 't',
          name: 'T',
          category: 'domain',
          die: 2,
          entries: [
            { text: 'a', range: [2, 1] },
            { text: 'b', range: [1, 2] },
          ],
        },
      ],
      'tables[0].entries[0].range: range must be [low, high]',
    ],
    [
      [
        {
          id: 't',
          name: 'T',
          category: 'wordPair',
          die: 2,
          action: [{ text: 'a', range: [1, 2] }],
          subject: [{ text: 'b', range: [1, 1] }],
        },
      ],
      'tables[0].subject: result 2 is not covered',
    ],
  ])('%j → %s', (tables, message) => expect(errors(tables)).toContain(message));

  it('reports duplicate deck ids and card ids, and rank rules for minors', () => {
    const r = validatePack({
      schemaVersion: 1,
      id: 'p',
      name: 'P',
      version: '1',
      decks: [
        {
          id: 'd',
          name: 'D',
          cards: [
            {
              id: 'c',
              arcana: 'minor',
              suit: 'cups',
              name: 'x',
              upright: 'a',
              reversed: 'b',
              tier: 'moment',
            },
          ],
        },
        {
          id: 'd',
          name: 'D2',
          cards: [
            {
              id: 'k',
              arcana: 'minor',
              suit: 'cups',
              rank: 'king',
              name: 'K',
              upright: 'a',
              reversed: 'b',
              tier: 'moment',
            },
          ],
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const msgs = r.errors.map((e) => `${e.path}: ${e.message}`);
      expect(msgs).toEqual(
        expect.arrayContaining([
          'decks[0].cards[0].rank: minor cards need a rank',
          'decks[1].cards[0].tier: tier should be "character"',
        ]),
      );
    }
    const dup = validatePack({
      schemaVersion: 1,
      id: 'p',
      name: 'P',
      version: '1',
      decks: [
        {
          id: 'd',
          name: 'D',
          cards: [
            { id: 'm', arcana: 'major', name: 'M', upright: 'a', reversed: 'b', tier: 'grand' },
          ],
        },
        {
          id: 'd',
          name: 'E',
          cards: [
            { id: 'm', arcana: 'major', name: 'M', upright: 'a', reversed: 'b', tier: 'grand' },
          ],
        },
      ],
    });
    expect(!dup.ok && dup.errors).toEqual(
      expect.arrayContaining([{ path: 'decks[1].id', message: 'duplicate deck id "d"' }]),
    );
  });

  it('a top-level error has a readable path', () => {
    const r = validatePack(42);
    expect(!r.ok && r.errors[0]!.path).toBe('(pack)');
  });
});
