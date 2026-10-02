import { describe, expect, it } from 'vitest';
import sample from './packs/startup-sample/startup-sample.json';
import myth from '../../toolkits/myth-and-iron.json';
import far from '../../toolkits/far-horizons.json';
import home from '../../toolkits/close-to-home.json';
import mythV1 from '../../toolkits/import-now/myth-and-iron.json';
import farV1 from '../../toolkits/import-now/far-horizons.json';
import homeV1 from '../../toolkits/import-now/close-to-home.json';
import { STARTER_PACK, collisions } from '.';
import { packWarnings, validatePack, type Pack } from './schemas';

const errors = (p: unknown) => {
  const r = validatePack(p);
  return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`);
};
const ok = (p: unknown): Pack => {
  const r = validatePack(p);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.pack;
};

const base = { schemaVersion: 3, id: 'v3', name: 'V3', version: '1' };
const withTables = (...tables: unknown[]) => ({ ...base, tables });
const person = (slot: string, entries: string[], extra = {}) => ({
  id: `p.${slot}`,
  name: slot,
  category: 'person',
  slot,
  entries: entries.map((text) => ({ text })),
  ...extra,
});

describe('pack schema v3', () => {
  it('v1 and v2 packs normalize to v3 without tags', () => {
    const v1 = ok({
      schemaVersion: 1,
      id: 'old',
      name: 'Old',
      version: '1',
      tables: [{ id: 't', name: 'T', category: 'domain', entries: [{ text: 'x' }] }],
    });
    expect(v1.schemaVersion).toBe(3);
    expect(v1.tables[0]).not.toHaveProperty('tags');
    expect(ok(sample).schemaVersion).toBe(3);
  });

  it('v1 and v2 packs cannot use v3 categories, slots or tags', () => {
    const t = { id: 'q', name: 'Q', category: 'question', entries: [{ text: 'Why?' }] };
    expect(errors({ ...base, schemaVersion: 2, tables: [t] })).toEqual([
      'tables[0].category: question tables need schemaVersion 3',
    ]);
    const tagged = {
      id: 'd',
      name: 'D',
      category: 'domain',
      tags: ['g'],
      entries: [{ text: 'x' }],
    };
    expect(errors({ ...base, schemaVersion: 1, tables: [tagged] })).toEqual([
      'tables[0].tags: tags need schemaVersion 3',
    ]);
  });

  it('accepts question and person tables, and tags on list and word-pair tables', () => {
    const p = ok(
      withTables(
        { id: 'q', name: 'Q', category: 'question', tags: ['g'], entries: [{ text: 'Who?' }] },
        person('name', ['Ada']),
        person('role', ['a smith']),
        person('want', ['to be free']),
        {
          id: 'wp',
          name: 'WP',
          category: 'wordPair',
          tags: ['g', 'h'],
          action: [{ text: 'a' }],
          subject: [{ text: 'b' }],
        },
      ),
    );
    expect(p.tables.map((t) => t.category)).toEqual([
      'question',
      'person',
      'person',
      'person',
      'wordPair',
    ]);
  });

  it('person tables need a slot, and only person tables may have one', () => {
    const { slot: _, ...noSlot } = person('name', ['Ada']);
    expect(errors(withTables(noSlot))).toEqual(['tables[0].slot: person tables need a slot']);
    expect(
      errors(
        withTables({
          id: 'd',
          name: 'D',
          category: 'domain',
          slot: 'name',
          entries: [{ text: 'x' }],
        }),
      ),
    ).toEqual(['tables[0].slot: only person tables have a slot']);
  });

  it('entry rules: wants start with "to ", names ≤ 40, questions end with "?" and ≤ 140', () => {
    expect(errors(withTables(person('want', ['to rest', 'revenge'])))).toEqual([
      'tables[0].entries[1].text: a want starts with "to "',
    ]);
    expect(errors(withTables(person('want', [`to ${'x'.repeat(118)}`])))).toEqual([
      'tables[0].entries[0].text: at most 120 characters',
    ]);
    expect(errors(withTables(person('name', ['n'.repeat(41)])))).toEqual([
      'tables[0].entries[0].text: at most 40 characters',
    ]);
    const q = (text: string) => ({ id: 'q', name: 'Q', category: 'question', entries: [{ text }] });
    expect(errors(withTables(q('Who knew')))).toEqual([
      'tables[0].entries[0].text: a question ends with "?"',
    ]);
    expect(errors(withTables(q(`${'w'.repeat(140)}?`)))).toEqual([
      'tables[0].entries[0].text: at most 140 characters',
    ]);
  });

  it('tags: 1–4 valid, unique ids, never on generator tables', () => {
    const d = (tags: unknown) => ({
      id: 'd',
      name: 'D',
      category: 'domain',
      tags,
      entries: [{ text: 'x' }],
    });
    expect(errors(withTables(d(['a', 'a'])))).toEqual(['tables[0].tags[1]: duplicate tag "a"']);
    expect(errors(withTables(d([])))[0]).toMatch(/^tables\[0\]\.tags: /);
    expect(errors(withTables(d(['a', 'b', 'c', 'd', 'e'])))[0]).toMatch(/^tables\[0\]\.tags: /);
    expect(errors(withTables(d(['not ok'])))[0]).toMatch(/^tables\[0\]\.tags\[0\]: ids use/);
    expect(
      errors(
        withTables({
          id: 'g',
          name: 'G',
          category: 'generator',
          tags: ['a'],
          entries: [{ text: 'x' }],
        }),
      ),
    ).toContain('tables[0].tags: generator tables are never active, so they take no tags');
  });

  it('a tag matching no known group is a warning, not an error', () => {
    const p = ok(
      withTables({
        id: 'd',
        name: 'D',
        category: 'domain',
        tags: ['elsewhere'],
        entries: [{ text: 'x' }],
      }),
    );
    expect(packWarnings(p)).toEqual([
      { path: 'tables[0].tags', message: 'tag "elsewhere" matches no installed group' },
    ]);
    expect(packWarnings(p, ['elsewhere'])).toEqual([]);
  });
});

describe('toolkit packs', () => {
  const full = [myth, far, home];
  const now = [mythV1, farV1, homeV1];

  it('the three full toolkits validate as v3 without warnings, with the advertised contents', () => {
    for (const json of full) {
      const p = ok(json);
      expect(json.schemaVersion).toBe(3);
      expect(p.version).toBe('2.0.0');
      expect(packWarnings(p)).toEqual([]);
      const [group] = p.groups;
      expect(p.groups).toHaveLength(1);
      expect(p.seeds).toHaveLength(3);
      expect(p.generators).toHaveLength(1);
      const size = (cat: string, slot?: string) =>
        p.tables
          .filter((t) => t.category === cat && (!slot || ('slot' in t && t.slot === slot)))
          .map((t) =>
            t.category === 'wordPair' ? t.action.length + t.subject.length : t.entries.length,
          );
      expect(size('focus')).toEqual([30]);
      expect(size('domain')).toEqual([12]);
      expect(size('reversal')).toEqual([24]);
      expect(size('palette')).toEqual([20]);
      expect(size('wordPair')).toEqual([40]);
      expect(size('question')).toEqual([24]);
      expect(size('person', 'name')).toEqual([24]);
      expect(size('person', 'role')).toEqual([20]);
      expect(size('person', 'want')).toEqual([20]);
      expect(size('generator')).toEqual([8, 12, 8, 12]);
      for (const t of p.tables) {
        expect(t.id).toMatch(/^toolkit\.(myth|far|home)\./);
        if (t.category === 'generator') expect(t.tags).toBeUndefined();
        else expect(t.tags).toEqual([group!.id]);
      }
      for (const x of [...p.seeds, ...p.generators]) expect(x.group).toBe(group!.id);
    }
  });

  it('each import-now version is schema 1, version 1.0.0, and the full version minus v3 content', () => {
    full.forEach((json, i) => {
      const v1 = now[i]!;
      expect(v1.schemaVersion).toBe(1);
      expect(v1.version).toBe('1.0.0');
      expect(v1.id).toBe(json.id);
      ok(v1);
      const stripped = json.tables
        .filter((t) => !['question', 'person', 'generator'].includes(t.category))
        .map(({ tags: _, ...t }) => t);
      expect(v1.tables).toEqual(stripped);
    });
  });

  it('no id collides with the starter pack or another toolkit; full replaces import-now in place', () => {
    const packs = full.map(ok);
    for (const p of packs) {
      expect(collisions(p, [STARTER_PACK, ...packs])).toEqual([]);
      expect(collisions(p, [ok(now[packs.indexOf(p)])])).toEqual([]);
    }
    for (const p of now.map(ok)) expect(collisions(p, [STARTER_PACK, ...now.map(ok)])).toEqual([]);
  });
});
