import { describe, expect, it } from 'vitest';
import { readyForTurn, withModes } from '../../../tests/support/fixtures';
import type { Driver } from '../../../tests/support/driver';
import { chaosDelta, counterTrendMoodDelta, nextStep, randomDelta, type Settings } from '..';

function toLegacyStep(d: Driver) {
  d.run({ type: 'StartTurn' });
  d.run({ type: 'RollPlacement', kind: 'event' });
  d.run({
    type: 'CreateEntry',
    kind: 'event',
    title: 't',
    placement: d.state.turn!.rolled.placement!.placement,
  });
  d.run({ type: 'CommitTurn' });
}
function finishRound(d: Driver, legacy = 'L') {
  d.run({ type: 'AddLegacy', text: legacy });
  if (d.state.settings.modes['legacy.explore'] === 'off')
    d.run({ type: 'ExploreLegacy', legacyId: d.state.legacies[0]!.id });
  else {
    d.run({ type: 'RollExplore' });
    d.run({ type: 'ExploreLegacy' });
  }
  d.run({ type: 'RollPlacement', kind: 'event' });
  d.run({
    type: 'CreateEntry',
    kind: 'event',
    title: 'x',
    placement: d.state.turn!.rolled.placement!.placement,
  });
  d.run({ type: 'CommitTurn' });
}
const noCohesion = (s: Settings) => withModes({ cohesion: 'off' })(s);

describe('Legacies', () => {
  it('adds a Legacy tagged with the Lens seat and round', () => {
    const d = readyForTurn(noCohesion);
    toLegacyStep(d);
    d.run({ type: 'AddLegacy', text: 'The old bridge' });
    expect(d.state.legacies[0]).toMatchObject({
      text: 'The old bridge',
      seatId: d.state.rounds[0]!.lensSeatId,
      addedInRound: 1,
    });
    expect(d.rejection({ type: 'AddLegacy', text: 'again' }).code).toBe('wrong-phase');
    expect(nextStep(d.state)).toBe('explore-legacy');
  });

  it('never exceeds 6; when full the player chooses the eviction (off)', () => {
    const d = readyForTurn(noCohesion);
    for (let i = 1; i <= 7; i++) {
      toLegacyStep(d);
      if (i === 7) {
        expect(d.rejection({ type: 'AddLegacy', text: `L${i}` }).code).toBe('invalid');
        const evictId = d.state.legacies[2]!.id;
        expect(d.types(d.run({ type: 'AddLegacy', text: `L${i}`, evictId }))).toEqual([
          'LegacyRemoved',
          'LegacyAdded',
        ]);
        expect(d.state.legacies.some((l) => l.id === evictId)).toBe(false);
      } else {
        finishRound(d, `L${i}`);
        d.run({ type: 'EndRound' });
        d.run({ type: 'StartRound' });
        if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'f' });
        continue;
      }
      expect(d.state.legacies).toHaveLength(6);
    }
  });

  it('rolled eviction (prompt) logs an override when the player picks another', () => {
    const d = readyForTurn(withModes({ cohesion: 'off', 'legacy.evict': 'prompt' }));
    for (let i = 1; i <= 6; i++) {
      toLegacyStep(d);
      finishRound(d, `L${i}`);
      d.run({ type: 'EndRound' });
      d.run({ type: 'StartRound' });
      if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'f' });
    }
    toLegacyStep(d);
    expect(d.rejection({ type: 'AddLegacy', text: 'L7' }).code).toBe('roll-required');
    d.run({ type: 'RollEvict' });
    const rolled = d.state.pendingRoundRolls.evict!;
    const other = d.state.legacies.find((l) => l.id !== rolled)!.id;
    expect(d.types(d.run({ type: 'AddLegacy', text: 'L7', evictId: other }))).toEqual([
      'OverrideUsed',
      'LegacyRemoved',
      'LegacyAdded',
    ]);
  });

  it('exploring by roll weights the exploring seat’s own Legacies 2:1', () => {
    const d = readyForTurn(noCohesion, 1);
    // Round 1 Lens seat is the player; the next turn seat explores.
    toLegacyStep(d);
    d.run({ type: 'AddLegacy', text: 'A' });
    const evs = d.run({ type: 'RollExplore' });
    const roll = evs[0]!;
    expect(roll.type === 'RollMade' && roll.payload.sides).toBe(
      d.state.legacies[0]!.seatId === d.state.seats[d.state.nextSeatIndex]!.id ? 2 : 1,
    );
  });

  it('legacy turn is exempt from the Focus and tied to the Legacy', () => {
    const d = readyForTurn(noCohesion);
    toLegacyStep(d);
    finishRound(d);
    const e = Object.values(d.state.entries).find((x) => x.legacyId)!;
    expect(e.focus).toBeUndefined();
    expect(e.legacyId).toBe(d.state.legacies[0]!.id);
    expect(nextStep(d.state)).toBe('adjust-dials');
  });

  it('legacy turns cannot add Periods', () => {
    const d = readyForTurn(noCohesion);
    toLegacyStep(d);
    d.run({ type: 'AddLegacy', text: 'A' });
    d.run({ type: 'RollExplore' });
    d.run({ type: 'ExploreLegacy' });
    expect(d.rejection({ type: 'RollPlacement', kind: 'period' }).code).toBe('invalid');
  });
});

describe('Dial drift', () => {
  it.each([
    [1, -1],
    [2, -1],
    [3, 0],
    [4, 0],
    [5, 1],
    [6, 1],
  ] as const)('random: d6=%i moves %i', (r, delta) => expect(randomDelta(r)).toBe(delta));

  it.each([
    [['light', 'light', 'dark'], -1],
    [['dark', 'dark', 'light'], 1],
    [['dark', 'light'], 0],
    [[], 0],
  ] as const)('counter-trend: tones %j move Mood %i', (tones, delta) => {
    expect(counterTrendMoodDelta([...tones])).toBe(delta);
  });

  it.each([
    [['dark', 'dark', 'light'], 1],
    [['light', 'light', 'dark'], -1],
    [['light', 'dark'], 0],
  ] as const)('chaos: tones %j move Chaos %i', (tones, delta) =>
    expect(chaosDelta([...tones])).toBe(delta),
  );

  it('preference drift applies the player’s ±1 and clamps to 1–9', () => {
    const d = readyForTurn(withModes({ cohesion: 'off' }, { drift: 'preference' }));
    toLegacyStep(d);
    finishRound(d);
    expect(d.rejection({ type: 'EndRound', mood: 2 as never }).code).toBe('invalid');
    const evs = d.run({ type: 'EndRound', mood: 1, cohesion: -1 });
    expect(d.types(evs)).toEqual(['DialsAdjusted', 'RoundEnded']);
    expect(d.state.dials).toMatchObject({ mood: 6, cohesion: 4 });
  });

  it('random drift rolls a d6 per dial', () => {
    const d = readyForTurn(withModes({ cohesion: 'off' }, { drift: 'random' }));
    toLegacyStep(d);
    finishRound(d);
    const evs = d.run({ type: 'EndRound' });
    expect(
      evs
        .filter((e) => e.type === 'RollMade')
        .map((e) => e.type === 'RollMade' && e.payload.purpose),
    ).toEqual(['drift.mood', 'drift.cohesion']);
  });

  it('counter-trend drift uses the round’s tones for Mood and a d6 for Cohesion; Chaos follows the majority', () => {
    const d = readyForTurn(withModes({ cohesion: 'off' }, { drift: 'counter-trend', chaos: true }));
    toLegacyStep(d);
    finishRound(d);
    const tones = Object.values(d.state.entries)
      .filter((e) => e.createdInRound === 1)
      .map((e) => e.tone);
    const before = { ...d.state.dials };
    const evs = d.run({ type: 'EndRound' });
    expect(evs.filter((e) => e.type === 'RollMade')).toHaveLength(1);
    expect(d.state.dials.mood).toBe(before.mood + counterTrendMoodDelta(tones));
    expect(d.state.dials.chaos).toBe(before.chaos! + chaosDelta(tones));
  });

  it('EndRound requires the Legacy to be explored', () => {
    const d = readyForTurn(noCohesion);
    toLegacyStep(d);
    expect(d.rejection({ type: 'EndRound' }).code).toBe('wrong-phase');
  });
});
