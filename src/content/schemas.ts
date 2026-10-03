import { z } from 'zod';
import type { Card, Deck, Generator, Seed, StartupGroup, Table } from '../engine';

/** The version written. Versions 1 and 2 are still accepted and normalized to this. */
export const PACK_SCHEMA_VERSION = 3;

const text = z.string().trim().min(1, 'must not be empty').max(200, 'at most 200 characters');
const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'ids use letters, digits, dot, dash and underscore')
  .max(80);

export const tableEntrySchema = z
  .object({
    text,
    weight: z.number().int().positive().optional(),
    range: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  })
  .strict()
  .refine((e) => !e.range || e.range[0] <= e.range[1], {
    message: 'range must be [low, high]',
    path: ['range'],
  });

const tags = z.array(id).min(1, '1–4 tags').max(4, '1–4 tags').optional();

const listTable = z
  .object({
    id,
    name: text,
    category: z.enum(['domain', 'palette', 'reversal', 'focus', 'generator', 'question', 'person']),
    die: z.number().int().min(1).max(1000).optional(),
    entries: z.array(tableEntrySchema).min(1, 'a table needs entries'),
    slot: z.enum(['name', 'role', 'want']).optional(),
    tags,
  })
  .strict();

const wordPairTable = z
  .object({
    id,
    name: text,
    category: z.literal('wordPair'),
    die: z.number().int().min(1).max(1000).optional(),
    action: z.array(tableEntrySchema).min(1),
    subject: z.array(tableEntrySchema).min(1),
    tags,
  })
  .strict();

export const tableSchema = z.discriminatedUnion('category', [listTable, wordPairTable]);

const court = z.enum(['page', 'knight', 'queen', 'king']);
export const cardSchema = z
  .object({
    id,
    arcana: z.enum(['major', 'minor']),
    suit: z.string().min(1).optional(),
    rank: z.union([z.number().int().min(0).max(21), court]).optional(),
    name: text,
    upright: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^\S+(?: \S+)?$/, 'a keyword is one or two words'),
    reversed: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^\S+(?: \S+)?$/, 'a keyword is one or two words'),
    tier: z.enum(['grand', 'character', 'moment']),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.arcana === 'minor' && !c.suit)
      ctx.addIssue({ code: 'custom', path: ['suit'], message: 'minor cards need a suit' });
    if (c.arcana === 'minor' && c.rank === undefined)
      ctx.addIssue({ code: 'custom', path: ['rank'], message: 'minor cards need a rank' });
    const expected =
      c.arcana === 'major' ? 'grand' : typeof c.rank === 'number' ? 'moment' : 'character';
    if (c.tier !== expected)
      ctx.addIssue({ code: 'custom', path: ['tier'], message: `tier should be "${expected}"` });
  });

export const deckSchema = z
  .object({ id, name: text, cards: z.array(cardSchema).min(1) })
  .strict()
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.cards.forEach((c, i) => {
      if (seen.has(c.id))
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i, 'id'],
          message: `duplicate card id "${c.id}"`,
        });
      seen.add(c.id);
    });
  });

const short = (max: number) =>
  z.string().trim().min(1, 'must not be empty').max(max, `at most ${max} characters`);

export const groupSchema = z
  .object({ id, name: short(60), description: z.string().max(300).optional() })
  .strict();

const questionSchema = z
  .object({
    id,
    text: short(140),
    pick: z.enum(['one', 'two', 'oneOrTwo']).default('one'),
    allowCustom: z.boolean().default(true),
    options: z
      .array(z.object({ id, text: short(200) }).strict())
      .min(2, '2–8 options')
      .max(8, '2–8 options'),
  })
  .strict();

const bookendQuestionSchema = z
  .object({
    text: short(140),
    options: z
      .array(z.object({ id, text: short(200), title: short(60).optional() }).strict())
      .min(2, '2–6 options')
      .max(6, '2–6 options'),
  })
  .strict();

const paletteList = z.array(short(60)).max(6, 'at most 6 items').default([]);

export const seedSchema = z
  .object({
    id,
    title: short(60),
    group: id.optional(),
    ruleset: z.enum(['lens', 'chronicle', 'any']).default('lens'),
    pitch: short(800),
    bigPicture: short(200).optional(),
    subject: z
      .object({
        name: short(60),
        description: short(200),
        traits: z.array(short(60)).min(3, '3–5 traits').max(5, '3–5 traits'),
      })
      .strict()
      .optional(),
    questions: z.array(questionSchema).max(6, 'at most 6 questions').default([]),
    startBookend: bookendQuestionSchema,
    endBookend: bookendQuestionSchema,
    palette: z.object({ yes: paletteList, no: paletteList }).strict().optional(),
    note: short(600).optional(),
  })
  .strict();

export const generatorSchema = z
  .object({
    id,
    name: short(60),
    group: id.optional(),
    description: z.string().max(300).optional(),
    parts: z
      .array(z.object({ id, label: short(40), tableId: id }).strict())
      .min(2, '2–6 parts')
      .max(6, '2–6 parts'),
    template: short(200),
    swap: z.tuple([id, id]).optional(),
  })
  .strict();

type Ctx = z.RefinementCtx;
type Path = (string | number)[];

function uniqueIds(ctx: Ctx, items: { id: string }[], path: Path, kind: string) {
  const seen = new Set<string>();
  items.forEach((x, i) => {
    if (seen.has(x.id))
      ctx.addIssue({
        code: 'custom',
        path: [...path, i, 'id'],
        message: `duplicate ${kind} id "${x.id}"`,
      });
    seen.add(x.id);
  });
}

const PLACEHOLDER = /\{([^{}]*)\}/g;

const ENTRY_RULES: Record<string, { max: number; test?: (t: string) => boolean; rule?: string }> = {
  question: { max: 140, test: (t) => t.endsWith('?'), rule: 'a question ends with "?"' },
  name: { max: 40 },
  want: { max: 120, test: (t) => t.startsWith('to '), rule: 'a want starts with "to "' },
};

function tableRules(ctx: Ctx, version: number, t: z.infer<typeof tableSchema>, path: Path) {
  const issue = (at: Path, message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, ...at], message });
  if (version < 3) {
    if (t.category === 'question' || t.category === 'person')
      issue(['category'], `${t.category} tables need schemaVersion 3`);
    if ('slot' in t && t.slot !== undefined) issue(['slot'], 'slots need schemaVersion 3');
    if (t.tags) issue(['tags'], 'tags need schemaVersion 3');
  }
  if (t.tags) {
    if (t.category === 'generator')
      issue(['tags'], 'generator tables are never active, so they take no tags');
    t.tags.forEach((tag, j) => {
      if (t.tags!.indexOf(tag) !== j) issue(['tags', j], `duplicate tag "${tag}"`);
    });
  }
  if (t.category === 'wordPair') return;
  if (t.category === 'person' && !t.slot) issue(['slot'], 'person tables need a slot');
  if (t.category !== 'person' && t.slot) issue(['slot'], 'only person tables have a slot');
  const rules =
    t.category === 'question'
      ? ENTRY_RULES.question
      : t.category === 'person' && t.slot
        ? ENTRY_RULES[t.slot]
        : undefined;
  if (!rules) return;
  t.entries.forEach((e, j) => {
    if (e.text.length > rules.max) issue(['entries', j, 'text'], `at most ${rules.max} characters`);
    else if (rules.test && !rules.test(e.text)) issue(['entries', j, 'text'], rules.rule!);
  });
}

export const packSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(PACK_SCHEMA_VERSION)]),
    id,
    name: text,
    version: z.string().min(1).max(20),
    description: z.string().max(500).optional(),
    author: z.string().max(100).optional(),
    license: z.string().max(200).optional(),
    tables: z.array(tableSchema).default([]),
    decks: z.array(deckSchema).default([]),
    groups: z.array(groupSchema).optional(),
    seeds: z.array(seedSchema).optional(),
    generators: z.array(generatorSchema).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    p.tables.forEach((t, i) => {
      if (ids.has(t.id))
        ctx.addIssue({
          code: 'custom',
          path: ['tables', i, 'id'],
          message: `duplicate table id "${t.id}"`,
        });
      ids.add(t.id);
      tableRules(ctx, p.schemaVersion, t, ['tables', i]);
      type Entry = z.infer<typeof tableEntrySchema>;
      const lists: Record<string, Entry[]> =
        t.category === 'wordPair'
          ? { action: t.action, subject: t.subject }
          : { entries: t.entries };
      for (const [key, entries] of Object.entries(lists)) {
        const ranged = entries.filter((e) => e.range).length;
        if (ranged && ranged !== entries.length) {
          ctx.addIssue({
            code: 'custom',
            path: ['tables', i, key],
            message: 'either every entry has a range or none does',
          });
        }
        if (ranged && ranged === entries.length) {
          if (t.die === undefined) {
            ctx.addIssue({
              code: 'custom',
              path: ['tables', i, 'die'],
              message: 'ranged tables need a die',
            });
            continue;
          }
          const hits = new Array(t.die + 1).fill(0);
          entries.forEach((e, j) => {
            const [lo, hi] = e.range!;
            if (hi > t.die!)
              ctx.addIssue({
                code: 'custom',
                path: ['tables', i, key, j, 'range'],
                message: `range exceeds d${t.die}`,
              });
            for (let v = lo; v <= Math.min(hi, t.die!); v++) hits[v]++;
          });
          for (let v = 1; v <= t.die; v++) {
            if (hits[v] !== 1) {
              ctx.addIssue({
                code: 'custom',
                path: ['tables', i, key],
                message: hits[v]
                  ? `result ${v} is covered ${hits[v]} times`
                  : `result ${v} is not covered`,
              });
              break;
            }
          }
        }
      }
    });
    const deckIds = new Set<string>();
    p.decks.forEach((d, i) => {
      if (deckIds.has(d.id))
        ctx.addIssue({
          code: 'custom',
          path: ['decks', i, 'id'],
          message: `duplicate deck id "${d.id}"`,
        });
      deckIds.add(d.id);
    });

    if (p.schemaVersion === 1) {
      for (const key of ['groups', 'seeds', 'generators'] as const) {
        if (p[key] !== undefined)
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} need schemaVersion 2` });
      }
    }
    const groups = p.groups ?? [];
    const seeds = p.seeds ?? [];
    const generators = p.generators ?? [];
    if (!p.tables.length && !p.decks.length && !seeds.length && !generators.length) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'a pack needs at least one table, deck, seed or generator',
      });
    }
    uniqueIds(ctx, groups, ['groups'], 'group');
    uniqueIds(ctx, seeds, ['seeds'], 'seed');
    uniqueIds(ctx, generators, ['generators'], 'generator');
    const groupIds = new Set(groups.map((g) => g.id));
    const unknownGroup = (group: string | undefined, path: Path) => {
      if (group !== undefined && !groupIds.has(group))
        ctx.addIssue({ code: 'custom', path, message: `unknown group "${group}"` });
    };

    seeds.forEach((s, i) => {
      unknownGroup(s.group, ['seeds', i, 'group']);
      if (s.ruleset === 'chronicle' && !s.subject)
        ctx.addIssue({
          code: 'custom',
          path: ['seeds', i, 'subject'],
          message: 'a chronicle seed needs a subject',
        });
      if (s.ruleset === 'lens' && s.subject)
        ctx.addIssue({
          code: 'custom',
          path: ['seeds', i, 'subject'],
          message: 'only chronicle seeds have a subject',
        });
      uniqueIds(ctx, s.questions, ['seeds', i, 'questions'], 'question');
      s.questions.forEach((q, j) => {
        uniqueIds(ctx, q.options, ['seeds', i, 'questions', j, 'options'], 'option');
        if (q.pick === 'two' && q.options.length < 3)
          ctx.addIssue({
            code: 'custom',
            path: ['seeds', i, 'questions', j, 'pick'],
            message: 'pick "two" needs at least 3 options',
          });
      });
      uniqueIds(ctx, s.startBookend.options, ['seeds', i, 'startBookend', 'options'], 'option');
      uniqueIds(ctx, s.endBookend.options, ['seeds', i, 'endBookend', 'options'], 'option');
    });

    const tablesById = new Map(p.tables.map((t) => [t.id, t]));
    generators.forEach((g, i) => {
      unknownGroup(g.group, ['generators', i, 'group']);
      uniqueIds(ctx, g.parts, ['generators', i, 'parts'], 'part');
      const partIds = new Set(g.parts.map((x) => x.id));
      g.parts.forEach((part, j) => {
        const t = tablesById.get(part.tableId);
        const path = ['generators', i, 'parts', j, 'tableId'];
        if (!t)
          ctx.addIssue({
            code: 'custom',
            path,
            message: `no generator table "${part.tableId}" in this pack`,
          });
        else if (t.category !== 'generator')
          ctx.addIssue({
            code: 'custom',
            path,
            message: `table "${t.id}" is not a generator table`,
          });
      });
      const used = [...g.template.matchAll(PLACEHOLDER)].map((m) => m[1]!);
      for (const u of new Set(used)) {
        if (!partIds.has(u))
          ctx.addIssue({
            code: 'custom',
            path: ['generators', i, 'template'],
            message: `"{${u}}" is not a part`,
          });
      }
      for (const part of partIds) {
        if (used.filter((u) => u === part).length !== 1)
          ctx.addIssue({
            code: 'custom',
            path: ['generators', i, 'template'],
            message: `part "${part}" must appear exactly once`,
          });
      }
      if (g.swap) {
        const [a, b] = g.swap;
        for (const x of [a, b]) {
          if (!partIds.has(x))
            ctx.addIssue({
              code: 'custom',
              path: ['generators', i, 'swap'],
              message: `"${x}" is not a part`,
            });
        }
        if (a === b)
          ctx.addIssue({
            code: 'custom',
            path: ['generators', i, 'swap'],
            message: 'swap names two different parts',
          });
      }
    });
  })
  .transform((p) => ({
    ...p,
    schemaVersion: PACK_SCHEMA_VERSION,
    groups: p.groups ?? [],
    seeds: p.seeds ?? [],
    generators: p.generators ?? [],
  }));

export type Pack = z.output<typeof packSchema>;

export interface PackError {
  path: string;
  message: string;
}

export function formatPath(path: (string | number)[]): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p),
    '',
  );
}

export type PackValidation = { ok: true; pack: Pack } | { ok: false; errors: PackError[] };

/**
 * Problems that don't block installing a pack but are worth showing. `knownGroups` adds group ids
 * from other installed packs, which tags may refer to.
 */
export function packWarnings(pack: Pack, knownGroups: Iterable<string> = []): PackError[] {
  const used = new Set(pack.generators.flatMap((g) => g.parts.map((part) => part.tableId)));
  const groups = new Set([...pack.groups.map((g) => g.id), ...knownGroups]);
  return pack.tables.flatMap((t, i) => [
    ...(t.category === 'generator' && !used.has(t.id)
      ? [
          {
            path: `tables[${i}]`,
            message: `generator table "${t.id}" is not used by any generator`,
          },
        ]
      : []),
    ...(t.tags ?? [])
      .filter((tag) => !groups.has(tag))
      .map((tag) => ({
        path: `tables[${i}].tags`,
        message: `tag "${tag}" matches no installed group`,
      })),
  ]);
}

export function validatePack(input: unknown): PackValidation {
  const r = packSchema.safeParse(input);
  if (r.success) return { ok: true, pack: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({
      path: formatPath(i.path as (string | number)[]) || '(pack)',
      message: i.message,
    })),
  };
}

// Compile-time checks that schema output fits the engine's content types.
type Assert<T extends true> = T;
export type _TableFits = Assert<z.infer<typeof tableSchema> extends Table ? true : false>;
export type _CardFits = Assert<z.infer<typeof cardSchema> extends Card ? true : false>;
export type _DeckFits = Assert<z.infer<typeof deckSchema> extends Deck ? true : false>;
export type _GroupFits = Assert<z.output<typeof groupSchema> extends StartupGroup ? true : false>;
export type _SeedFits = Assert<z.output<typeof seedSchema> extends Seed ? true : false>;
export type _GeneratorFits = Assert<
  z.output<typeof generatorSchema> extends Generator ? true : false
>;

/** Brings a pack stored under schema 1 or 2 up to the current shape (the startup arrays default empty). */
export function normalizePack(
  pack: Pack | (Omit<Pack, 'groups' | 'seeds' | 'generators'> & Partial<Pack>),
): Pack {
  return {
    ...pack,
    schemaVersion: PACK_SCHEMA_VERSION,
    groups: pack.groups ?? [],
    seeds: pack.seeds ?? [],
    generators: pack.generators ?? [],
  } as Pack;
}
