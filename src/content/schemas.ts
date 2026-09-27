import { z } from 'zod';
import type { Card, Deck, Table } from '../engine';

export const PACK_SCHEMA_VERSION = 1;

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

const listTable = z
  .object({
    id,
    name: text,
    category: z.enum(['domain', 'palette', 'reversal', 'focus']),
    die: z.number().int().min(1).max(1000).optional(),
    entries: z.array(tableEntrySchema).min(1, 'a table needs entries'),
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

export const packSchema = z
  .object({
    schemaVersion: z.literal(PACK_SCHEMA_VERSION),
    id,
    name: text,
    version: z.string().min(1).max(20),
    description: z.string().max(500).optional(),
    author: z.string().max(100).optional(),
    license: z.string().max(200).optional(),
    tables: z.array(tableSchema).default([]),
    decks: z.array(deckSchema).default([]),
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
  });

export type Pack = z.infer<typeof packSchema>;

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
