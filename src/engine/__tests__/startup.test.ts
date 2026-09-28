import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { setupGame } from '../../../tests/support/autoplay';
import { withModes } from '../../../tests/support/fixtures';
import { replay, type Command, type GameEvent, type Mode, type Settings } from '..';

const create = (ruleset: 'lens' | 'chronicle' = 'lens', modes?: Partial<Settings['modes']>) => {
  const d = new Driver();
  d.run({
    type: 'CreateGame',
    id: 'g',
    title: 'T',
    ruleset,
    seed: '00112233445566778899aabbccddeeff',
  });
  if (modes) d.run({ type: 'ChangeSettings', settings: withModes(modes)(d.state.settings) });
  return d;
};

const answers = {
  q1: { optionIds: ['a'] },
  q2: { optionIds: ['x', 'z'] },
  q3: { custom: 'Something of my own' },
};
const applySeed = (over: Partial<Extract<Command, { type: 'ApplySeed' }>> = {}): Command => ({
  type: 'ApplySeed',
  seedId: 'seed-lens',
  answers,
  start: { optionId: 's1' },
  end: { custom: { title: 'Mine', text: 'My own ending.' } },
  ...over,
});
const rolls = (evs: GameEvent[], purpose: string) =>
  evs.flatMap((e) => (e.type === 'RollMade' && e.payload.purpose === purpose ? [e.payload] : []));

describe('ApplySeed', () => {
  it('emits SeedApplied with every text resolved from content', () => {
    const d = create();
    const evs = d.run(applySeed());
    expect(d.types(evs)).toEqual(['SeedApplied']);
    expect(d.state.startup).toEqual({
      kind: 'seed',
      packId: 'test-pack',
      packName: 'Test pack',
      seedId: 'seed-lens',
      title: 'Test seed',
      pitch: 'A test premise. It has two sentences.',
      bigPictureDraft: 'A drafted Big Picture.',
      note: 'A designer note.',
      notes: [
        { question: 'Pick one?', answers: ['Alpha'] },
        { question: 'Pick two?', answers: ['Ex', 'Zed'] },
        { question: 'One or two?', answers: ['Something of my own'] },
      ],
      bookends: {
        start: { title: 'Dawn', text: 'It begins at dawn.' },
        end: { title: 'Mine', text: 'My own ending.' },
      },
      palette: { yes: ['Salt'], no: ['Dragons'] },
    });
  });

  it('a Chronicle seed carries its subject; an any-ruleset seed fits both rulesets', () => {
    const d = create('chronicle');
    d.run({
      type: 'ApplySeed',
      seedId: 'seed-chronicle',
      answers: {},
      start: { optionId: 's' },
      end: { optionId: 'e' },
    });
    expect(d.state.startup).toMatchObject({
      subject: { name: 'The Light', traits: ['tall', 'lonely', 'bright'] },
      bookends: { start: { text: 'Lit.' } },
    });
    for (const r of ['lens', 'chronicle'] as const) {
      create(r).run({
        type: 'ApplySeed',
        seedId: 'seed-any',
        answers: {},
        start: { optionId: 's' },
        end: { optionId: 'e' },
      });
    }
  });

  it('applying again before the Bookends replaces the startup', () => {
    const d = create();
    d.run(applySeed());
    d.run(applySeed({ start: { optionId: 's2' } }));
    expect(d.state.startup?.kind === 'seed' && d.state.startup.bookends.start).toEqual({
      text: 'It begins with a very long sentence that has no short title of its own at all.',
    });
  });

  it.each<[string, Command, string]>([
    ['unknown seed', applySeed({ seedId: 'nope' }), 'unknown-content'],
    [
      'ruleset mismatch',
      {
        type: 'ApplySeed',
        seedId: 'seed-chronicle',
        answers: {},
        start: { optionId: 's' },
        end: { optionId: 'e' },
      },
      'invalid',
    ],
    ['missing answer', applySeed({ answers: { q1: answers.q1, q2: answers.q2 } }), 'invalid'],
    [
      'unknown question',
      applySeed({ answers: { ...answers, zz: { optionIds: ['a'] } } }),
      'invalid',
    ],
    [
      'pick one with two',
      applySeed({ answers: { ...answers, q1: { optionIds: ['a', 'b'] } } }),
      'invalid',
    ],
    [
      'pick two with one',
      applySeed({ answers: { ...answers, q2: { optionIds: ['x'] } } }),
      'invalid',
    ],
    [
      'one or two with three',
      applySeed({ answers: { ...answers, q3: { optionIds: ['m', 'n', 'o'] } } }),
      'invalid',
    ],
    [
      'one or two with none',
      applySeed({ answers: { ...answers, q3: { optionIds: [] } } }),
      'invalid',
    ],
    [
      'the same option twice',
      applySeed({ answers: { ...answers, q2: { optionIds: ['x', 'x'] } } }),
      'invalid',
    ],
    [
      'unknown option',
      applySeed({ answers: { ...answers, q1: { optionIds: ['zz'] } } }),
      'invalid',
    ],
    [
      'custom not allowed',
      applySeed({ answers: { ...answers, q2: { custom: 'mine' } } }),
      'invalid',
    ],
    ['empty custom', applySeed({ answers: { ...answers, q1: { custom: '  ' } } }), 'invalid'],
    [
      'over-long custom',
      applySeed({ answers: { ...answers, q1: { custom: 'x'.repeat(201) } } }),
      'invalid',
    ],
    ['unknown bookend option', applySeed({ start: { optionId: 'zz' } }), 'invalid'],
    [
      'over-long custom bookend title',
      applySeed({ end: { custom: { title: 'x'.repeat(61), text: 't' } } }),
      'invalid',
    ],
    [
      'empty custom bookend text',
      applySeed({ end: { custom: { title: 'x', text: '' } } }),
      'invalid',
    ],
  ])('rejects %s', (_n, cmd, code) => {
    expect(create().rejection(cmd).code).toBe(code);
  });

  it('is rejected once both Bookends exist or a round has started', () => {
    const d = create();
    d.run({ type: 'SetBigPicture', text: 'x' });
    d.run({
      type: 'SetBookends',
      start: { title: 'a', prose: '', tone: 'light' },
      end: { title: 'b', prose: '', tone: 'dark' },
    });
    for (const c of [
      applySeed(),
      { type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'q1' },
      { type: 'RollGenerator', generatorId: 'gen' },
      { type: 'AcceptGeneratorReading', swapped: false },
    ] as Command[]) {
      expect(d.rejection(c).code).toBe('setup-advanced');
    }
  });
});

describe('seed.answers mode', () => {
  it('off: rolling is refused, as for rolled Palette items', () => {
    expect(
      create().rejection({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'q1' }).code,
    ).toBe('wrong-phase');
  });

  it('rolls a uniform die over a question’s or a Bookend’s options and records the pick', () => {
    const d = create(undefined, { 'seed.answers': 'prompt' });
    const [r] = rolls(
      d.run({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'q2' }),
      'seed.answer',
    );
    expect(r).toMatchObject({ sides: 3, targetId: 'q2' });
    expect(d.state.pendingSeed).toEqual({
      seedId: 'seed-lens',
      rolled: { q2: (r!.value as { optionId: string }).optionId },
    });
    const [s] = rolls(
      d.run({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'start' }),
      'seed.answer',
    );
    expect(s).toMatchObject({ sides: 2, targetId: 'start' });
    d.run({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'end' });
    expect(Object.keys(d.state.pendingSeed!.rolled).sort()).toEqual(['end', 'q2', 'start']);
    expect(
      d.rejection({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'zz' }).code,
    ).toBe('invalid');
    expect(d.rejection({ type: 'RollSeedAnswer', seedId: 'nope', questionId: 'q1' }).code).toBe(
      'unknown-content',
    );
  });

  it('rolling again replaces that question’s roll; another seed starts over', () => {
    const d = create(undefined, { 'seed.answers': 'prompt' });
    for (let i = 0; i < 5; i++)
      d.run({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'q1' });
    const rolled = rolls(d.events, 'seed.answer').at(-1)!.value as { optionId: string };
    expect(d.state.pendingSeed!.rolled).toEqual({ q1: rolled.optionId });
    d.run({ type: 'RollSeedAnswer', seedId: 'seed-any', questionId: 'start' });
    expect(d.state.pendingSeed).toMatchObject({ seedId: 'seed-any' });
    expect(Object.keys(d.state.pendingSeed!.rolled)).toEqual(['start']);
  });

  function rolledAll(mode: Mode) {
    const d = create(undefined, { 'seed.answers': mode });
    for (const q of ['q1', 'q2', 'q3', 'start', 'end'])
      d.run({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: q });
    const r = d.state.pendingSeed!.rolled;
    const other = (id: string, pool: string[]) => pool.find((x) => x !== id)!;
    return { d, r, other };
  }

  it('prompt: each answer that leaves out the rolled option is an override', () => {
    const { d, r, other } = rolledAll('prompt');
    const cmd: Command = {
      type: 'ApplySeed',
      seedId: 'seed-lens',
      answers: {
        q1: { optionIds: [other(r.q1!, ['a', 'b'])] },
        q2: { optionIds: [r.q2!, other(r.q2!, ['x', 'y', 'z'])] },
        q3: { custom: 'mine' },
      },
      start: { optionId: r.start! },
      end: { optionId: other(r.end!, ['e1', 'e2']) },
    };
    const evs = d.run(cmd);
    const overrides = evs.filter((e) => e.type === 'OverrideUsed');
    expect(overrides.map((e) => e.type === 'OverrideUsed' && e.payload.targetId)).toEqual([
      'q1',
      'q3',
      'end',
    ]);
    expect(
      overrides.every((e) => e.type === 'OverrideUsed' && e.payload.mechanic === 'seed.answers'),
    ).toBe(true);
    expect(d.state.stats.overrides).toBe(3);
    expect(d.state.pendingSeed).toBeUndefined();
  });

  it('prompt: unrolled questions are free choices', () => {
    const d = create(undefined, { 'seed.answers': 'prompt' });
    expect(d.types(d.run(applySeed()))).toEqual(['SeedApplied']);
  });

  it('enforce: the rolled option must be included; written answers and unrolled questions are refused', () => {
    const { d, r, other } = rolledAll('enforce');
    const ok: Extract<Command, { type: 'ApplySeed' }> = {
      type: 'ApplySeed',
      seedId: 'seed-lens',
      answers: {
        q1: { optionIds: [r.q1!] },
        q2: { optionIds: [r.q2!, other(r.q2!, ['x', 'y', 'z'])] },
        q3: { optionIds: [r.q3!] },
      },
      start: { optionId: r.start! },
      end: { optionId: r.end! },
    };
    expect(
      d.rejection({
        ...ok,
        answers: { ...ok.answers, q1: { optionIds: [other(r.q1!, ['a', 'b'])] } },
      }).code,
    ).toBe('enforced');
    expect(d.rejection({ ...ok, answers: { ...ok.answers, q3: { custom: 'mine' } } }).code).toBe(
      'enforced',
    );
    expect(d.rejection({ ...ok, end: { optionId: other(r.end!, ['e1', 'e2']) } }).code).toBe(
      'enforced',
    );
    expect(d.rejection({ ...ok, end: { custom: { title: 't', text: 'x' } } }).code).toBe(
      'enforced',
    );
    // one-or-two: the roll plus an optional second pick
    d.run({
      ...ok,
      answers: { ...ok.answers, q3: { optionIds: [r.q3!, other(r.q3!, ['m', 'n', 'o'])] } },
    });
    const fresh = create(undefined, { 'seed.answers': 'enforce' });
    expect(fresh.rejection(ok).code).toBe('roll-required');
  });
});

describe('generators', () => {
  it('RollGenerator rolls each part in order, one RollMade per part', () => {
    const d = create();
    const evs = d.run({ type: 'RollGenerator', generatorId: 'gen' });
    const parts = rolls(evs, 'generator.part');
    expect(parts.map((p) => p.tableId)).toEqual(['g-force', 'g-thing', 'g-effect', 'g-thing']);
    expect(parts.map((p) => (p.value as { index: number }).index)).toEqual([0, 1, 2, 3]);
    expect(parts[0]!.value).toMatchObject({
      generatorId: 'gen',
      partId: 'f',
      label: 'Force',
      count: 4,
      swap: ['a', 'b'],
    });
    expect(d.state.pendingGenerator).toEqual({
      generatorId: 'gen',
      swap: ['a', 'b'],
      parts: parts.map((p) => ({
        id: (p.value as { partId: string }).partId,
        label: (p.value as { label: string }).label,
        text: p.text,
      })),
    });
  });

  it('rolling again replaces the pending parts', () => {
    const d = create();
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
    expect(d.state.pendingGenerator!.parts).toHaveLength(4);
    expect(d.state.pendingGenerator!.parts.map((p) => p.text)).toEqual(
      rolls(d.events, 'generator.part')
        .slice(4)
        .map((p) => p.text),
    );
  });

  it('is allowed whatever the modes', () => {
    const d = create(undefined, { 'seed.answers': 'enforce', 'palette.roll': 'off' });
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
  });

  it('rejects unknown generators and missing tables', () => {
    const d = create();
    expect(d.rejection({ type: 'RollGenerator', generatorId: 'nope' }).code).toBe(
      'unknown-content',
    );
    delete d.env.content.tables['g-effect'];
    expect(d.rejection({ type: 'RollGenerator', generatorId: 'gen' }).code).toBe('unknown-content');
  });

  it('AcceptGeneratorReading fills the template, swaps the pair when asked, and clears the roll', () => {
    const d = create();
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
    const [f, a, e, b] = d.state.pendingGenerator!.parts.map((p) => p.text);
    const again = create();
    again.run({ type: 'RollGenerator', generatorId: 'gen' });
    expect(d.types(d.run({ type: 'AcceptGeneratorReading', swapped: false }))).toEqual([
      'GeneratorReadingAccepted',
    ]);
    expect(d.state.startup).toEqual({
      kind: 'generator',
      packId: 'test-pack',
      packName: 'Test pack',
      generatorId: 'gen',
      name: 'Test generator',
      reading: `${f} ${a} ${e} ${b}`,
    });
    expect(d.state.pendingGenerator).toBeUndefined();
    again.run({ type: 'AcceptGeneratorReading', swapped: true });
    const [f2, a2, e2, b2] = rolls(again.events, 'generator.part').map((p) => p.text);
    expect(again.state.startup).toMatchObject({ reading: `${f2} ${b2} ${e2} ${a2}` });
  });

  it('AcceptGeneratorReading needs a pending roll, and a swap pair to swap', () => {
    const d = create();
    expect(d.rejection({ type: 'AcceptGeneratorReading', swapped: false }).code).toBe(
      'roll-required',
    );
    d.env.content.generators.gen = { ...d.env.content.generators.gen!, swap: undefined };
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
    expect(d.rejection({ type: 'AcceptGeneratorReading', swapped: true }).code).toBe('invalid');
  });

  it('a seed and a generator replace each other as the startup', () => {
    const d = create();
    d.run(applySeed());
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
    d.run({ type: 'AcceptGeneratorReading', swapped: false });
    expect(d.state.startup?.kind).toBe('generator');
    d.run(applySeed());
    expect(d.state.startup?.kind).toBe('seed');
  });
});

describe('CreateGame and replay', () => {
  it('leaves generator tables out of the active tables', () => {
    const d = create();
    expect(d.state.settings.activeTables).not.toContain('g-force');
    expect(d.state.settings.activeTables).toContain('t-domain');
  });

  it('seed.answers defaults: off by default and in Pure Lens, enforce in High Friction', async () => {
    const { PRESETS, defaultSettings } = await import('..');
    expect(defaultSettings().modes['seed.answers']).toBe('off');
    expect(PRESETS['pure-lens'].apply(defaultSettings()).modes['seed.answers']).toBe('off');
    expect(PRESETS['high-friction'].apply(defaultSettings()).modes['seed.answers']).toBe('enforce');
  });

  it('replays without content: startup included', () => {
    const d = new Driver();
    setupGame(d);
    const e = create(undefined, { 'seed.answers': 'prompt' });
    e.run({ type: 'RollSeedAnswer', seedId: 'seed-lens', questionId: 'q1' });
    e.run(applySeed({ answers: { ...answers, q1: { optionIds: ['b'] } } }));
    e.run({ type: 'RollGenerator', generatorId: 'gen' });
    expect(replay(e.events)).toEqual(e.state);
    expect(d.state.startup).toBeUndefined();
  });
});

describe('fillTemplate', () => {
  it('fills multi-character placeholders and leaves other text alone', async () => {
    const { fillTemplate } = await import('..');
    const parts = [
      { id: 'trend', text: 'the hoarding of' },
      { id: 'a', text: 'salt' },
      { id: 'impact', text: 'starves' },
      { id: 'b', text: 'the old dynasty' },
    ];
    expect(fillTemplate('{trend} {a} {impact} {b}.', parts)).toBe(
      'the hoarding of salt starves the old dynasty.',
    );
    expect(fillTemplate('{trend} {a} {impact} {b}', parts, ['a', 'b'])).toBe(
      'the hoarding of the old dynasty starves salt',
    );
  });

  it('a placeholder or swap part with no rolled text becomes empty', async () => {
    const { fillTemplate } = await import('..');
    expect(fillTemplate('[{missing}]', [{ id: 'x', text: 'X' }])).toBe('[]');
    expect(fillTemplate('{x}|{ghost}', [{ id: 'x', text: 'X' }], ['x', 'ghost'])).toBe('|X');
  });
});
