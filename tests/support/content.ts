import type { Card, Content, Deck, Generator, Seed, Table } from '../../src/engine';

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

const from = { packId: 'test-pack', packName: 'Test pack' };

export const testGeneratorTables: Table[] = [
  { id: 'g-force', name: 'Force', category: 'generator', entries: list('force', 3) },
  { id: 'g-thing', name: 'Thing', category: 'generator', entries: list('thing', 4) },
  { id: 'g-effect', name: 'Effect', category: 'generator', entries: list('effect', 2) },
];

export const testSeed: Seed = {
  id: 'seed-lens',
  title: 'Test seed',
  group: 'grp',
  ruleset: 'lens',
  pitch: 'A test premise. It has two sentences.',
  bigPicture: 'A drafted Big Picture.',
  questions: [
    {
      id: 'q1',
      text: 'Pick one?',
      pick: 'one',
      allowCustom: true,
      options: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Beta' },
      ],
    },
    {
      id: 'q2',
      text: 'Pick two?',
      pick: 'two',
      allowCustom: false,
      options: [
        { id: 'x', text: 'Ex' },
        { id: 'y', text: 'Why' },
        { id: 'z', text: 'Zed' },
      ],
    },
    {
      id: 'q3',
      text: 'One or two?',
      pick: 'oneOrTwo',
      allowCustom: true,
      options: [
        { id: 'm', text: 'Em' },
        { id: 'n', text: 'En' },
        { id: 'o', text: 'Oh' },
      ],
    },
  ],
  startBookend: {
    text: 'Start?',
    options: [
      { id: 's1', title: 'Dawn', text: 'It begins at dawn.' },
      {
        id: 's2',
        text: 'It begins with a very long sentence that has no short title of its own at all.',
      },
    ],
  },
  endBookend: {
    text: 'End?',
    options: [
      { id: 'e1', title: 'Dusk', text: 'It ends at dusk.' },
      { id: 'e2', text: 'It ends quietly.' },
    ],
  },
  palette: { yes: ['Salt'], no: ['Dragons'] },
  note: 'A designer note.',
};

export const testChronicleSeed: Seed = {
  id: 'seed-chronicle',
  title: 'Chronicle seed',
  ruleset: 'chronicle',
  pitch: 'A lighthouse.',
  subject: {
    name: 'The Light',
    description: 'A lighthouse on a cold coast.',
    traits: ['tall', 'lonely', 'bright'],
  },
  questions: [],
  startBookend: {
    text: 'Start?',
    options: [
      { id: 's', text: 'Lit.' },
      { id: 't', text: 'Built.' },
    ],
  },
  endBookend: {
    text: 'End?',
    options: [
      { id: 'e', text: 'Dark.' },
      { id: 'f', text: 'Gone.' },
    ],
  },
};

export const testAnySeed: Seed = {
  ...testChronicleSeed,
  id: 'seed-any',
  title: 'Any seed',
  ruleset: 'any',
  subject: undefined,
};

export const testGenerator: Generator = {
  id: 'gen',
  name: 'Test generator',
  group: 'grp',
  parts: [
    { id: 'f', label: 'Force', tableId: 'g-force' },
    { id: 'a', label: 'Thing', tableId: 'g-thing' },
    { id: 'e', label: 'Effect', tableId: 'g-effect' },
    { id: 'b', label: 'Thing', tableId: 'g-thing' },
  ],
  template: '{f} {a} {e} {b}',
  swap: ['a', 'b'],
};

export function testContent(): Content {
  const deck = testDeck();
  return {
    tables: Object.fromEntries([...testTables, ...testGeneratorTables].map((t) => [t.id, t])),
    decks: { [deck.id]: deck },
    groups: { grp: { id: 'grp', name: 'Group', ...from } },
    seeds: Object.fromEntries(
      [testSeed, testChronicleSeed, testAnySeed].map((x) => [x.id, { ...x, ...from }]),
    ),
    generators: { gen: { ...testGenerator, ...from } },
  };
}
