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
  'seed.answers',
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
/** Random startup commands during setup; rejections are expected and simply skipped. */
function startupCommands(d: Driver, choices: number[]) {
  const seeds = ['seed-lens', 'seed-chronicle', 'seed-any', 'seed-other'];
  const questions = ['q1', 'q2', 'q3', 'start', 'end'];
  for (const k of choices.slice(0, 8)) {
    const seedId = seeds[Math.floor(k / 4) % 4]!;
    const cmds: Command[] = [
      { type: 'RollSeedAnswer', seedId, questionId: questions[k % 5]! },
      {
        type: 'ApplySeed',
        seedId,
        answers:
          seedId === 'seed-lens'
            ? {
                q1: { optionIds: [k % 2 ? 'a' : 'b'] },
                q2: { optionIds: ['x', 'z'] },
                q3: { custom: `mine ${k}` },
              }
            : {},
        start: { optionId: seedId === 'seed-lens' ? 's1' : 's' },
        end: { optionId: seedId === 'seed-lens' ? 'e2' : 'e' },
      },
      { type: 'RollGenerator', generatorId: 'gen' },
      { type: 'AcceptGeneratorReading', swapped: k % 2 === 0 },
    ];
    d.try(cmds[k % cmds.length]!);
  }
}

function extra(d: Driver, k: number): Command | 'undo' | undefined {
  const g = d.state;
  const t = g.turn;
  switch (k % 8) {
    case 0:
      return {
        type: 'AskOracle',
        question: 'q?',
        odds: 1 + (k % 9),
        askedBy: g.seats[Math.floor(k / 8) % g.seats.length]?.id,
        entryId: t?.entryId && g.entries[t.entryId]?.kind === 'scene' ? t.entryId : undefined,
      };
    case 1:
      return {
        type: 'DrawPrompt',
        kind: (['domain', 'wordPair', 'card', 'character', 'question', 'person'] as const)[
          Math.floor(k / 8) % 6
        ]!,
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
    case 7:
      return { type: 'RenameGame', title: `Title ${k}` };
    default:
      return undefined;
  }
}

describe('property: invariants hold and replay is deterministic', () => {
  it('for random settings, seats and command sequences', { timeout: 600_000 }, () => {
    fc.assert(
      fc.property(
        settingsArb,
        // Solo and group tables: 1–4 players, phantoms filling up to four seats.
        fc.integer({ min: 1, max: 4 }).chain((players) =>
          fc.record({
            players: fc.constant(players),
            phantoms: fc.integer({ min: 0, max: 4 - players }),
          }),
        ),
        fc.constantFrom<'lens' | 'chronicle'>('lens', 'chronicle'),
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 20, maxLength: 60 }),
        (cfg, table, ruleset, choices) => {
          const d = new Driver();
          setupGame(d, {
            ruleset,
            ...table,
            settings: (s) => ({
              ...s,
              modes: {
                ...s.modes,
                ...(Object.fromEntries(mechanics.map((m, i) => [m, cfg.modes[i]])) as Partial<
                  Settings['modes']
                >),
              },
              drift: cfg.drift,
              chaos: cfg.chaos,
              cohesionCap: cfg.cap,
              deck: { reversals: true, toneFromPip: cfg.pip },
            }),
            beforeBookends: (g) => startupCommands(g, choices),
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
      // PRs run a fixed seed; the nightly job sets FC_RUNS higher and FC_RANDOM=1 to explore new inputs.
      // fast-check prints the seed and path of any failure so it can be replayed with FC_SEED.
      {
        numRuns: Number(process.env.FC_RUNS ?? 150),
        seed: process.env.FC_SEED
          ? Number(process.env.FC_SEED)
          : process.env.FC_RANDOM
            ? undefined
            : 20260927,
      },
    );
  });
});
