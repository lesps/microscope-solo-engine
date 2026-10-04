import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { autoplay, cyclePick, setupGame } from '../../../tests/support/autoplay';
import { withModes } from '../../../tests/support/fixtures';
import {
  PHANTOM_PERSONAS,
  echoOptions,
  phantomSeat,
  replay,
  type GameEvent,
  type Inspiration,
  type Seat,
} from '..';

const purposes = (evs: GameEvent[]) =>
  evs.flatMap((e) => (e.type === 'RollMade' || e.type === 'CardDrawn' ? [e.payload.purpose] : []));

/** A solo game whose only phantom has the given inspiration, ready for round 1. */
function withPhantom(inspiration: Inspiration | undefined) {
  const d = new Driver();
  setupGame(d, {
    settings: withModes({ 'focus.source': 'off', 'focus.sourcePhantom': 'enforce' }),
    beforeBookends: (dd) => {
      const [you, phantom] = dd.state.seats;
      dd.run({
        type: 'ConfigureSeats',
        seats: [you!, { ...phantom!, inspiration }],
      });
    },
  });
  return d;
}

/** Play until it is the phantom's turn to start, and start it. */
function phantomTurn(d: Driver) {
  d.run({ type: 'StartRound' });
  if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'Trade' });
  while (d.state.seats[d.state.nextSeatIndex % d.state.seats.length]!.kind !== 'phantom') {
    autoplay(d, cyclePick([0, 1]), { rounds: 1, maxSteps: 400 });
    d.run({ type: 'StartRound' });
    if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'Trade' });
  }
  return d.run({ type: 'StartTurn' });
}

describe('phantom personas', () => {
  it('are the Reader (cards), the Gambler (dice) and the Archivist (echoes)', () => {
    expect(PHANTOM_PERSONAS.map((p) => [p.name, p.inspiration, p.placementBias])).toEqual([
      ['The Reader', 'cards', 'late'],
      ['The Gambler', 'dice', 'uniform'],
      ['The Archivist', 'echoes', 'sparse'],
    ]);
    expect(phantomSeat(1, 'x')).toEqual({
      id: 'x',
      name: 'The Gambler',
      kind: 'phantom',
      tables: [],
      placementBias: 'uniform',
      inspiration: 'dice',
    });
    expect(phantomSeat(3, 'y').name).toBe('Phantom 4');
  });

  it('a new game seats you and the Reader', () => {
    const d = new Driver();
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    expect(d.state.seats.map((s) => [s.name, s.kind, s.inspiration])).toEqual([
      ['You', 'player', undefined],
      ['The Reader', 'phantom', 'cards'],
    ]);
  });

  it('only phantom seats have an inspiration', () => {
    const d = new Driver();
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    const [you, reader] = d.state.seats as [Seat, Seat];
    expect(
      d.rejection({ type: 'ConfigureSeats', seats: [{ ...you, inspiration: 'dice' }, reader] })
        .code,
    ).toBe('invalid');
  });
});

describe('the inspiration draw when a phantom’s turn starts', () => {
  it('cards: draws a card into the turn’s prompts', () => {
    const d = withPhantom('cards');
    const evs = phantomTurn(d);
    expect(purposes(evs)).toContain('prompt.card');
    expect(d.state.turn!.prompts).toEqual([
      expect.objectContaining({ kind: 'card', text: expect.stringMatching(/: /) }),
    ]);
  });

  it('dice: rolls a word pair', () => {
    const d = withPhantom('dice');
    const evs = phantomTurn(d);
    expect(purposes(evs)).toEqual(
      expect.arrayContaining(['prompt.wordPair.action', 'prompt.wordPair']),
    );
    expect(d.state.turn!.prompts.map((p) => p.kind)).toEqual(['wordPair']);
  });

  it('dice with no word-pair tables: rolls a domain line instead', () => {
    const d = withPhantom('dice');
    d.run({
      type: 'ChangeSettings',
      settings: { ...d.state.settings, activeTables: ['t-domain'] },
    });
    phantomTurn(d);
    expect(d.state.turn!.prompts.map((p) => p.kind)).toEqual(['domain']);
  });

  it('dice picks among several domain tables first', () => {
    const d = withPhantom('dice');
    d.run({
      type: 'ChangeSettings',
      settings: { ...d.state.settings, activeTables: ['t-domain', 't-domain-d6'] },
    });
    const evs = phantomTurn(d);
    expect(purposes(evs)).toEqual(expect.arrayContaining(['table.pick', 'prompt.domain']));
  });

  it('cards with no deck: no draw', () => {
    const content = new Driver().env.content;
    const d = new Driver({ ...new Driver().env, content: { ...content, decks: {} } });
    setupGame(d, {
      settings: withModes({ 'focus.source': 'off', 'focus.sourcePhantom': 'off' }),
    });
    expect(d.state.seats[1]!.inspiration).toBe('cards');
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'Trade' });
    while (d.state.seats[d.state.nextSeatIndex % 2]!.kind !== 'phantom') {
      autoplay(d, cyclePick([0, 1]), { rounds: 1, maxSteps: 400 });
      d.run({ type: 'StartRound' });
      if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'Trade' });
    }
    d.run({ type: 'StartTurn' });
    expect(d.state.turn!.prompts).toEqual([]);
  });

  it('echoes: recalls something already in the history', () => {
    const d = withPhantom('echoes');
    phantomTurn(d);
    const [p] = d.state.turn!.prompts;
    expect(p!.kind).toBe('echo');
    const titles = Object.values(d.state.entries).map((e) => e.title);
    expect(titles.some((t) => p!.text.includes(t))).toBe(true);
  });

  it('no inspiration, or a player’s turn: no draw', () => {
    const d = withPhantom(undefined);
    phantomTurn(d);
    expect(d.state.turn!.prompts).toEqual([]);
    const e = withPhantom('cards');
    e.run({ type: 'StartRound' });
    e.run({ type: 'SetFocus', text: 'Trade' });
    e.run({ type: 'StartTurn' });
    expect(e.state.seats.find((s) => s.id === e.state.turn!.seatId)!.kind).toBe('player');
    expect(e.state.turn!.prompts).toEqual([]);
  });

  it('a draw with nothing to draw from is skipped, never blocking the turn', () => {
    const d = withPhantom('dice');
    d.run({ type: 'ChangeSettings', settings: { ...d.state.settings, activeTables: [] } });
    phantomTurn(d);
    expect(d.state.turn).toBeDefined();
    expect(d.state.turn!.prompts).toEqual([]);
  });

  it('replays without content', () => {
    const d = withPhantom('echoes');
    phantomTurn(d);
    expect(replay(d.events)).toEqual(d.state);
  });
});

describe('the Focus when a phantom holds the Lens', () => {
  function phantomLens(inspiration: Inspiration) {
    const d = withPhantom(inspiration);
    autoplay(d, cyclePick([0, 1]), { rounds: 1, maxSteps: 400 });
    const evs = d.run({ type: 'StartRound' });
    expect(d.state.seats.find((s) => s.id === d.state.rounds.at(-1)!.lensSeatId)!.kind).toBe(
      'phantom',
    );
    return { d, evs };
  }
  it('cards: from the deck', () => {
    const { d, evs } = phantomLens('cards');
    expect(purposes(evs)).not.toContain('focus.source');
    expect(d.state.rounds.at(-1)!.focusSource).toBe('deck');
  });
  it('dice: from the domain and Focus tables', () => {
    const { d } = phantomLens('dice');
    expect(d.state.rounds.at(-1)!.focusSource).toMatch(/^table:/);
  });
  it('echoes: from a Legacy when there is one', () => {
    const { d, evs } = phantomLens('echoes');
    expect(d.state.legacies.length).toBeGreaterThan(0);
    expect(purposes(evs)).not.toContain('focus.source');
    expect(d.state.rounds.at(-1)!.focusSource).toBe('legacy');
    expect(d.state.legacies.map((l) => l.text)).toContain(d.state.rounds.at(-1)!.focus);
  });
  it('echoes before any Legacy: an echo of the history', () => {
    const d = new Driver();
    setupGame(d, {
      settings: withModes({ 'focus.sourcePhantom': 'enforce' }),
      beforeBookends: (dd) => {
        const [you, phantom] = dd.state.seats;
        dd.run({ type: 'ConfigureSeats', seats: [{ ...phantom!, inspiration: 'echoes' }, you!] });
      },
    });
    d.run({ type: 'StartRound' });
    expect(d.state.rounds[0]!.focusSource).toBe('echo');
    expect(echoOptions(d.state)).toContain(d.state.rounds[0]!.focus);
  });
  it('falls back to the weighted source roll when its own source is empty', () => {
    const content = new Driver().env.content;
    const d = new Driver({ ...new Driver().env, content: { ...content, decks: {} } });
    setupGame(d, {
      settings: withModes({ 'focus.sourcePhantom': 'enforce' }),
      beforeBookends: (dd) => {
        const [you, phantom] = dd.state.seats;
        dd.run({ type: 'ConfigureSeats', seats: [phantom!, you!] });
      },
    });
    const evs = d.run({ type: 'StartRound' });
    expect(purposes(evs)).toContain('focus.source');
    expect(d.state.rounds[0]!.focusSource).not.toBe('deck');
  });
  it('its own source is used even when the game-wide weights give it zero', () => {
    const d = new Driver();
    setupGame(d, {
      settings: (s) =>
        withModes({ 'focus.sourcePhantom': 'enforce' })({
          ...s,
          focusSourceWeights: { legacy: 1, domain: 1, deck: 0 },
        }),
      beforeBookends: (dd) => {
        const [you, phantom] = dd.state.seats;
        dd.run({ type: 'ConfigureSeats', seats: [phantom!, you!] });
      },
    });
    d.run({ type: 'StartRound' });
    expect(d.state.rounds[0]!.focusSource).toBe('deck');
  });
});

describe('echoOptions', () => {
  it('lists locked entries, Legacies, characters and Yes items, never an open entry', () => {
    const d = withPhantom(undefined);
    autoplay(d, cyclePick([0, 1]), { rounds: 1, maxSteps: 400 });
    d.run({ type: 'CreateCharacter', name: 'Zed', description: '' });
    d.run({ type: 'StartRound' });
    if (!d.state.rounds.at(-1)!.focus) d.run({ type: 'SetFocus', text: 'Trade' });
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'event' });
    d.run({
      type: 'CreateEntry',
      kind: 'event',
      title: 'Still being written',
      placement: d.state.turn!.rolled.placement!.placement,
    });
    const options = echoOptions(d.state);
    expect(options).toContain('“Fishers settle the delta” (period)');
    expect(options).toContain(`Legacy: ${d.state.legacies[0]!.text}`);
    expect(options).toContain('Character: Zed');
    expect(options).toContain('Palette: bridges');
    expect(options.some((o) => o.includes('Still being written'))).toBe(false);
  });
});

describe('DrawPrompt echo', () => {
  it('recalls a locked entry, Legacy, character or Yes item', () => {
    const d = withPhantom(undefined);
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'Trade' });
    d.run({ type: 'StartTurn' });
    const evs = d.run({ type: 'DrawPrompt', kind: 'echo' });
    expect(purposes(evs)).toEqual(['prompt.echo']);
    expect(d.state.turn!.prompts[0]!.kind).toBe('echo');
  });
  it('is rejected before there is anything to echo', () => {
    const d = new Driver();
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    expect(d.rejection({ type: 'DrawPrompt', kind: 'echo' }).code).toBe('content-missing');
  });
});
