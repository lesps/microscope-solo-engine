import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { setupGame } from '../../../tests/support/autoplay';
import { readyForTurn, startPeriod, withModes } from '../../../tests/support/fixtures';
import { nextStep, toneFromRoll } from '..';

describe('StartRound and Focus', () => {
  it('player Lens seat writes the Focus (focus.source off)', () => {
    const d = new Driver();
    setupGame(d);
    expect(d.types(d.run({ type: 'StartRound' }))).toEqual(['RoundStarted']);
    expect(nextStep(d.state)).toBe('focus');
    expect(d.rejection({ type: 'RollFocus' }).code).toBe('wrong-phase');
    expect(d.rejection({ type: 'SetFocus' }).code).toBe('invalid');
    expect(d.rejection({ type: 'SetFocus', text: 'x'.repeat(81) }).code).toBe('invalid');
    d.run({ type: 'SetFocus', text: 'Trade' });
    expect(d.state.rounds[0]!.focus).toBe('Trade');
  });

  it('prompt mode rolls, then accepts or overrides with a logged OverrideUsed', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({ 'focus.source': 'prompt' }) });
    d.run({ type: 'StartRound' });
    expect(d.rejection({ type: 'SetFocus', text: 'mine' }).code).toBe('roll-required');
    d.run({ type: 'RollFocus' });
    expect(d.rejection({ type: 'RollFocus' }).code).toBe('already-rolled');
    const evs = d.run({ type: 'SetFocus', text: 'mine' });
    expect(d.types(evs)).toEqual(['OverrideUsed', 'FocusSet']);
    expect(d.state.stats.overrides).toBe(1);
  });

  it('enforce mode sets the rolled Focus immediately and forbids overrides', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({ 'focus.source': 'enforce' }) });
    const evs = d.run({ type: 'StartRound' });
    expect(d.types(evs)).toContain('FocusSet');
    expect(d.rejection({ type: 'SetFocus', text: 'mine' }).code).toBe('wrong-phase');
  });

  it('a phantom Lens seat always rolls its Focus under default settings', () => {
    const d = new Driver();
    setupGame(d); // default: one player, one phantom
    for (let n = 1; n <= 4; n++) {
      d.run({ type: 'StartRound' });
      const r = d.state.rounds[n - 1]!;
      const seat = d.state.seats.find((s) => s.id === r.lensSeatId)!;
      if (seat.kind === 'phantom') expect(r.focusSource).not.toBe('player');
      else d.run({ type: 'SetFocus', text: `f${n}` });
      expect(r.focus ?? d.state.rounds[n - 1]!.focus).toBeTruthy();
      // fast-forward the round
      d.run({ type: 'StartTurn' });
      if (!d.state.turn!.rolled.placement) d.run({ type: 'RollPlacement', kind: 'event' });
      d.run({
        type: 'CreateEntry',
        kind: 'event',
        title: `e${n}`,
        placement: d.state.turn!.rolled.placement!.placement,
      });
      d.run({ type: 'CommitTurn' });
      const coh = d.state.pendingRoundRolls.cohesion;
      if (coh) {
        d.run({ type: 'StartTurn' });
        d.run({ type: 'RollPlacement', kind: 'event' });
        d.run({
          type: 'CreateEntry',
          kind: 'event',
          title: `e${n}b`,
          placement: d.state.turn!.rolled.placement!.placement,
        });
        d.run({ type: 'CommitTurn' });
        if (d.state.pendingRoundRolls.cohesion) {
          const s = d.state.settings;
          d.run({
            type: 'ChangeSettings',
            settings: { ...s, modes: { ...s.modes, cohesion: 'off' } },
          });
        }
      }
      d.run({ type: 'AddLegacy', text: `L${n}` });
      if (!d.state.pendingRoundRolls.explore) d.run({ type: 'RollExplore' });
      d.run({ type: 'ExploreLegacy' });
      d.run({ type: 'RollPlacement', kind: 'event' });
      d.run({
        type: 'CreateEntry',
        kind: 'event',
        title: `x${n}`,
        placement: d.state.turn!.rolled.placement!.placement,
      });
      d.run({ type: 'CommitTurn' });
      d.run({ type: 'EndRound' });
      const s = d.state.settings;
      if (s.modes.cohesion === 'off')
        d.run({
          type: 'ChangeSettings',
          settings: { ...s, modes: { ...s.modes, cohesion: 'enforce' } },
        });
    }
    const phantomRounds = d.state.rounds.filter(
      (r) => d.state.seats.find((s) => s.id === r.lensSeatId)!.kind === 'phantom',
    );
    expect(phantomRounds.length).toBe(2);
    expect(phantomRounds.every((r) => r.focusSource !== 'player')).toBe(true);
  });
});

describe('Turn: tone', () => {
  it.each([
    [1, 5, 'light'],
    [5, 5, 'light'],
    [6, 5, 'dark'],
    [10, 9, 'dark'],
    [9, 9, 'light'],
    [1, 1, 'light'],
    [2, 1, 'dark'],
  ] as const)('d10=%i vs Mood %i is %s', (roll, mood, tone) => {
    expect(toneFromRoll(roll, mood)).toBe(tone);
  });

  it('StartTurn rolls tone (enforce) and rejects a different tone', () => {
    const d = readyForTurn();
    const evs = d.run({ type: 'StartTurn' });
    expect(d.types(evs)).toEqual(['TurnStarted', 'RollMade']);
    const rolled = d.state.turn!.rolled.tone!;
    d.run({ type: 'RollPlacement', kind: 'event' });
    const placement = d.state.turn!.rolled.placement!.placement;
    const other = rolled === 'light' ? 'dark' : 'light';
    expect(
      d.rejection({ type: 'CreateEntry', kind: 'event', title: 'x', tone: other, placement }).code,
    ).toBe('enforced');
    d.run({ type: 'CreateEntry', kind: 'event', title: 'x', placement });
    expect(d.state.entries[d.state.turn!.entryId!]!.tone).toBe(rolled);
  });

  it('tone off requires a player choice', () => {
    const d = readyForTurn(withModes({ tone: 'off', placement: 'off' }));
    expect(d.types(d.run({ type: 'StartTurn' }))).toEqual(['TurnStarted']);
    const placement = { parentId: startPeriod(d).id, index: 0 };
    expect(d.rejection({ type: 'CreateEntry', kind: 'event', title: 'x', placement }).code).toBe(
      'invalid',
    );
    d.run({ type: 'CreateEntry', kind: 'event', title: 'x', tone: 'dark', placement });
  });

  it('tone from pip compares the pip value to Mood', () => {
    const d = readyForTurn(withModes({}, { deck: { reversals: true, toneFromPip: true } }));
    const evs = d.run({ type: 'StartTurn' });
    const card = evs.find((e) => e.type === 'CardDrawn');
    expect(card).toBeDefined();
    if (card?.type === 'CardDrawn') {
      const c = d.env.content.decks['test-deck']!.cards.find((x) => x.id === card.payload.cardId)!;
      if (c.arcana === 'minor' && typeof c.rank === 'number') {
        expect(d.state.turn!.rolled.tone).toBe(c.rank <= d.state.dials.mood ? 'light' : 'dark');
        expect(evs.filter((e) => e.type === 'RollMade')).toHaveLength(0);
      } else {
        expect(evs.some((e) => e.type === 'RollMade' && e.payload.purpose === 'tone')).toBe(true);
      }
    }
  });
});

describe('Turn: entry type', () => {
  it('rolls with weights when on; enforce rejects another kind', () => {
    const d = readyForTurn(withModes({ entryType: 'enforce' }));
    d.run({ type: 'StartTurn' });
    const kind = d.state.turn!.rolled.entryType!;
    expect(['period', 'event', 'scene']).toContain(kind);
    const other = kind === 'event' ? 'period' : 'event';
    expect(d.rejection({ type: 'RollPlacement', kind: other }).code).toBe('enforced');
  });
  it('prompt logs an override', () => {
    const d = readyForTurn(withModes({ entryType: 'prompt' }));
    d.run({ type: 'StartTurn' });
    const kind = d.state.turn!.rolled.entryType!;
    const other = kind === 'event' ? 'period' : 'event';
    expect(d.types(d.run({ type: 'RollPlacement', kind: other }))).toEqual([
      'OverrideUsed',
      'RollMade',
    ]);
  });
  it('uses seat weights when a seat defines them', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({ entryType: 'enforce' }) });
    const seat = { ...d.state.seats[0]!, entryTypeWeights: { period: 0, event: 0, scene: 1 } };
    d.run({ type: 'ConfigureSeats', seats: [seat, d.state.seats[1]!] });
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'f' });
    d.run({ type: 'StartTurn' });
    expect(d.state.turn!.rolled.entryType).toBe('scene');
  });
  it('never rolls a kind with no legal slot', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({ entryType: 'enforce' }), phantoms: 0 }); // no Events yet
    const seat = { ...d.state.seats[0]!, entryTypeWeights: { period: 0, event: 0, scene: 1 } };
    d.run({ type: 'ConfigureSeats', seats: [seat] });
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'f' });
    d.run({ type: 'StartTurn' });
    expect(d.state.turn!.rolled.entryType).not.toBe('scene');
  });
});

describe('Turn: placement', () => {
  it('prompt: must roll first, may override with OverrideUsed, may not reroll', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    const sp = startPeriod(d);
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'event',
        title: 'x',
        placement: { parentId: sp.id, index: 0 },
      }).code,
    ).toBe('roll-required');
    d.run({ type: 'RollPlacement', kind: 'event' });
    expect(d.rejection({ type: 'RollPlacement', kind: 'event' }).code).toBe('already-rolled');
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'period',
        title: 'x',
        placement: { parentId: null, index: 1 },
      }).code,
    ).toBe('invalid');
    const rolled = d.state.turn!.rolled.placement!.placement;
    const other =
      rolled.parentId === sp.id && rolled.index === 0
        ? { parentId: sp.id, index: 1 }
        : { parentId: sp.id, index: 0 };
    const evs = d.run({ type: 'CreateEntry', kind: 'event', title: 'x', placement: other });
    expect(d.types(evs)).toEqual(['OverrideUsed', 'EntryCreated']);
  });
  it('rejects illegal slots', () => {
    const d = readyForTurn(withModes({ placement: 'off' }));
    d.run({ type: 'StartTurn' });
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'period',
        title: 'x',
        placement: { parentId: null, index: 0 },
      }).code,
    ).toBe('illegal-placement');
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'scene',
        title: 'x',
        placement: { parentId: startPeriod(d).id, index: 0 },
        scene: { question: 'q', form: 'played' },
      }).code,
    ).toBe('illegal-placement');
  });
});

describe('CommitTurn and cohesion', () => {
  const playTurn = (d: Driver) => {
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'event' });
    d.run({
      type: 'CreateEntry',
      kind: 'event',
      title: 't',
      placement: d.state.turn!.rolled.placement!.placement,
    });
    return d.run({ type: 'CommitTurn' });
  };
  it('locks the entry and rolls cohesion', () => {
    const d = readyForTurn();
    const evs = playTurn(d);
    expect(d.types(evs)).toEqual(['TurnCommitted', 'RollMade']);
    const e = d.state.entries[(evs[0] as { payload: { entryId: string } }).payload.entryId]!;
    expect(e.locked).toBe(true);
    const r = evs[1]!.type === 'RollMade' ? evs[1]!.payload : undefined;
    expect(r?.purpose).toBe('cohesion');
    expect(r?.value).toBe(r!.result <= d.state.dials.cohesion);
  });
  it('enforce: a pass forces another turn, a fail forces Legacies', () => {
    const d = readyForTurn();
    playTurn(d);
    const passed = d.state.pendingRoundRolls.cohesion;
    if (passed) expect(d.rejection({ type: 'AddLegacy', text: 'x' }).code).toBe('enforced');
    else expect(d.rejection({ type: 'StartTurn' }).code).toBe('enforced');
  });
  it('prompt: declining the roll is an override', () => {
    const d = readyForTurn(withModes({ cohesion: 'prompt' }));
    playTurn(d);
    const passed = d.state.pendingRoundRolls.cohesion;
    const evs = passed ? d.run({ type: 'AddLegacy', text: 'x' }) : d.run({ type: 'StartTurn' });
    expect(d.types(evs)[0]).toBe('OverrideUsed');
  });
  it('the turn cap ends the round’s turns', () => {
    const d = readyForTurn(withModes({ cohesion: 'off' }, { cohesionCap: 2 }));
    playTurn(d);
    playTurn(d);
    expect(nextStep(d.state)).toBe('add-legacy');
    expect(d.rejection({ type: 'StartTurn' }).code).toBe('cap-reached');
  });
  it('rejects committing without an entry', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    expect(d.rejection({ type: 'CommitTurn' }).code).toBe('wrong-phase');
  });
});
