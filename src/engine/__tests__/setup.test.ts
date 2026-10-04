import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { setupGame } from '../../../tests/support/autoplay';
import { defaultSettings, periods, setupComplete } from '..';

const create = (d: Driver, ruleset: 'lens' | 'chronicle' = 'lens') =>
  d.run({
    type: 'CreateGame',
    id: 'g',
    title: 'T',
    ruleset,
    seed: '00112233445566778899aabbccddeeff',
  });

describe('CreateGame', () => {
  it('emits GameCreated with seed, rng state, default seats and deck', () => {
    const d = new Driver();
    const evs = create(d);
    expect(d.types(evs)).toEqual(['GameCreated']);
    expect(d.state.seats.map((s) => s.kind)).toEqual(['player', 'phantom']);
    expect(d.state.deck?.remaining).toHaveLength(78);
    expect(d.state.settings.modes).toEqual(defaultSettings().modes);
    expect(evs[0]!.seq).toBe(1);
  });
  it('rejects a second creation and a bad seed', () => {
    const d = new Driver();
    create(d);
    expect(
      d.rejection({
        type: 'CreateGame',
        id: 'x',
        title: 'T',
        ruleset: 'lens',
        seed: '00112233445566778899aabbccddeeff',
      }).code,
    ).toBe('game-exists');
    expect(() =>
      new Driver().run({ type: 'CreateGame', id: 'x', title: 'T', ruleset: 'lens', seed: 'nope' }),
    ).toThrow();
  });
  it('rejects other commands before creation', () => {
    expect(new Driver().rejection({ type: 'SetBigPicture', text: 'x' }).code).toBe('no-game');
  });
});

describe('SetBigPicture', () => {
  it('accepts one sentence up to 200 characters', () => {
    const d = new Driver();
    create(d);
    expect(d.types(d.run({ type: 'SetBigPicture', text: 'A city.' }))).toEqual(['BigPictureSet']);
    expect(d.state.bigPicture).toBe('A city.');
  });
  it.each([
    ['', 'invalid'],
    ['x'.repeat(201), 'invalid'],
  ])('rejects %j', (text, code) => {
    const d = new Driver();
    create(d);
    expect(d.rejection({ type: 'SetBigPicture', text }).code).toBe(code);
  });
  it('is not available in Chronicle', () => {
    const d = new Driver();
    create(d, 'chronicle');
    expect(d.rejection({ type: 'SetBigPicture', text: 'x' }).code).toBe('wrong-phase');
  });
});

describe('SetBookends', () => {
  it('creates start and end Periods, locked', () => {
    const d = new Driver();
    create(d);
    d.run({ type: 'SetBigPicture', text: 'A city.' });
    d.run({
      type: 'SetBookends',
      start: { title: 'A', prose: '', tone: 'light' },
      end: { title: 'B', prose: '', tone: 'dark' },
    });
    const ps = periods(d.state);
    expect(ps.map((p) => [p.title, p.bookend, p.locked])).toEqual([
      ['A', 'start', true],
      ['B', 'end', true],
    ]);
  });
  it('requires a premise and can only happen once', () => {
    const d = new Driver();
    create(d);
    const cmd = {
      type: 'SetBookends',
      start: { title: 'A', prose: '', tone: 'light' },
      end: { title: 'B', prose: '', tone: 'dark' },
    } as const;
    expect(d.rejection(cmd).code).toBe('wrong-phase');
    d.run({ type: 'SetBigPicture', text: 'A city.' });
    d.run(cmd);
    expect(d.rejection(cmd).code).toBe('wrong-phase');
  });
  it('requires titles', () => {
    const d = new Driver();
    create(d);
    d.run({ type: 'SetBigPicture', text: 'A city.' });
    expect(
      d.rejection({
        type: 'SetBookends',
        start: { title: '', prose: '', tone: 'light' },
        end: { title: 'B', prose: '', tone: 'dark' },
      }).code,
    ).toBe('invalid');
  });
});

describe('Palette', () => {
  const ready = () => {
    const d = new Driver();
    create(d);
    return d;
  };
  it('adds and removes items', () => {
    const d = ready();
    d.run({ type: 'AddPaletteItem', list: 'yes', text: 'boats' });
    const id = d.state.palette.yes[0]!.id;
    d.run({ type: 'RemovePaletteItem', id });
    expect(d.state.palette.yes).toEqual([]);
    expect(d.rejection({ type: 'RemovePaletteItem', id }).code).toBe('not-found');
  });
  it('rolls up to 2 items, with one reroll each in prompt mode', () => {
    const d = ready();
    expect(d.types(d.run({ type: 'RollPaletteItem' }))).toEqual(['RollMade']);
    expect(d.state.pendingPalette?.text).toMatch(/^palette \d$/);
    expect(d.rejection({ type: 'RollPaletteItem' }).code).toBe('already-rolled');
    d.run({ type: 'RerollPaletteItem' });
    expect(d.rejection({ type: 'RerollPaletteItem' }).code).toBe('cap-reached');
    d.run({ type: 'AssignPaletteRoll', list: 'no' });
    expect(d.state.palette.no[0]!.rolled).toBe(true);
    d.run({ type: 'RollPaletteItem' });
    d.run({ type: 'AssignPaletteRoll', list: 'yes' });
    expect(d.rejection({ type: 'RollPaletteItem' }).code).toBe('cap-reached');
  });
  it('rolls as many items as paletteRollCount allows, including none', () => {
    const d = ready();
    d.run({ type: 'ChangeSettings', settings: { ...d.state.settings, paletteRollCount: 3 } });
    for (let i = 0; i < 3; i++) {
      d.run({ type: 'RollPaletteItem' });
      d.run({ type: 'AssignPaletteRoll', list: 'yes' });
    }
    expect(d.rejection({ type: 'RollPaletteItem' }).code).toBe('cap-reached');
    const z = ready();
    z.run({ type: 'ChangeSettings', settings: { ...z.state.settings, paletteRollCount: 0 } });
    expect(z.rejection({ type: 'RollPaletteItem' }).code).toBe('cap-reached');
  });
  it('paletteRollCount must be a whole number from 0 to 6', () => {
    const d = ready();
    for (const n of [-1, 7, 1.5])
      expect(
        d.rejection({
          type: 'ChangeSettings',
          settings: { ...d.state.settings, paletteRollCount: n },
        }).code,
      ).toBe('invalid');
    d.run({ type: 'ChangeSettings', settings: { ...d.state.settings, paletteRollCount: 6 } });
    expect(d.state.settings.paletteRollCount).toBe(6);
  });
  it('allows no reroll in enforce mode and no roll when off', () => {
    const d = ready();
    const s = d.state.settings;
    d.run({
      type: 'ChangeSettings',
      settings: { ...s, modes: { ...s.modes, 'palette.roll': 'enforce' } },
    });
    d.run({ type: 'RollPaletteItem' });
    expect(d.rejection({ type: 'RerollPaletteItem' }).code).toBe('enforced');
    const e = ready();
    e.run({
      type: 'ChangeSettings',
      settings: { ...s, modes: { ...s.modes, 'palette.roll': 'off' } },
    });
    expect(e.rejection({ type: 'RollPaletteItem' }).code).toBe('wrong-phase');
  });
});

describe('ConfigureSeats', () => {
  it('requires a player and at most four seats in all', () => {
    const d = new Driver();
    create(d);
    const p = {
      id: 'p',
      name: 'P',
      kind: 'player' as const,
      tables: [],
      placementBias: 'uniform' as const,
    };
    const ph = (i: number) => ({
      id: `f${i}`,
      name: `F${i}`,
      kind: 'phantom' as const,
      tables: [],
      placementBias: 'early' as const,
    });
    expect(d.rejection({ type: 'ConfigureSeats', seats: [ph(1)] }).code).toBe('invalid');
    expect(
      d.rejection({ type: 'ConfigureSeats', seats: [p, ph(1), ph(2), ph(3), ph(4)] }).code,
    ).toBe('invalid');
    d.run({ type: 'ConfigureSeats', seats: [p] });
    expect(d.state.seats).toHaveLength(1);
  });
});

describe('First Pass and dials', () => {
  it('each seat adds one Period or Event in order, then play can start', () => {
    const d = new Driver();
    setupGame(d);
    const fp = Object.values(d.state.entries).filter((e) => e.firstPass);
    expect(fp.map((e) => e.seatId)).toEqual(d.state.seats.map((s) => s.id));
    expect(setupComplete(d.state)).toBe(true);
    expect(
      d.rejection({
        type: 'AddFirstPassEntry',
        kind: 'event',
        title: 'x',
        tone: 'light',
        placement: { parentId: fp[0]!.id, index: 0 },
      }).code,
    ).toBe('cap-reached');
  });
  it('rejects Periods outside the Bookends', () => {
    const d = new Driver();
    create(d);
    d.run({ type: 'SetBigPicture', text: 'A city.' });
    d.run({
      type: 'SetBookends',
      start: { title: 'A', prose: '', tone: 'light' },
      end: { title: 'B', prose: '', tone: 'dark' },
    });
    for (const index of [0, 2]) {
      expect(
        d.rejection({
          type: 'AddFirstPassEntry',
          kind: 'period',
          title: 'x',
          tone: 'light',
          placement: { parentId: null, index },
        }).code,
      ).toBe('illegal-placement');
    }
  });
  it.each([[0], [10], [5.5]])('rejects dial value %s', (v) => {
    const d = new Driver();
    create(d);
    expect(d.rejection({ type: 'SetDials', mood: v, cohesion: 5 }).code).toBe('invalid');
  });
  it('StartRound requires complete setup', () => {
    const d = new Driver();
    create(d);
    expect(d.rejection({ type: 'StartRound' }).code).toBe('wrong-phase');
  });
});
