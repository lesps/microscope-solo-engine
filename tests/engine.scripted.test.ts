import { describe, expect, it } from 'vitest';
import { checkInvariants, replay } from '../src/engine';
import { autoplay, cyclePick, setupGame } from './support/autoplay';
import { Driver } from './support/driver';

describe('scripted headless game', () => {
  it('plays 3 rounds and replays to an identical state', () => {
    const d = new Driver();
    setupGame(d);
    autoplay(d, cyclePick([1, 4, 2, 7, 3, 0, 5]), { rounds: 3 });
    expect(d.state.rounds).toHaveLength(3);
    expect(d.state.rounds.every((r) => r.ended)).toBe(true);
    expect(checkInvariants(d.state, d.events)).toEqual([]);
    expect(replay(d.events)).toEqual(d.state);
  });

  it('plays a Chronicle game with one phantom', () => {
    const d = new Driver();
    setupGame(d, { ruleset: 'chronicle' });
    autoplay(d, cyclePick([2, 5, 1, 3]), { rounds: 3 });
    expect(checkInvariants(d.state, d.events)).toEqual([]);
    expect(replay(d.events)).toEqual(d.state);
  });
});
