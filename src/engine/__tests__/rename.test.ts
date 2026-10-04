import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { readyForTurn } from '../../../tests/support/fixtures';
import { replay } from '..';

describe('RenameGame', () => {
  it('emits GameRenamed with the trimmed title', () => {
    const d = new Driver();
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'Draft',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    const evs = d.run({ type: 'RenameGame', title: '  The Long Signal  ' });
    expect(d.types(evs)).toEqual(['GameRenamed']);
    expect(evs[0]!.payload).toEqual({ title: 'The Long Signal' });
    expect(d.state.title).toBe('The Long Signal');
    expect(replay(d.events)).toEqual(d.state);
  });

  it('works at any time, including mid-turn', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RenameGame', title: 'Renamed mid-turn' });
    expect(d.state.title).toBe('Renamed mid-turn');
  });

  it('rejects an empty or over-long title, and a game that does not exist', () => {
    const d = readyForTurn();
    expect(d.rejection({ type: 'RenameGame', title: '   ' }).code).toBe('invalid');
    expect(d.rejection({ type: 'RenameGame', title: 'x'.repeat(81) }).code).toBe('invalid');
    expect(new Driver().rejection({ type: 'RenameGame', title: 'T' }).code).toBe('no-game');
  });
});
