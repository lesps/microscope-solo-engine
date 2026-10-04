import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, type Command, type GameEvent } from '../engine';
import { autoplay, cyclePick, setupGame } from '../../tests/support/autoplay';
import { Driver } from '../../tests/support/driver';
import { withModes } from '../../tests/support/fixtures';
import { payloadSchemas } from './eventSchemas';

/** Plays games that together emit every event type the engine has. */
function everyEvent(): GameEvent[] {
  const all: GameEvent[] = [];
  // Startup events happen before the Bookends, so they get a game of their own.
  const pre = new Driver();
  pre.run({
    type: 'CreateGame',
    id: 'pre',
    title: 'T',
    ruleset: 'lens',
    seed: '00112233445566778899aabbccddeeff',
  });
  pre.run({
    type: 'ChangeSettings',
    settings: withModes({ 'seed.answers': 'prompt' })(pre.state.settings),
  });
  pre.run({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'q1' });
  pre.run({
    type: 'ApplySeed',
    seedId: 'seed-lens',
    answers: { q1: { optionIds: ['a'] }, q2: { optionIds: ['x', 'y'] }, q3: { custom: 'mine' } },
    start: { optionId: 's1' },
    end: { custom: { text: 'An ending.' } },
  });
  pre.run({ type: 'RenameGame', title: 'Renamed' });
  pre.run({ type: 'RollGenerator', generatorId: 'gen' });
  pre.run({ type: 'AcceptGeneratorReading', swapped: true });
  all.push(...pre.events);
  for (const ruleset of ['lens', 'chronicle'] as const) {
    const d = new Driver();
    setupGame(d, {
      ruleset,
      settings: withModes(
        { 'legacy.evict': 'prompt', 'scene.reversal': 'enforce', tone: 'prompt' },
        { chaos: true },
      ),
      phantoms: 2,
    });
    d.run({ type: 'RollPaletteItem' });
    d.run({ type: 'AssignPaletteRoll', list: 'yes' });
    d.run({ type: 'RemovePaletteItem', id: d.state.palette.yes[0]!.id });
    autoplay(d, cyclePick([3, 0, 2, 5, 1, 4]), { rounds: 8, maxSteps: 8000 });
    const extra: Command[] = [
      { type: 'CreateCharacter', name: 'Z', description: '' },
      { type: 'AskOracle', question: 'q', odds: 5 },
      ...Array.from({ length: 80 }, () => ({ type: 'DrawPrompt', kind: 'card' }) as Command),
      { type: 'Retcon', targetId: d.state.id, field: 'bigPicture', after: 'New.', reason: 'r' },
    ];
    for (const c of extra) d.try(c);
    const locked = Object.values(d.state.entries).find((e) => e.locked)!;
    d.run({ type: 'ReviseProse', entryId: locked.id, prose: 'revised' });
    all.push(...d.events);
  }
  return all;
}

describe('event payload schemas', () => {
  const events = everyEvent();

  it('the generated games cover every event type', () => {
    const seen = new Set(events.map((e) => e.type));
    expect(EVENT_TYPES.filter((t) => !seen.has(t))).toEqual([]);
  });

  it('every event the engine emits (after a JSON round trip) matches its schema', () => {
    const failures = JSON.parse(JSON.stringify(events))
      .map((e: GameEvent) => ({ e, r: payloadSchemas[e.type].safeParse(e.payload) }))
      .filter((x: { r: { success: boolean } }) => !x.r.success)
      .map(
        (x: { e: GameEvent; r: { error: { issues: { path: unknown[]; message: string }[] } } }) =>
          `${x.e.type}: ${x.r.error.issues[0]!.path.join('.')} ${x.r.error.issues[0]!.message}`,
      );
    expect(failures).toEqual([]);
  });

  it('every event type has a schema', () => {
    expect(Object.keys(payloadSchemas).sort()).toEqual([...EVENT_TYPES].sort());
  });
});
