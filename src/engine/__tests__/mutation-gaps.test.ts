// Tests added from mutation-testing survivors: each pins behavior a mutant changed unnoticed.
import { describe, expect, it } from 'vitest';
import { Driver, testContent } from '../../../tests/support/driver';
import { setupGame } from '../../../tests/support/autoplay';
import { readyForTurn, startPeriod, withModes } from '../../../tests/support/fixtures';
import { clampDial, randomDelta, weightedSlots, type Content, type GameEvent } from '..';

const rolls = (evs: GameEvent[], purpose: string) =>
  evs.flatMap((e) => (e.type === 'RollMade' && e.payload.purpose === purpose ? [e.payload] : []));

function quickRound(d: Driver) {
  d.run({ type: 'StartRound' });
  if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'f' });
  d.run({ type: 'StartTurn' });
  d.run({ type: 'RollPlacement', kind: 'event' });
  d.run({
    type: 'CreateEntry',
    kind: 'event',
    title: 't',
    placement: d.state.turn!.rolled.placement!.placement,
  });
  d.run({ type: 'CommitTurn' });
  d.run({
    type: 'AddLegacy',
    text: 'L',
    evictId: d.state.legacies.length >= 6 ? d.state.legacies[0]!.id : undefined,
  });
  d.run({ type: 'RollExplore' });
  d.run({ type: 'ExploreLegacy' });
  d.run({ type: 'RollPlacement', kind: 'event' });
  d.run({
    type: 'CreateEntry',
    kind: 'event',
    title: 'x',
    placement: d.state.turn!.rolled.placement!.placement,
  });
  d.run({ type: 'CommitTurn' });
  return d.run({ type: 'EndRound', mood: 0, cohesion: 0 });
}

describe('rotation with three seats', () => {
  it('the Lens rotates once per round and turns continue across rounds', () => {
    const d = new Driver();
    setupGame(d, {
      phantoms: 2,
      settings: withModes({ cohesion: 'off', 'focus.sourcePhantom': 'off' }),
    });
    const ids = d.state.seats.map((s) => s.id);
    for (let i = 0; i < 4; i++) quickRound(d);
    expect(d.state.rounds.map((r) => ids.indexOf(r.lensSeatId))).toEqual([0, 1, 2, 0]);
    const turnSeats = d.state.rounds.flatMap((r) => r.turns.map((t) => ids.indexOf(t.seatId)));
    expect(turnSeats).toEqual([0, 1, 2, 0, 1, 2, 0, 1]);
  });
});

describe('drift arithmetic', () => {
  it('random drift adds each recorded d6 delta to the dial', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({ cohesion: 'off' }, { drift: 'random' }) });
    for (let i = 0; i < 6; i++) {
      const before = { ...d.state.dials };
      const evs = quickRound(d);
      const [m] = rolls(evs, 'drift.mood');
      const [c] = rolls(evs, 'drift.cohesion');
      expect(d.state.dials.mood).toBe(clampDial(before.mood + randomDelta(m!.result)));
      expect(d.state.dials.cohesion).toBe(clampDial(before.cohesion + randomDelta(c!.result)));
    }
  });

  it('counter-trend Cohesion adds its recorded d6 delta', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({ cohesion: 'off' }) });
    for (let i = 0; i < 6; i++) {
      const before = d.state.dials.cohesion;
      const [c] = rolls(quickRound(d), 'drift.cohesion');
      expect(d.state.dials.cohesion).toBe(clampDial(before + randomDelta(c!.result)));
    }
  });
});

describe('placement weights', () => {
  it('uniform, early, late and sparse weigh slots exactly as documented', () => {
    const d = readyForTurn();
    const g = d.state;
    // Event slots in timeline order: start Bookend has 1 Event (2 slots), first-pass Period 0 (1), end 0 (1).
    expect(weightedSlots(g, 'event', 'uniform').map((s) => s.weight)).toEqual([1, 1, 1, 1]);
    expect(weightedSlots(g, 'event', 'early').map((s) => s.weight)).toEqual([4, 3, 2, 1]);
    expect(weightedSlots(g, 'event', 'late').map((s) => s.weight)).toEqual([1, 2, 3, 4]);
    expect(weightedSlots(g, 'event', 'sparse').map((s) => s.weight)).toEqual([
      1260, 1260, 2520, 2520,
    ]);
    // Period slots: density is the Events in both neighbors.
    expect(weightedSlots(g, 'period', 'sparse').map((s) => s.weight)).toEqual([1260, 2520]);
  });

  it('a rolled slot follows the weights: a lone non-zero weight always wins', () => {
    const d = new Driver();
    setupGame(d, { phantoms: 0 });
    const seat = { ...d.state.seats[0]!, placementBias: 'early' as const };
    d.run({ type: 'ConfigureSeats', seats: [seat] });
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'f' });
    d.run({ type: 'StartTurn' });
    const evs = d.run({ type: 'RollPlacement', kind: 'period' });
    expect(evs[0]!.type === 'RollMade' && evs[0]!.payload.sides).toBe(2 + 1);
  });
});

describe('weights of zero are never rolled', () => {
  it('entry type with only one non-zero weight always rolls that kind', () => {
    const d = new Driver();
    setupGame(d, {
      settings: withModes(
        { entryType: 'enforce', cohesion: 'off' },
        { entryTypeWeights: { period: 0, event: 1, scene: 0 } },
      ),
    });
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'f' });
    const evs = d.run({ type: 'StartTurn' });
    const [r] = rolls(evs, 'entryType');
    expect(r).toMatchObject({ sides: 1, value: 'event' });
  });

  it('a Focus source with zero weight is skipped', () => {
    const d = new Driver();
    setupGame(d, {
      settings: withModes(
        { 'focus.source': 'enforce' },
        { focusSourceWeights: { legacy: 0, domain: 0, deck: 5 } },
      ),
    });
    const evs = d.run({ type: 'StartRound' });
    expect(rolls(evs, 'focus.source')[0]).toMatchObject({ sides: 5, text: 'deck' });
    expect(d.state.rounds[0]!.focusSource).toBe('deck');
  });
});

describe('table rolls', () => {
  it('ranges are ignored without a die; weights decide instead', () => {
    const content: Content = testContent();
    content.tables['t-domain'] = {
      id: 't-domain',
      name: 'Mixed',
      category: 'domain',
      entries: [
        { text: 'a', range: [1, 1], weight: 3 },
        { text: 'b', range: [2, 2] },
      ],
    };
    const d = new Driver({ ...new Driver().env, content });
    setupGame(d, { settings: (s) => ({ ...s, activeTables: ['t-domain'] }) });
    const evs = d.run({ type: 'DrawPrompt', kind: 'domain' });
    const r = evs[0]!.type === 'RollMade' ? evs[0]!.payload : undefined;
    expect(r!.sides).toBe(4);
    expect(r!.text).toBe(r!.result <= 3 ? 'a' : 'b');
  });

  it('with several tables, a d(N) picks the table first', () => {
    const d = new Driver();
    setupGame(d);
    const evs = d.run({ type: 'DrawPrompt', kind: 'domain' });
    expect(rolls(evs, 'table.pick')[0]).toMatchObject({ sides: 2 });
  });
});

describe('bookkeeping', () => {
  it('an oracle call records the seq of its OracleAsked event', () => {
    const d = new Driver();
    setupGame(d);
    const evs = d.run({ type: 'AskOracle', question: 'q', odds: 5 });
    const asked = evs.at(-1)!;
    expect(asked.type === 'OracleAsked' && asked.payload.call.seq).toBe(asked.seq);
  });

  it('switching Chaos on after setup starts the dial at 5; switching it on before setup does not', () => {
    const d = readyForTurn();
    const evs = d.run({ type: 'ChangeSettings', settings: { ...d.state.settings, chaos: true } });
    expect(evs.map((e) => e.type)).toEqual(['SettingsChanged', 'DialsSet']);
    expect(d.state.dials.chaos).toBe(5);
    expect(
      d.run({ type: 'ChangeSettings', settings: d.state.settings }).map((e) => e.type),
    ).toEqual(['SettingsChanged']);
    const e = new Driver();
    e.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    expect(
      e
        .run({ type: 'ChangeSettings', settings: { ...e.state.settings, chaos: true } })
        .map((x) => x.type),
    ).toEqual(['SettingsChanged']);
  });

  it('events carry the game id; GameCreated carries its own', () => {
    const d = readyForTurn();
    expect(d.events.every((e) => e.gameId === 'game1')).toBe(true);
  });

  it('prompts during the Legacy step draw from the next seat’s tables', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({ cohesion: 'off' }) });
    const phantom = { ...d.state.seats[1]!, tables: ['t-domain-d6'] };
    d.run({ type: 'ConfigureSeats', seats: [d.state.seats[0]!, phantom] });
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'f' });
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'event' });
    d.run({
      type: 'CreateEntry',
      kind: 'event',
      title: 't',
      placement: d.state.turn!.rolled.placement!.placement,
    });
    d.run({ type: 'CommitTurn' });
    d.run({ type: 'AddLegacy', text: 'L' });
    const evs = d.run({ type: 'DrawPrompt', kind: 'domain' });
    expect(evs[0]!.type === 'RollMade' && evs[0]!.payload.tableId).toBe('t-domain-d6');
    expect(startPeriod(d)).toBeDefined();
  });
});
