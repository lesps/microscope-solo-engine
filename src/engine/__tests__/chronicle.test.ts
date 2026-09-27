import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { setupGame } from '../../../tests/support/autoplay';
import { applyChange, periods, subjectAt } from '..';

function chronicle() {
  const d = new Driver();
  setupGame(d, {
    ruleset: 'chronicle',
    settings: (s) => ({ ...s, modes: { ...s.modes, placement: 'off', cohesion: 'off' } }),
  });
  d.run({ type: 'StartRound' });
  if (!d.state.rounds[0]!.focus) d.run({ type: 'SetFocus', text: 'The lamp' });
  d.run({ type: 'StartTurn' });
  return d;
}

describe('Chronicle subject', () => {
  it('needs 3–5 distinct traits', () => {
    const d = new Driver();
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'chronicle',
      seed: '00112233445566778899aabbccddeeff',
    });
    expect(
      d.rejection({
        type: 'SetSubject',
        subject: { name: 'X', description: 'd', traits: ['a', 'b'] },
      }).code,
    ).toBe('invalid');
    expect(
      d.rejection({
        type: 'SetSubject',
        subject: { name: 'X', description: 'd', traits: ['a', 'a', 'b'] },
      }).code,
    ).toBe('invalid');
    d.run({
      type: 'SetSubject',
      subject: { name: 'X', description: 'd', traits: ['a', 'b', 'c'] },
    });
    expect(d.state.bigPicture).toBe('d');
  });
  it.each([
    [{ op: 'add', trait: 'd' }, ['a', 'b', 'c', 'd']],
    [{ op: 'remove', trait: 'b' }, ['a', 'c']],
    [{ op: 'modify', from: 'c', to: 'z' }, ['a', 'b', 'z']],
    [{ op: 'add', trait: 'a' }, 'error'],
    [{ op: 'remove', trait: 'q' }, 'error'],
    [{ op: 'modify', from: 'q', to: 'z' }, 'error'],
  ] as const)('applyChange %j', (c, out) => {
    const r = applyChange(['a', 'b', 'c'], { ...c });
    if (out === 'error') expect(r).toHaveProperty('error');
    else expect(r).toEqual(out);
  });
});

describe('Chronicle Periods', () => {
  it('rejects a Period without an Anchor or without a Change', () => {
    const d = chronicle();
    const placement = { parentId: null, index: 1 };
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'period',
        title: 'p',
        placement,
        change: { op: 'add', trait: 'x' },
      }).code,
    ).toBe('chronicle');
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'period',
        title: 'p',
        placement,
        anchor: { name: 'Ann' },
      }).code,
    ).toBe('chronicle');
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'period',
        title: 'p',
        placement,
        anchor: { name: 'Ann' },
        change: { op: 'remove', trait: 'nope' },
      }).code,
    ).toBe('chronicle');
    d.run({
      type: 'CreateEntry',
      kind: 'period',
      title: 'p',
      placement,
      anchor: { name: 'Ann' },
      change: { op: 'add', trait: 'haunted' },
    });
  });

  it('a mortal Anchor may not appear in another Period (hard rule)', () => {
    const d = chronicle();
    const builder = Object.values(d.state.characters).find((c) => c.name === 'The Builder')!;
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'period',
        title: 'p',
        placement: { parentId: null, index: 1 },
        anchor: { characterId: builder.id },
        change: { op: 'add', trait: 'x' },
      }).code,
    ).toBe('chronicle');
    d.run({
      type: 'CreateCharacter',
      name: 'The Light',
      description: 'it endures',
      immortal: true,
    });
    const light = Object.values(d.state.characters).find((c) => c.name === 'The Light')!;
    d.run({
      type: 'CreateEntry',
      kind: 'period',
      title: 'p',
      placement: { parentId: null, index: 1 },
      anchor: { characterId: light.id },
      change: { op: 'add', trait: 'x' },
    });
  });

  it('a mortal Anchor cannot be a required character in another Period’s Scene', () => {
    const d = chronicle();
    const keeper = Object.values(d.state.characters).find((c) => c.name === 'The Last Keeper')!;
    const start = periods(d.state)[0]!;
    const ev = Object.values(d.state.entries).find(
      (e) => e.kind === 'event' && e.periodId === start.id,
    )!;
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'scene',
        title: 's',
        placement: { parentId: ev.id, index: 0 },
        scene: { question: 'q', form: 'played', requiredCharacterIds: [keeper.id] },
      }).code,
    ).toBe('chronicle');
  });

  it('renders the subject as of any Period', () => {
    const d = chronicle();
    d.run({
      type: 'CreateEntry',
      kind: 'period',
      title: 'Storm years',
      placement: { parentId: null, index: 2 },
      anchor: { name: 'Ann' },
      change: { op: 'modify', from: 'bright', to: 'dim' },
    });
    const ps = periods(d.state);
    const traits = ps.map((p) => subjectAt(d.state, p.id)!.traits);
    // start: base; first-pass period: + fp trait 0; storm years: bright → dim; end: same as last
    expect(traits[0]).toEqual(['tall', 'lonely', 'bright']);
    expect(traits[1]).toEqual(['tall', 'lonely', 'bright', 'fp trait 0']);
    expect(traits[2]).toEqual(['tall', 'lonely', 'dim', 'fp trait 0']);
    expect(traits[3]).toEqual(traits[2]);
  });

  it('rolled Focus draws from the subject and its current traits', () => {
    const d = new Driver();
    setupGame(d, { ruleset: 'chronicle' });
    d.run({ type: 'StartRound' });
    d.run({ type: 'SetFocus', text: 'x' });
    // Round 2's Lens seat is the phantom: Focus is rolled (enforce).
    const r2 = () => d.state.rounds[1];
    expect(r2()).toBeUndefined();
    const s = d.state.settings;
    const e = new Driver();
    setupGame(e, {
      ruleset: 'chronicle',
      settings: () => ({ ...s, modes: { ...s.modes, 'focus.source': 'enforce' } }),
    });
    e.run({ type: 'StartRound' });
    const f = e.state.rounds[0]!;
    expect(['The Lighthouse', 'tall', 'lonely', 'bright', 'fp trait 0']).toContain(f.focus);
    expect(['subject', 'trait']).toContain(f.focusSource);
  });
});
