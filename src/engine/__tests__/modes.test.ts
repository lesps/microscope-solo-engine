import { describe, expect, it } from 'vitest';
import { readyForTurn, startPeriod, withModes } from '../../../tests/support/fixtures';
import type { Driver } from '../../../tests/support/driver';
import { slotKey, legalSlots } from '..';

// Covers the mode combinations not exercised elsewhere, so every mechanic has off / prompt / enforce behavior pinned.

function otherSlot(d: Driver, kind: 'event' | 'period') {
  const rolled = d.state.turn!.rolled.placement!.placement;
  return legalSlots(d.state, kind).find((s) => slotKey(s.placement) !== slotKey(rolled))!.placement;
}

function toLegacies(d: Driver, n: number) {
  for (let i = 1; i <= n; i++) {
    d.run({ type: 'StartTurn' });
    if (d.state.settings.modes.placement === 'off') {
      d.run({
        type: 'CreateEntry',
        kind: 'event',
        title: 't',
        placement: { parentId: startPeriod(d).id, index: 0 },
        tone: d.state.turn!.rolled.tone ?? 'light',
      });
    } else {
      d.run({ type: 'RollPlacement', kind: 'event' });
      d.run({
        type: 'CreateEntry',
        kind: 'event',
        title: 't',
        placement: d.state.turn!.rolled.placement!.placement,
      });
    }
    d.run({ type: 'CommitTurn' });
    if (i === n) return;
    d.run({
      type: 'AddLegacy',
      text: `L${i}`,
      evictId: d.state.legacies.length >= 6 ? d.state.legacies[0]!.id : undefined,
    });
    const m = d.state.settings.modes['legacy.explore'];
    if (m !== 'off') d.run({ type: 'RollExplore' });
    d.run({ type: 'ExploreLegacy', legacyId: m === 'off' ? d.state.legacies[0]!.id : undefined });
    d.run({ type: 'RollPlacement', kind: 'event' });
    d.run({
      type: 'CreateEntry',
      kind: 'event',
      title: 'x',
      placement: d.state.turn!.rolled.placement!.placement,
    });
    d.run({ type: 'CommitTurn' });
    d.run({ type: 'EndRound' });
    d.run({ type: 'StartRound' });
    if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'f' });
  }
}

describe('tone modes', () => {
  it('prompt: a different tone is allowed and logged', () => {
    const d = readyForTurn(withModes({ tone: 'prompt' }));
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'event' });
    const other = d.state.turn!.rolled.tone === 'light' ? 'dark' : 'light';
    const evs = d.run({
      type: 'CreateEntry',
      kind: 'event',
      title: 'x',
      tone: other,
      placement: d.state.turn!.rolled.placement!.placement,
    });
    expect(evs[0]).toMatchObject({
      type: 'OverrideUsed',
      payload: { mechanic: 'tone', chosen: other },
    });
  });
});

describe('placement modes', () => {
  it('enforce: another slot is rejected', () => {
    const d = readyForTurn(withModes({ placement: 'enforce' }));
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'event' });
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'event',
        title: 'x',
        placement: otherSlot(d, 'event'),
      }).code,
    ).toBe('enforced');
  });
  it('off: no roll is possible; any legal slot is accepted', () => {
    const d = readyForTurn(withModes({ placement: 'off' }));
    d.run({ type: 'StartTurn' });
    expect(d.rejection({ type: 'RollPlacement', kind: 'event' }).code).toBe('wrong-phase');
    const evs = d.run({
      type: 'CreateEntry',
      kind: 'period',
      title: 'x',
      placement: { parentId: null, index: 2 },
    });
    expect(d.types(evs)).toEqual(['EntryCreated']);
  });
});

describe('entry type off', () => {
  it('rolls nothing at turn start', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    expect(d.state.turn!.rolled.entryType).toBeUndefined();
  });
});

describe('legacy eviction and exploration modes', () => {
  it('evict enforce: the rolled Legacy leaves; choosing another is rejected', () => {
    const d = readyForTurn(withModes({ cohesion: 'off', 'legacy.evict': 'enforce' }));
    toLegacies(d, 7);
    expect(d.rejection({ type: 'RollExplore' }).code).toBe('wrong-phase');
    d.run({ type: 'RollEvict' });
    const rolled = d.state.pendingRoundRolls.evict!;
    const other = d.state.legacies.find((l) => l.id !== rolled)!.id;
    expect(d.rejection({ type: 'AddLegacy', text: 'L7', evictId: other }).code).toBe('enforced');
    d.run({ type: 'AddLegacy', text: 'L7' });
    expect(d.state.legacies.some((l) => l.id === rolled)).toBe(false);
    expect(d.state.legacies).toHaveLength(6);
  });

  it('explore off: the player picks, no roll allowed', () => {
    const d = readyForTurn(withModes({ cohesion: 'off', 'legacy.explore': 'off' }));
    toLegacies(d, 1);
    d.run({ type: 'AddLegacy', text: 'A' });
    expect(d.rejection({ type: 'RollExplore' }).code).toBe('wrong-phase');
    expect(d.rejection({ type: 'ExploreLegacy' }).code).toBe('invalid');
    d.run({ type: 'ExploreLegacy', legacyId: d.state.legacies[0]!.id });
  });

  it('explore enforce: must explore the rolled Legacy', () => {
    const d = readyForTurn(withModes({ cohesion: 'off', 'legacy.explore': 'enforce' }));
    toLegacies(d, 2);
    d.run({ type: 'AddLegacy', text: 'B' });
    d.run({ type: 'RollExplore' });
    const rolled = d.state.pendingRoundRolls.explore!;
    const other = d.state.legacies.find((l) => l.id !== rolled)!.id;
    expect(d.rejection({ type: 'ExploreLegacy', legacyId: other }).code).toBe('enforced');
  });

  it('explore prompt: another Legacy is an override', () => {
    const d = readyForTurn(withModes({ cohesion: 'off' }));
    toLegacies(d, 2);
    d.run({ type: 'AddLegacy', text: 'B' });
    d.run({ type: 'RollExplore' });
    const rolled = d.state.pendingRoundRolls.explore!;
    const other = d.state.legacies.find((l) => l.id !== rolled)!.id;
    expect(d.types(d.run({ type: 'ExploreLegacy', legacyId: other }))[0]).toBe('OverrideUsed');
  });
});

describe('scene reversal off', () => {
  it('cannot draw a reversal', () => {
    const d = readyForTurn(withModes({ 'scene.reversal': 'off' }));
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'scene' });
    d.run({
      type: 'CreateEntry',
      kind: 'scene',
      title: 's',
      placement: d.state.turn!.rolled.placement!.placement,
      scene: { question: 'q', form: 'played' },
    });
    expect(d.rejection({ type: 'DrawReversal', entryId: d.state.turn!.entryId! }).code).toBe(
      'wrong-phase',
    );
  });
});

describe('cohesion off', () => {
  it('rolls nothing on commit; the player decides', () => {
    const d = readyForTurn(withModes({ cohesion: 'off' }));
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'event' });
    d.run({
      type: 'CreateEntry',
      kind: 'event',
      title: 'x',
      placement: d.state.turn!.rolled.placement!.placement,
    });
    expect(d.types(d.run({ type: 'CommitTurn' }))).toEqual(['TurnCommitted']);
    expect(d.types(d.run({ type: 'StartTurn' }))[0]).toBe('TurnStarted');
  });
});
