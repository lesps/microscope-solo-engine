import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { setupGame } from '../../../tests/support/autoplay';
import { readyForTurn } from '../../../tests/support/fixtures';
import { testContent } from '../../../tests/support/driver';
import {
  linkedActiveTables,
  personPromptParts,
  personText,
  tablesByTag,
  replay,
  type Command,
  type Content,
  type GameEvent,
  type Table,
} from '..';

const rolls = (evs: GameEvent[]) => evs.flatMap((e) => (e.type === 'RollMade' ? [e.payload] : []));
const purposes = (evs: GameEvent[]) => rolls(evs).map((r) => r.purpose);

const UNTAGGED = [
  't-domain',
  't-domain-d6',
  't-pair',
  't-palette',
  't-reversal',
  't-focus',
  't-question',
  't-name',
  't-role',
  't-want',
];

const create = () => {
  const d = new Driver();
  d.run({
    type: 'CreateGame',
    id: 'g',
    title: 'T',
    ruleset: 'lens',
    seed: '00112233445566778899aabbccddeeff',
  });
  return d;
};

describe('DrawPrompt question', () => {
  it('rolls an active question table and records prompt.question', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-question'] }));
    d.run({ type: 'StartTurn' });
    const evs = d.run({ type: 'DrawPrompt', kind: 'question' });
    expect(purposes(evs)).toEqual(['prompt.question']);
    const r = rolls(evs)[0]!;
    expect(r).toMatchObject({ tableId: 't-question', sides: 4 });
    expect(r.value).toEqual({ kind: 'question', text: r.text });
    expect(d.state.turn!.prompts).toEqual([{ kind: 'question', text: r.text, seq: evs[0]!.seq }]);
  });

  it('picks among several active question tables', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-question', 'tag-other-question'] }));
    const evs = d.run({ type: 'DrawPrompt', kind: 'question' });
    expect(purposes(evs)).toEqual(['table.pick', 'prompt.question']);
  });

  it('is rejected with content-missing when no question table is active', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-domain'] }));
    expect(d.rejection({ type: 'DrawPrompt', kind: 'question' }).code).toBe('content-missing');
  });
});

describe('DrawPrompt person', () => {
  it('rolls name, role and want in order and joins them', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    const evs = d.run({ type: 'DrawPrompt', kind: 'person' });
    expect(purposes(evs)).toEqual([
      'prompt.person.name',
      'prompt.person.role',
      'prompt.person.want',
    ]);
    const [name, role, want] = rolls(evs).map((r) => r.text!);
    expect(name).toMatch(/^Name \d$/);
    expect(want).toMatch(/^to want \d$/);
    const text = `${name}, ${role}, who wants ${want}`;
    expect(rolls(evs).map((r) => r.value)).toEqual([
      undefined,
      undefined,
      { kind: 'person', text },
    ]);
    expect(d.state.turn!.prompts).toEqual([{ kind: 'person', text, seq: evs[2]!.seq }]);
  });

  it('drops the clause of a slot with no active table', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-role', 't-want'] }));
    const evs = d.run({ type: 'DrawPrompt', kind: 'person' });
    expect(purposes(evs)).toEqual(['prompt.person.role', 'prompt.person.want']);
    const [role, want] = rolls(evs).map((r) => r.text!);
    expect(rolls(evs)[1]!.value).toEqual({ kind: 'person', text: `${role}, who wants ${want}` });

    const n = readyForTurn((s) => ({ ...s, activeTables: ['t-name'] }));
    const only = rolls(n.run({ type: 'DrawPrompt', kind: 'person' }));
    expect(only.map((r) => r.value)).toEqual([{ kind: 'person', text: only[0]!.text }]);
  });

  it('picks among several tables for one slot', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-name', 'tag-grp-name'] }));
    expect(purposes(d.run({ type: 'DrawPrompt', kind: 'person' }))).toEqual([
      'table.pick',
      'prompt.person.name',
    ]);
  });

  it('respects the seat’s table list', () => {
    const d = new Driver();
    setupGame(d, { phantoms: 0 });
    d.run({
      type: 'ConfigureSeats',
      seats: d.state.seats.map((s) => ({ ...s, tables: ['t-want', 't-domain'] })),
    });
    d.run({ type: 'StartRound' });
    if (!d.state.rounds[0]!.focus) d.run({ type: 'SetFocus', text: 'Trade' });
    expect(purposes(d.run({ type: 'DrawPrompt', kind: 'person' }))).toEqual(['prompt.person.want']);
  });

  it('is rejected with content-missing when no person table is active', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-domain'] }));
    expect(d.rejection({ type: 'DrawPrompt', kind: 'person' }).code).toBe('content-missing');
  });

  it('personText joins whatever parts exist', () => {
    expect(personText({ name: 'Ada', role: 'a smith', want: 'to rest' })).toBe(
      'Ada, a smith, who wants to rest',
    );
    expect(personText({ name: 'Ada', want: 'to rest' })).toBe('Ada, who wants to rest');
    expect(personText({ role: 'a smith' })).toBe('a smith');
    expect(personText({})).toBe('');
  });
});

describe('linkedActiveTables', () => {
  const content = testContent();
  it('keeps untagged active tables and adds every non-generator table tagged with the groups', () => {
    expect(linkedActiveTables(content, ['t-domain', 't-focus'], ['grp'])).toEqual([
      't-domain',
      't-focus',
      'tag-grp-domain',
      'tag-grp-name',
      'tag-both-focus',
    ]);
  });
  it('removes tables tagged only with other groups', () => {
    const current = ['t-domain', 'tag-grp-domain', 'tag-grp-name', 'tag-both-focus'];
    expect(linkedActiveTables(content, current, ['other'])).toEqual([
      't-domain',
      'tag-other-question',
      'tag-both-focus',
    ]);
  });
  it('includes a multi-tag table once and never a generator table', () => {
    const ids = linkedActiveTables(content, [], ['grp', 'other']);
    expect(ids.filter((id) => id === 'tag-both-focus')).toHaveLength(1);
    const tagged: Table = {
      id: 'g-tagged',
      name: 'G',
      category: 'generator',
      tags: ['grp'],
      entries: [{ text: 'x' }],
    };
    const withGen: Content = { ...content, tables: { ...content.tables, [tagged.id]: tagged } };
    expect(linkedActiveTables(withGen, ['g-force'], ['grp'])).not.toContain('g-tagged');
  });
  it('with no groups, drops tagged tables and keeps the rest, including unknown ids', () => {
    expect(linkedActiveTables(content, ['gone', 'tag-grp-domain', 't-pair'], [])).toEqual([
      'gone',
      't-pair',
    ]);
  });
});

describe('toolkit linking at game creation and startup', () => {
  const seedCmd = (seedId: string): Command =>
    seedId === 'seed-lens'
      ? {
          type: 'ApplySeed',
          seedId,
          answers: {
            q1: { optionIds: ['a'] },
            q2: { optionIds: ['x', 'y'] },
            q3: { optionIds: ['m'] },
          },
          start: { optionId: 's1' },
          end: { optionId: 'e1' },
        }
      : {
          type: 'ApplySeed',
          seedId,
          answers: {},
          start: { optionId: 's' },
          end: { optionId: 'e' },
        };

  it('CreateGame activates every untagged, non-generator table', () => {
    expect(create().state.settings.activeTables).toEqual(UNTAGGED);
  });

  it('ApplySeed with a group emits SettingsChanged after SeedApplied, linking that group', () => {
    const d = create();
    const evs = d.run(seedCmd('seed-lens'));
    expect(d.types(evs)).toEqual(['SeedApplied', 'SettingsChanged']);
    expect(d.state.settings.activeTables).toEqual([
      ...UNTAGGED,
      'tag-grp-domain',
      'tag-grp-name',
      'tag-both-focus',
    ]);
    expect(evs[1]!.batch).toBe(evs[0]!.seq);
  });

  it('ApplySeed without a group changes no settings', () => {
    const d = create();
    expect(d.types(d.run(seedCmd('seed-any')))).toEqual(['SeedApplied']);
    expect(d.state.settings.activeTables).toEqual(UNTAGGED);
  });

  it('re-applying a seed from another group relinks from scratch', () => {
    const d = create();
    d.run(seedCmd('seed-lens'));
    d.run(seedCmd('seed-other'));
    expect(d.state.settings.activeTables).toEqual([
      ...UNTAGGED,
      'tag-other-question',
      'tag-both-focus',
    ]);
  });

  it('linking keeps the player’s other choices: an untagged table they turned off stays off', () => {
    const d = create();
    d.run({
      type: 'ChangeSettings',
      settings: { ...d.state.settings, activeTables: UNTAGGED.filter((t) => t !== 't-pair') },
    });
    d.run(seedCmd('seed-lens'));
    expect(d.state.settings.activeTables).not.toContain('t-pair');
  });

  it('a link that changes nothing emits no SettingsChanged', () => {
    const d = create();
    d.run(seedCmd('seed-lens'));
    expect(d.types(d.run(seedCmd('seed-lens')))).toEqual(['SeedApplied']);
  });

  it('AcceptGeneratorReading links the generator’s group', () => {
    const d = create();
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
    const evs = d.run({ type: 'AcceptGeneratorReading', swapped: false });
    expect(d.types(evs)).toEqual(['GeneratorReadingAccepted', 'SettingsChanged']);
    expect(d.state.settings.activeTables).toContain('tag-grp-domain');
  });

  it('AcceptGeneratorReading without a group changes no settings', () => {
    const content = testContent();
    content.generators.gen = { ...content.generators.gen!, group: undefined };
    const d = new Driver({ ...new Driver().env, content });
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    d.run({ type: 'RollGenerator', generatorId: 'gen' });
    expect(d.types(d.run({ type: 'AcceptGeneratorReading', swapped: false }))).toEqual([
      'GeneratorReadingAccepted',
    ]);
  });

  it('linking replays without content', () => {
    const d = create();
    d.run(seedCmd('seed-lens'));
    expect(replay(d.events)).toEqual(d.state);
  });
});

describe('tablesByTag', () => {
  it('lists non-generator tables under each of their tags, in content order', () => {
    const by = tablesByTag(testContent());
    expect([...by.keys()]).toEqual(['grp', 'other']);
    expect(by.get('grp')!.map((t) => t.id)).toEqual([
      'tag-grp-domain',
      'tag-grp-name',
      'tag-both-focus',
    ]);
    expect(by.get('other')!.map((t) => t.id)).toEqual(['tag-other-question', 'tag-both-focus']);
    const gen: Table = {
      id: 'g-tagged',
      name: 'G',
      category: 'generator',
      tags: ['gen-only'],
      entries: [{ text: 'x' }],
    };
    const content = testContent();
    expect(
      tablesByTag({ ...content, tables: { ...content.tables, [gen.id]: gen } }).has('gen-only'),
    ).toBe(false);
  });
});

describe('personPromptParts', () => {
  it('reads only its own batch, ignoring a table pick and a later person', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-name', 'tag-grp-name', 't-want'] }));
    const evs = d.run({ type: 'DrawPrompt', kind: 'person' });
    const by = (p: string) => rolls(evs).find((r) => r.purpose === p)!.text;
    const first = { name: by('prompt.person.name'), want: by('prompt.person.want') };
    let later = first;
    while (later.name === first.name && later.want === first.want) {
      const more = d.run({ type: 'DrawPrompt', kind: 'person' });
      later = personPromptParts(d.events, more.at(-1)!.seq) as typeof first;
    }
    expect(personPromptParts(d.events, evs.at(-1)!.seq)).toEqual(first);
  });
  it('recovers each slot of a person prompt from its batch', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    d.run({ type: 'DrawPrompt', kind: 'domain' });
    const evs = d.run({ type: 'DrawPrompt', kind: 'person' });
    const [name, role, want] = rolls(evs).map((r) => r.text);
    const seq = d.state.turn!.prompts.find((p) => p.kind === 'person')!.seq;
    expect(personPromptParts(d.events, seq)).toEqual({ name, role, want });
  });
  it('omits slots that were not rolled, and is empty for an unknown seq', () => {
    const d = readyForTurn((s) => ({ ...s, activeTables: ['t-want'] }));
    const evs = d.run({ type: 'DrawPrompt', kind: 'person' });
    expect(personPromptParts(d.events, evs[0]!.seq)).toEqual({ want: rolls(evs)[0]!.text });
    expect(personPromptParts(d.events, 9999)).toEqual({});
  });
});
