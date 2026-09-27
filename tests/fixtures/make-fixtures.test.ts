// Regenerates the recorded event-log fixtures. Run: UPDATE_FIXTURES=1 npx vitest run tests/fixtures/make-fixtures.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { toGameFile } from '../../src/export';
import { autoplay, cyclePick, setupGame } from '../support/autoplay';
import { Driver, makeEnv } from '../support/driver';
import { BUNDLED_PACKS, buildContent } from '../../src/content';

const dir = path.dirname(new URL(import.meta.url).pathname);

function record(name: string, ruleset: 'lens' | 'chronicle') {
  const d = new Driver();
  setupGame(d, { ruleset });
  autoplay(d, cyclePick([2, 7, 1, 8, 2, 8, 1, 8, 2, 8, 4, 5, 9]), { rounds: 3 });
  const locked = Object.values(d.state.entries).filter(
    (e) => e.locked && !(e.kind === 'period' && e.bookend),
  );
  d.run({
    type: 'ReviseProse',
    entryId: locked[0]!.id,
    prose: 'Revised after play: the water rose slowly, then all at once.',
  });
  d.run({
    type: 'Retcon',
    targetId: locked[1]!.id,
    field: 'title',
    after: `${locked[1]!.title} (retold)`,
    reason: 'Fits the Palette better.',
  });
  d.run({ type: 'AskOracle', question: 'Does anyone remember the founding?', odds: 4 });
  const file = toGameFile(d.state, d.events, '2026-09-27T00:00:00.000Z');
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(file, null, 1) + '\n');
}

/** A game started from the bundled sample seed, The Salt Road, played for two rounds. */
function recordSeedStart() {
  const d = new Driver(makeEnv(buildContent(BUNDLED_PACKS)));
  setupGame(d, {
    settings: (s) => ({ ...s, modes: { ...s.modes, 'seed.answers': 'prompt' } }),
    beforeBookends: (g) => {
      g.run({ type: 'RollSeedAnswer', seedId: 'salt-road', questionId: 'cause' });
      g.run({
        type: 'ApplySeed',
        seedId: 'salt-road',
        answers: {
          cause: { optionIds: ['dam'] },
          shores: { custom: 'Two guilds of salt-cutters who share a grandmother.' },
          salt: { optionIds: ['wealth', 'memory'] },
        },
        start: { optionId: 'ferry' },
        end: { optionId: 'long-city' },
      });
    },
  });
  autoplay(d, cyclePick([4, 1, 5, 9, 2, 6]), { rounds: 2 });
  const file = toGameFile(d.state, d.events, '2026-09-28T00:00:00.000Z');
  fs.writeFileSync(path.join(dir, 'lens-seed-start.json'), JSON.stringify(file, null, 1) + '\n');
}

it.skipIf(!process.env.UPDATE_FIXTURES)('regenerate fixtures', () => {
  record('lens-3-rounds', 'lens');
  record('chronicle-3-rounds', 'chronicle');
});

it.skipIf(!process.env.UPDATE_SEED_FIXTURE)('record the seed-start fixture', () => {
  recordSeedStart();
});
