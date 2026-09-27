import { describe, expect, it } from 'vitest';
import sample from './packs/startup-sample/startup-sample.json';
import { packWarnings, validatePack } from './schemas';

type AnyPack = Record<string, unknown>;
const clone = <T>(x: T): T => structuredClone(x);
const errors = (p: unknown) => {
  const r = validatePack(p);
  return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`);
};

const v1 = {
  schemaVersion: 1,
  id: 'old',
  name: 'Old',
  version: '1',
  tables: [{ id: 't', name: 'T', category: 'domain', entries: [{ text: 'x' }] }],
};

describe('pack schema v2', () => {
  it('the startup sample validates, with no warnings', () => {
    const r = validatePack(sample);
    expect(r.ok ? [] : r.errors).toEqual([]);
    if (r.ok) {
      expect(r.pack.schemaVersion).toBe(2);
      expect(r.pack.seeds).toHaveLength(1);
      expect(r.pack.generators).toHaveLength(1);
      expect(r.pack.groups).toHaveLength(1);
      expect(packWarnings(r.pack)).toEqual([]);
    }
  });

  it('a v1 pack normalizes to v2 with empty startup arrays', () => {
    const r = validatePack(v1);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.pack).toMatchObject({
        schemaVersion: 2,
        groups: [],
        seeds: [],
        generators: [],
        decks: [],
      });
  });

  it('v1 packs cannot use v2 features', () => {
    expect(errors({ ...v1, seeds: [] })[0]).toMatch(/seeds/);
  });

  it('applies defaults: ruleset lens, pick one, custom allowed, no questions', () => {
    const p = clone(sample) as AnyPack & { seeds: Record<string, unknown>[] };
    const seed = p.seeds[0]!;
    delete seed.ruleset;
    seed.questions = [
      {
        id: 'q',
        text: 'Q?',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
      },
    ];
    const r = validatePack(p);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.pack.seeds[0]).toMatchObject({
        ruleset: 'lens',
        questions: [{ pick: 'one', allowCustom: true }],
      });
    delete seed.questions;
    const r2 = validatePack(p);
    expect(r2.ok && r2.pack.seeds[0]!.questions).toEqual([]);
  });

  const mutate = (
    f: (
      p: AnyPack & {
        seeds: AnyPack[];
        generators: AnyPack[];
        groups: AnyPack[];
        tables: AnyPack[];
      },
    ) => void,
  ) => {
    const p = clone(sample) as never;
    f(p);
    return errors(p);
  };
  const seedQ = (p: { seeds: AnyPack[] }) => p.seeds[0]!.questions as AnyPack[];

  it.each<[string, Parameters<typeof mutate>[0], string]>([
    [
      'duplicate group id',
      (p) => p.groups.push(clone(p.groups[0]!)),
      'groups[1].id: duplicate group id "frontiers"',
    ],
    [
      'duplicate seed id',
      (p) => p.seeds.push(clone(p.seeds[0]!)),
      'seeds[1].id: duplicate seed id "salt-road"',
    ],
    [
      'duplicate generator id',
      (p) => p.generators.push(clone(p.generators[0]!)),
      'generators[1].id: duplicate generator id "crossroads"',
    ],
    [
      'duplicate question id',
      (p) => seedQ(p).push(clone(seedQ(p)[0]!)),
      'seeds[0].questions[3].id: duplicate question id "cause"',
    ],
    [
      'duplicate option id',
      (p) => ((seedQ(p)[0]!.options as AnyPack[])[1]!.id = 'dam'),
      'seeds[0].questions[0].options[1].id: duplicate option id "dam"',
    ],
    [
      'duplicate bookend option id',
      (p) => (((p.seeds[0]!.startBookend as AnyPack).options as AnyPack[])[1]!.id = 'ferry'),
      'seeds[0].startBookend.options[1].id: duplicate option id "ferry"',
    ],
    [
      'duplicate part id',
      (p) => ((p.generators[0]!.parts as AnyPack[])[3]!.id = 'a'),
      'generators[0].parts[3].id: duplicate part id "a"',
    ],
    [
      'unknown seed group',
      (p) => (p.seeds[0]!.group = 'nope'),
      'seeds[0].group: unknown group "nope"',
    ],
    [
      'unknown generator group',
      (p) => (p.generators[0]!.group = 'nope'),
      'generators[0].group: unknown group "nope"',
    ],
    [
      'chronicle seed without subject',
      (p) => (p.seeds[0]!.ruleset = 'chronicle'),
      'seeds[0].subject: a chronicle seed needs a subject',
    ],
    [
      'subject on a lens seed',
      (p) => (p.seeds[0]!.subject = { name: 'S', description: 'D', traits: ['a', 'b', 'c'] }),
      'seeds[0].subject: only chronicle seeds have a subject',
    ],
    [
      'part pointing at a missing table',
      (p) => ((p.generators[0]!.parts as AnyPack[])[0]!.tableId = 'nope'),
      'generators[0].parts[0].tableId: no generator table "nope" in this pack',
    ],
    [
      'part pointing at a non-generator table',
      (p) => {
        p.tables.push({ id: 'dom', name: 'D', category: 'domain', entries: [{ text: 'x' }] });
        (p.generators[0]!.parts as AnyPack[])[0]!.tableId = 'dom';
      },
      'generators[0].parts[0].tableId: table "dom" is not a generator table',
    ],
    [
      'placeholder that is not a part',
      (p) => (p.generators[0]!.template = '{trend} {a} {impact} {b} {zzz}'),
      'generators[0].template: "{zzz}" is not a part',
    ],
    [
      'part missing from the template',
      (p) => (p.generators[0]!.template = '{trend} {a} {impact}'),
      'generators[0].template: part "b" must appear exactly once',
    ],
    [
      'part used twice',
      (p) => (p.generators[0]!.template = '{trend} {a} {impact} {b} {b}'),
      'generators[0].template: part "b" must appear exactly once',
    ],
    [
      'swap with an unknown part',
      (p) => (p.generators[0]!.swap = ['a', 'zzz']),
      'generators[0].swap: "zzz" is not a part',
    ],
    [
      'swap of a part with itself',
      (p) => (p.generators[0]!.swap = ['a', 'a']),
      'generators[0].swap: swap names two different parts',
    ],
    [
      'pick two with two options',
      (p) => {
        seedQ(p)[1]!.options = (seedQ(p)[1]!.options as AnyPack[]).slice(0, 2);
        seedQ(p)[1]!.pick = 'two';
      },
      'seeds[0].questions[1].pick: pick "two" needs at least 3 options',
    ],
    [
      'too many questions',
      (p) => {
        for (let i = 0; i < 4; i++) seedQ(p).push({ ...clone(seedQ(p)[0]!), id: `x${i}` });
      },
      'seeds[0].questions: at most 6 questions',
    ],
    [
      'a bookend with one option',
      (p) =>
        ((p.seeds[0]!.endBookend as AnyPack).options = [
          ((p.seeds[0]!.endBookend as AnyPack).options as AnyPack[])[0],
        ]),
      'seeds[0].endBookend.options: 2–6 options',
    ],
    [
      'over-long pitch',
      (p) => (p.seeds[0]!.pitch = 'x'.repeat(801)),
      'seeds[0].pitch: at most 800 characters',
    ],
    [
      'too many palette items',
      (p) => (p.seeds[0]!.palette = { yes: Array.from({ length: 7 }, (_, i) => `y${i}`), no: [] }),
      'seeds[0].palette.yes: at most 6 items',
    ],
  ])('%s', (_name, f, expected) => {
    expect(mutate(f)).toContain(expected);
  });

  it('an empty pack is refused', () => {
    expect(errors({ schemaVersion: 2, id: 'e', name: 'E', version: '1' })).toContain(
      '(pack): a pack needs at least one table, deck, seed or generator',
    );
  });

  it('a generator table no generator uses is a warning, not an error', () => {
    const p = clone(sample) as AnyPack & { tables: AnyPack[] };
    p.tables.push({
      id: 'orphan',
      name: 'Orphan',
      category: 'generator',
      entries: [{ text: 'x' }],
    });
    const r = validatePack(p);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(packWarnings(r.pack)).toEqual([
        { path: 'tables[4]', message: 'generator table "orphan" is not used by any generator' },
      ]);
  });
});
