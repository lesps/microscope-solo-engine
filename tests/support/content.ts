import type { Card, Content, Deck, Table } from '../../src/engine';

const suits = ['cups', 'wands', 'swords', 'coins'];
const courts = ['page', 'knight', 'queen', 'king'] as const;

export function testDeck(): Deck {
  const cards: Card[] = [];
  for (let i = 0; i < 22; i++) {
    cards.push({
      id: `M${i}`,
      arcana: 'major',
      name: `Major ${i}`,
      upright: `up-M${i}`,
      reversed: `rev-M${i}`,
      tier: 'grand',
    });
  }
  for (const suit of suits) {
    for (let r = 1; r <= 10; r++) {
      cards.push({
        id: `${suit}-${r}`,
        arcana: 'minor',
        suit,
        rank: r,
        name: `${r} of ${suit}`,
        upright: `up-${suit}${r}`,
        reversed: `rev-${suit}${r}`,
        tier: 'moment',
      });
    }
    for (const c of courts) {
      cards.push({
        id: `${suit}-${c}`,
        arcana: 'minor',
        suit,
        rank: c,
        name: `${c} of ${suit}`,
        upright: `up-${suit}${c}`,
        reversed: `rev-${suit}${c}`,
        tier: 'character',
      });
    }
  }
  return { id: 'test-deck', name: 'Test deck', cards };
}

const list = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ text: `${prefix} ${i + 1}` }));

export const testTables: Table[] = [
  { id: 't-domain', name: 'Domains', category: 'domain', entries: list('domain', 6) },
  {
    id: 't-domain-d6',
    name: 'Ranged',
    category: 'domain',
    die: 6,
    entries: [
      { text: 'low', range: [1, 2] },
      { text: 'mid', range: [3, 4] },
      { text: 'high', range: [5, 6] },
    ],
  },
  {
    id: 't-pair',
    name: 'Pairs',
    category: 'wordPair',
    action: list('act', 5),
    subject: list('thing', 5),
  },
  { id: 't-palette', name: 'Palette', category: 'palette', entries: list('palette', 8) },
  { id: 't-reversal', name: 'Reversals', category: 'reversal', entries: list('reversal', 4) },
  { id: 't-focus', name: 'Focus', category: 'focus', entries: list('focus', 5) },
];

export function testContent(): Content {
  const deck = testDeck();
  return {
    tables: Object.fromEntries(testTables.map((t) => [t.id, t])),
    decks: { [deck.id]: deck },
  };
}
