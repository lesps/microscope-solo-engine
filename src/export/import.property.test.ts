import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validatePack } from '../content';
import { parseGameFile } from '.';
import { migrateEvents } from '../../tests/support/migrate';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../tests/fixtures');
const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'lens-3-rounds.json'), 'utf8'));
const runs = Number(process.env.FC_RUNS ?? 200);

describe('property: imports never crash', () => {
  it('parseGameFile returns a result, never throws, for arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const r = parseGameFile(v, migrateEvents);
        expect(typeof r.ok).toBe('boolean');
      }),
      { numRuns: runs },
    );
  });

  it('a corrupted real log (dropped, duplicated, swapped or mangled events) is rejected or replays cleanly', () => {
    const n = fixture.events.length;
    const op = fc.oneof(
      fc.record({ kind: fc.constant('drop' as const), i: fc.nat(n - 1) }),
      fc.record({ kind: fc.constant('dup' as const), i: fc.nat(n - 1) }),
      fc.record({ kind: fc.constant('swap' as const), i: fc.nat(n - 1), j: fc.nat(n - 1) }),
      fc.record({ kind: fc.constant('mangle' as const), i: fc.nat(n - 1), v: fc.jsonValue() }),
    );
    fc.assert(
      fc.property(fc.array(op, { minLength: 1, maxLength: 4 }), (ops) => {
        const f = structuredClone(fixture);
        for (const o of ops) {
          if (o.kind === 'drop') f.events.splice(o.i, 1);
          if (o.kind === 'dup') f.events.splice(o.i, 0, structuredClone(f.events[o.i]));
          if (o.kind === 'swap' && f.events[o.i] && f.events[o.j])
            [f.events[o.i], f.events[o.j]] = [f.events[o.j], f.events[o.i]];
          if (o.kind === 'mangle' && f.events[o.i]) f.events[o.i].payload = o.v;
        }
        const r = parseGameFile(f, migrateEvents);
        if (r.ok) expect(r.state.id).toBe(fixture.gameId);
        else expect(r.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: runs },
    );
  });

  it('a payload replaced by a non-object or an empty object is always rejected', () => {
    fc.assert(
      fc.property(
        fc.nat(fixture.events.length - 1),
        fc.constantFrom<unknown>(null, 5, 'x', [], {}, { text: 3 }),
        (i, v) => {
          const f = structuredClone(fixture);
          f.events[i].payload = v;
          const r = parseGameFile(f, migrateEvents);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.errors.some((e) => e.startsWith(`events.${i}.payload`))).toBe(true);
        },
      ),
      { numRuns: runs },
    );
  });

  it('validatePack returns errors, never throws, for arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const r = validatePack(v);
        if (!r.ok)
          expect(r.errors.every((e) => typeof e.path === 'string' && e.message)).toBe(true);
      }),
      { numRuns: runs },
    );
  });
});
