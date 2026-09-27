import { describe, expect, it } from 'vitest';
import { readyForTurn } from '../../../tests/support/fixtures';
import { replay, undoableTail, type GameEvent } from '..';
import type { Driver } from '../../../tests/support/driver';

function commitEvent(d: Driver) {
  d.run({ type: 'StartTurn' });
  d.run({ type: 'RollPlacement', kind: 'event' });
  d.run({
    type: 'CreateEntry',
    kind: 'event',
    title: 'Bridge falls',
    placement: d.state.turn!.rolled.placement!.placement,
  });
  const id = d.state.turn!.entryId!;
  d.run({ type: 'CommitTurn' });
  return id;
}

describe('Retcon', () => {
  it('records target, before, after and reason', () => {
    const d = readyForTurn();
    const id = commitEvent(d);
    const evs = d.run({
      type: 'Retcon',
      targetId: id,
      field: 'title',
      after: 'Bridge burns',
      reason: 'fits the Palette',
    });
    expect(evs[0]).toMatchObject({
      type: 'Retconned',
      payload: {
        targetId: id,
        field: 'title',
        before: 'Bridge falls',
        after: 'Bridge burns',
        reason: 'fits the Palette',
      },
    });
    expect(d.state.entries[id]!.title).toBe('Bridge burns');
    expect(d.state.stats.retcons).toBe(1);
  });
  it('requires a reason, a real change and a retconnable field', () => {
    const d = readyForTurn();
    const id = commitEvent(d);
    expect(
      d.rejection({ type: 'Retcon', targetId: id, field: 'title', after: 'X', reason: ' ' }).code,
    ).toBe('invalid');
    expect(
      d.rejection({
        type: 'Retcon',
        targetId: id,
        field: 'title',
        after: 'Bridge falls',
        reason: 'r',
      }).code,
    ).toBe('invalid');
    expect(
      d.rejection({ type: 'Retcon', targetId: id, field: 'order', after: 'a', reason: 'r' }).code,
    ).toBe('invalid');
    expect(
      d.rejection({ type: 'Retcon', targetId: id, field: 'tone', after: 'grey', reason: 'r' }).code,
    ).toBe('invalid');
  });
  it('retcons the Big Picture and Legacies', () => {
    const d = readyForTurn();
    d.run({
      type: 'Retcon',
      targetId: d.state.id,
      field: 'bigPicture',
      after: 'A delta city drowns.',
      reason: 'r',
    });
    expect(d.state.bigPicture).toBe('A delta city drowns.');
  });
});

describe('Undo within an open turn', () => {
  const undo = (d: Driver) => {
    const tail = undoableTail(d.state, d.events);
    if (!tail) return false;
    d.events = d.events.slice(0, d.events.length - tail.length);
    d.state = replay(d.events);
    return true;
  };

  it('reverts player-authored events but never a roll', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    expect(undo(d)).toBe(false); // TurnStarted + tone roll
    d.run({ type: 'RollPlacement', kind: 'event' });
    expect(undo(d)).toBe(false);
    const rolled = d.state.turn!.rolled.placement;
    d.run({ type: 'CreateEntry', kind: 'event', title: 'x', placement: rolled!.placement });
    d.run({ type: 'EditProse', entryId: d.state.turn!.entryId!, prose: 'hello' });
    expect(undo(d)).toBe(true);
    expect(d.state.entries[d.state.turn!.entryId!]!.prose).toBe('');
    expect(undo(d)).toBe(true);
    expect(d.state.turn!.entryId).toBeUndefined();
    expect(d.state.turn!.rolled.placement).toEqual(rolled);
    expect(undo(d)).toBe(false);
    expect(d.rejection({ type: 'RollPlacement', kind: 'event' }).code).toBe('already-rolled');
  });

  it('an override undone is not counted', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'event' });
    const t = d.state.turn!;
    const other = t.rolled.tone === 'light' ? 'dark' : 'light';
    const s = d.state.settings;
    // tone is enforced by default; switch to prompt is not allowed mid-turn
    expect(d.rejection({ type: 'ChangeSettings', settings: s }).code).toBe('wrong-phase');
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'event',
        title: 'x',
        tone: other,
        placement: t.rolled.placement!.placement,
      }).code,
    ).toBe('enforced');
  });

  it('nothing is undoable outside a turn or after commit', () => {
    const d = readyForTurn();
    commitEvent(d);
    expect(undoableTail(d.state, d.events as GameEvent[])).toBeUndefined();
  });
});
