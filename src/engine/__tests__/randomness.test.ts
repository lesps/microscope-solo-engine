import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { setupGame } from '../../../tests/support/autoplay';
import { readyForTurn, withModes } from '../../../tests/support/fixtures';
import { checkInvariants, effectiveOdds, qualifierFor, resolveOracle } from '..';

describe('Oracle', () => {
  it.each([
    [5, undefined, 5],
    [5, 5, 5],
    [5, 9, 7],
    [5, 1, 3],
    [9, 9, 9],
    [1, 1, 1],
    [5, 6, 5],
    [5, 7, 6],
    [5, 4, 4],
  ])('odds %i with chaos %s → %i', (odds, chaos, eff) =>
    expect(effectiveOdds(odds, chaos)).toBe(eff),
  );

  it.each([
    [1, 'but'],
    [2, undefined],
    [5, undefined],
    [6, 'and'],
  ] as const)('qualifier d6=%i → %s', (r, q) => expect(qualifierFor(r)).toBe(q));

  it('d10 ≤ effective odds is yes', () => {
    expect(resolveOracle('q', 5, undefined, 5, undefined, 1).answer).toBe(true);
    expect(resolveOracle('q', 5, undefined, 6, undefined, 1).answer).toBe(false);
    expect(resolveOracle('q', 5, 9, 7, 6, 1)).toMatchObject({
      effectiveOdds: 7,
      answer: true,
      qualifier: 'and',
    });
  });

  it('stores question, odds and rolls; no qualifier roll when qualifiers are off', () => {
    const d = new Driver();
    setupGame(d, { settings: withModes({}, { oracle: { qualifiers: false } }) });
    const evs = d.run({ type: 'AskOracle', question: 'Rain?', odds: 3 });
    expect(d.types(evs)).toEqual(['RollMade', 'OracleAsked']);
    const call = evs[1]!.type === 'OracleAsked' ? evs[1]!.payload.call : undefined;
    const roll = evs[0]!.type === 'RollMade' ? evs[0]!.payload.result : 0;
    expect(call).toMatchObject({
      question: 'Rain?',
      odds: 3,
      effectiveOdds: 3,
      roll,
      answer: roll <= 3,
    });
  });

  it('rejects odds outside 1–9', () => {
    const d = new Driver();
    setupGame(d);
    expect(d.rejection({ type: 'AskOracle', question: 'q', odds: 10 }).code).toBe('invalid');
  });
});

describe('Deck', () => {
  it('never repeats a card before a reshuffle, and logs the reshuffle', () => {
    const d = new Driver();
    setupGame(d);
    for (let i = 0; i < 78 * 2 + 5; i++) d.run({ type: 'DrawPrompt', kind: 'card' });
    const reshuffles = d.events.filter((e) => e.type === 'DeckReshuffled');
    expect(reshuffles).toHaveLength(2);
    expect(checkInvariants(d.state, d.events)).toEqual([]);
    expect(d.state.deck!.remaining).toHaveLength(78 - 5);
  });
  it('reversals happen about half the time when on, never when off', () => {
    const d = new Driver();
    setupGame(d);
    for (let i = 0; i < 78; i++) d.run({ type: 'DrawPrompt', kind: 'card' });
    const rev = d.events.filter((e) => e.type === 'CardDrawn' && e.payload.reversed).length;
    expect(rev).toBeGreaterThan(20);
    expect(rev).toBeLessThan(58);
    const e = new Driver();
    setupGame(e, { settings: withModes({}, { deck: { reversals: false, toneFromPip: false } }) });
    for (let i = 0; i < 20; i++) e.run({ type: 'DrawPrompt', kind: 'card' });
    expect(e.events.some((x) => x.type === 'CardDrawn' && x.payload.reversed)).toBe(false);
  });
  it('character prompts draw court cards only', () => {
    const d = new Driver();
    setupGame(d);
    for (let i = 0; i < 20; i++) d.run({ type: 'DrawPrompt', kind: 'character' });
    const ids = d.events.flatMap((e) => (e.type === 'CardDrawn' ? [e.payload.cardId] : []));
    expect(ids.every((id) => /-(page|knight|queen|king)$/.test(id))).toBe(true);
  });
});

describe('Prompts and tables', () => {
  it('word pair rolls action and subject together', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    const evs = d.run({ type: 'DrawPrompt', kind: 'wordPair' });
    expect(evs).toHaveLength(2);
    expect(d.state.turn!.prompts[0]!.text).toMatch(/^act \d thing \d$/);
  });
  it('die-mapped tables use ranges', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-domain-d6'] }));
    d.run({ type: 'StartTurn' });
    const evs = d.run({ type: 'DrawPrompt', kind: 'domain' });
    const r = evs[0]!.type === 'RollMade' ? evs[0]!.payload : undefined;
    expect(r?.sides).toBe(6);
    expect(r?.text).toBe(r!.result <= 2 ? 'low' : r!.result <= 4 ? 'mid' : 'high');
  });
  it('rejects prompts with no active table', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: [] }));
    expect(d.rejection({ type: 'DrawPrompt', kind: 'domain' }).code).toBe('content-missing');
  });
  it('seats draw only from their own tables', () => {
    const d = new Driver();
    setupGame(d, { phantoms: 0 });
    const seat = { ...d.state.seats[0]!, tables: ['t-domain-d6'] };
    d.run({ type: 'ConfigureSeats', seats: [seat] });
    const evs = d.run({ type: 'DrawPrompt', kind: 'domain' });
    expect(evs[0]!.type === 'RollMade' && evs[0]!.payload.tableId).toBe('t-domain-d6');
  });
});
