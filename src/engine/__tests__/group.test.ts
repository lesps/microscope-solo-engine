import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { autoplay, cyclePick, setupGame } from '../../../tests/support/autoplay';
import { MAX_SEATS, checkInvariants, replay, type Seat } from '..';

const seat = (id: string, kind: Seat['kind']): Seat => ({
  id,
  name: id,
  kind,
  tables: [],
  placementBias: kind === 'player' ? 'uniform' : 'sparse',
});
const players = (n: number) => Array.from({ length: n }, (_, i) => seat(`p${i}`, 'player'));
const phantoms = (n: number) => Array.from({ length: n }, (_, i) => seat(`f${i}`, 'phantom'));

function created() {
  const d = new Driver();
  d.run({
    type: 'CreateGame',
    id: 'g',
    title: 'T',
    ruleset: 'lens',
    seed: '00112233445566778899aabbccddeeff',
  });
  return d;
}

describe('seat limits: Microscope’s maximum of four seats', () => {
  it('accepts 1–4 players with phantoms up to four seats in all', () => {
    for (const [p, f] of [
      [1, 0],
      [1, 3],
      [2, 2],
      [3, 1],
      [4, 0],
    ] as const) {
      const d = created();
      d.run({ type: 'ConfigureSeats', seats: [...players(p), ...phantoms(f)] });
      expect(d.state.seats).toHaveLength(p + f);
    }
    expect(MAX_SEATS).toBe(4);
  });

  it('rejects more than four seats, and a table with no player', () => {
    const d = created();
    for (const seats of [
      [...players(4), ...phantoms(1)],
      [...players(3), ...phantoms(2)],
      [...players(5)],
      [...players(1), ...phantoms(4)],
      [...phantoms(2)],
    ])
      expect(d.rejection({ type: 'ConfigureSeats', seats }).code).toBe('invalid');
  });
});

describe('a group game', () => {
  it('rotates turns and the Lens through every player and phantom', () => {
    const d = new Driver();
    setupGame(d, { players: 3, phantoms: 1 });
    expect(d.state.seats.map((s) => s.kind)).toEqual(['player', 'player', 'player', 'phantom']);
    autoplay(d, cyclePick([0, 1, 2]), { rounds: 4, maxSteps: 4000 });
    expect(d.state.rounds.slice(0, 4).map((r) => r.lensSeatId)).toEqual(
      d.state.seats.map((s) => s.id),
    );
    const turnSeats = new Set(
      d.events.flatMap((e) => (e.type === 'TurnStarted' ? [e.payload.seatId] : [])),
    );
    expect(turnSeats).toEqual(new Set(d.state.seats.map((s) => s.id)));
    expect(checkInvariants(d.state)).toEqual([]);
    expect(replay(d.events)).toEqual(d.state);
  });

  it('the Bookends belong to the first player, and the First Pass goes round every seat', () => {
    const d = new Driver();
    setupGame(d, { players: 2, phantoms: 1 });
    const first = d.state.seats[0]!.id;
    const bookends = Object.values(d.state.entries).filter((e) => e.kind === 'period' && e.bookend);
    expect(bookends.map((e) => e.seatId)).toEqual([first, first]);
    const fp = Object.values(d.state.entries).filter((e) => e.firstPass);
    expect(new Set(fp.map((e) => e.seatId))).toEqual(new Set(d.state.seats.map((s) => s.id)));
  });
});

describe('AskOracle askedBy', () => {
  it('records which seat asked', () => {
    const d = new Driver();
    setupGame(d, { players: 2 });
    const ben = d.state.seats[1]!.id;
    const evs = d.run({ type: 'AskOracle', question: 'Does it hold?', odds: 5, askedBy: ben });
    const asked = evs.find((e) => e.type === 'OracleAsked')!;
    expect(asked.type === 'OracleAsked' && asked.payload.call.askedBy).toBe(ben);
  });

  it('is optional, and must name a seat in the game', () => {
    const d = new Driver();
    setupGame(d, { players: 2 });
    const evs = d.run({ type: 'AskOracle', question: 'Q?', odds: 5 });
    const asked = evs.find((e) => e.type === 'OracleAsked')!;
    expect(asked.type === 'OracleAsked' && 'askedBy' in asked.payload.call).toBe(false);
    expect(
      d.rejection({ type: 'AskOracle', question: 'Q?', odds: 5, askedBy: 'nobody' }).code,
    ).toBe('not-found');
  });
});
