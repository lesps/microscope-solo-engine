import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { autoCommand, setupGame, type Pick } from '../../../tests/support/autoplay';
import { Driver } from '../../../tests/support/driver';
import {
  checkInvariants,
  replay,
  undoableTail,
  type Command,
  type Mode,
  type ModedMechanic,
  type Settings,
} from '..';

const modeArb = fc.constantFrom<Mode>('off', 'prompt', 'enforce');
const mechanics: ModedMechanic[] = [
  'tone',
  'cohesion',
  'focus.source',
  'focus.sourcePhantom',
  'entryType',
  'placement',
  'legacy.evict',
  'legacy.explore',
  'scene.reversal',
];
const settingsArb = fc.record({
  modes: fc.tuple(...mechanics.map(() => modeArb)),
  drift: fc.constantFrom<Settings['drift']>('preference', 'random', 'counter-trend'),
  chaos: fc.boolean(),
  cap: fc.integer({ min: 1, max: 4 }),
  pip: fc.boolean(),
});

function seededPick(seed: number[]): Pick {
  let i = 0;
  return (n) => (n <= 1 ? 0 : (seed[i++ % seed.length]! >>> 0) % n);
}

/** Extra, out-of-band commands mixed into play to stress the reducer. */
function extra(d: Driver, k: number): Command | 'undo' | undefined {
  const g = d.state;
  const t = g.turn;
  switch (k % 8) {
    case 0:
      return {
        type: 'AskOracle',
        question: 'q?',
        odds: 1 + (k % 9),
        entryId: t?.entryId && g.entries[t.entryId]?.kind === 'scene' ? t.entryId : undefined,
      };
    case 1:
      return {
        type: 'DrawPrompt',
        kind: (['domain', 'wordPair', 'card', 'character'] as const)[k % 4]!,
      };
    case 2:
      return 'undo';
    case 3: {
      const locked = Object.values(g.entries).find(
        (e) => e.locked && !(e.kind === 'period' && e.bookend),
      );
      return locked
        ? {
            type: 'Retcon',
            targetId: locked.id,
            field: 'title',
            after: `retitled ${k}`,
            reason: 'test',
          }
        : undefined;
    }
    case 4: {
      const locked = Object.values(g.entries).find((e) => e.locked);
      return locked
        ? { type: 'ReviseProse', entryId: locked.id, prose: `revised ${k}` }
        : undefined;
    }
    case 5:
      return t?.entryId && g.entries[t.entryId]?.kind === 'scene'
        ? { type: 'DrawSpread', entryId: t.entryId }
        : undefined;
    case 6:
      return { type: 'CreateCharacter', name: `C${k}`, description: '' };
    default:
      return undefined;
  }
}

describe('property: invariants hold and replay is deterministic', () => {
  it('for random settings, seats and command sequences', () => {
    fc.assert(
      fc.property(
        settingsArb,
        fc.integer({ min: 0, max: 3 }),
        fc.constantFrom<'lens' | 'chronicle'>('lens', 'chronicle'),
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 20, maxLength: 60 }),
        (cfg, phantoms, ruleset, choices) => {
          const d = new Driver();
          setupGame(d, {
            ruleset,
            phantoms,
            settings: (s) => ({
              ...s,
              modes: Object.fromEntries(
                mechanics.map((m, i) => [m, cfg.modes[i]]),
              ) as Settings['modes'] & object,
              drift: cfg.drift,
              chaos: cfg.chaos,
              cohesionCap: cfg.cap,
              deck: { reversals: true, toneFromPip: cfg.pip },
            }),
          });
          const pick = seededPick(choices);
          for (let step = 0; step < 150; step++) {
            const k = choices[step % choices.length]!;
            const x = k % 5 === 0 ? extra(d, k >> 3) : undefined;
            if (x === 'undo') {
              const tail = undoableTail(d.state, d.events);
              if (tail) {
                d.events = d.events.slice(0, -tail.length);
                d.state = replay(d.events);
              }
            } else if (x) {
              d.try(x);
            } else {
              d.run(autoCommand(d.state, pick));
            }
            const violations = checkInvariants(d.state, d.events);
            if (violations.length) throw new Error(violations.join('; '));
            if (d.state.rounds.length >= 3 && d.state.rounds[2]!.ended) break;
          }
          expect(replay(d.events)).toEqual(d.state);
        },
      ),
      { numRuns: 150, seed: 20260927 },
    );
  });
});
