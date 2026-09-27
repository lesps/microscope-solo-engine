import { describe, expect, it } from 'vitest';
import { Driver } from '../../../tests/support/driver';
import { autoplay, cyclePick, setupGame } from '../../../tests/support/autoplay';
import { readyForTurn, startPeriod } from '../../../tests/support/fixtures';
import {
  checkInvariants,
  clampDial,
  describePlacement,
  hasConcreteDate,
  replay,
  seedFromBytes,
  seedToState,
  softWarnings,
  subjectAt,
  traitsAt,
  wordCount,
  type Game,
  type GameEvent,
} from '..';

function played(): Driver {
  const d = new Driver();
  setupGame(d);
  autoplay(d, cyclePick([1, 4, 2, 7]), { rounds: 2 });
  return d;
}

describe('invariant checker detects violations', () => {
  it('a sound game reports none', () => {
    const d = played();
    expect(checkInvariants(d.state, d.events)).toEqual([]);
  });

  it('Bookends out of place', () => {
    const d = played();
    const g = structuredClone(d.state) as Game;
    const start = Object.values(g.entries).find(
      (e) => e.kind === 'period' && e.bookend === 'start',
    )!;
    start.order = 'z9';
    expect(checkInvariants(g)).toEqual(
      expect.arrayContaining([
        'first Period is not the start Bookend',
        'last Period is not the end Bookend',
      ]),
    );
  });

  it('orphaned Events and Scenes', () => {
    const d = played();
    const g = structuredClone(d.state) as Game;
    const ev = Object.values(g.entries).find((e) => e.kind === 'event')!;
    const sc = Object.values(g.entries).find((e) => e.kind === 'scene')!;
    if (ev.kind === 'event') ev.periodId = 'ghost';
    if (sc.kind === 'scene') sc.eventId = 'ghost';
    const v = checkInvariants(g);
    expect(v).toContain(`event ${ev.id} has no Period`);
    expect(v).toContain(`scene ${sc.id} has no Event`);
  });

  it('too many Legacies and turns over the cap', () => {
    const d = played();
    const g = structuredClone(d.state) as Game;
    g.legacies = Array.from({ length: 7 }, (_, i) => ({
      id: `l${i}`,
      text: 'x',
      seatId: 's',
      addedInRound: 1,
    }));
    g.settings.cohesionCap = 0;
    const v = checkInvariants(g);
    expect(v).toContain('more than 6 Legacies');
    expect(v.some((x) => /exceeds the turn cap/.test(x))).toBe(true);
  });

  it('a repeated card before a reshuffle, a seq gap, and a locked fact edited outside a retcon', () => {
    const d = played();
    const card = {
      ...d.events[0]!,
      type: 'CardDrawn',
      payload: {
        purpose: 'x',
        deckId: 'd',
        cardId: 'c1',
        reversed: false,
        keyword: 'k',
        rng: [0, 0, 0, 0],
      },
    } as GameEvent;
    const committed = d.events.find((e) => e.type === 'TurnCommitted')!;
    const entryId = committed.type === 'TurnCommitted' ? committed.payload.entryId : '';
    const edit = {
      ...d.events[0]!,
      type: 'EntryProseEdited',
      payload: { entryId, prose: 'sneaky' },
    } as GameEvent;
    const events = [...d.events, { ...card, seq: 999 }, card, edit];
    const v = checkInvariants(d.state, events);
    expect(v).toContain('card c1 drawn twice before reshuffle');
    expect(v.some((x) => x.startsWith('seq gap'))).toBe(true);
    expect(v).toContain(`EntryProseEdited modified locked entry ${entryId}`);
  });

  it('a reshuffle clears the drawn set', () => {
    const d = played();
    const card = {
      ...d.events[0]!,
      type: 'CardDrawn',
      payload: {
        purpose: 'x',
        deckId: 'd',
        cardId: 'c1',
        reversed: false,
        keyword: 'k',
        rng: [0, 0, 0, 0],
      },
    } as GameEvent;
    const shuffle = {
      ...d.events[0]!,
      type: 'DeckReshuffled',
      payload: { deckId: 'd', rng: [0, 0, 0, 0] },
    } as GameEvent;
    const events = [card, shuffle, card].map((e, i) => ({ ...e, seq: i + 1 })) as GameEvent[];
    expect(checkInvariants(d.state, events).filter((x) => x.includes('drawn twice'))).toEqual([]);
  });
});

describe('soft Lens checks', () => {
  it.each([
    ['After 300 years of rain', true],
    ['The 3rd century', true],
    ['Two decades later', false],
    ['In 1492 AD', true],
    ['12 BCE', true],
    ['A thousand years', false],
    ['Room 101', false],
    ['1,000 years', true],
    ['The Seven Towers', false],
  ])('hasConcreteDate(%j) = %s', (text, hit) => expect(hasConcreteDate(text)).toBe(hit));

  it.each([
    ['', 0],
    ['  one  two ', 2],
    ['a [[REVERSAL: x y z]] b', 2],
  ])('wordCount(%j) = %i', (t, n) => expect(wordCount(t)).toBe(n));

  it('flags dates, budget overruns, immortals and mortals spanning Periods', () => {
    const d = readyForTurn();
    d.run({ type: 'CreateCharacter', name: 'Wanderer', description: '' });
    d.run({ type: 'CreateCharacter', name: 'Old Mother', description: '', immortal: true });
    const [wanderer] = Object.keys(d.state.characters);
    // Two Scenes in different Periods both requiring the mortal Wanderer.
    const s = d.state.settings;
    const settingsOff = {
      ...s,
      modes: { ...s.modes, placement: 'off' as const, cohesion: 'off' as const },
    };
    d.run({ type: 'ChangeSettings', settings: settingsOff });
    const addScene = (eventParent: string, title: string, prose: string) => {
      d.run({ type: 'StartTurn' });
      d.run({
        type: 'CreateEntry',
        kind: 'scene',
        title,
        placement: { parentId: eventParent, index: 0 },
        scene: {
          question: 'q',
          form: 'played',
          requiredCharacterIds: [wanderer!],
          budget: { min: 1, max: 3 },
        },
      });
      d.run({ type: 'EditProse', entryId: d.state.turn!.entryId!, prose });
      d.run({ type: 'ResolveScene', entryId: d.state.turn!.entryId!, answer: 'a' });
    };
    const ev1 = Object.values(d.state.entries).find((e) => e.kind === 'event')!;
    addScene(ev1.id, 'In 1200 AD', 'one two three four five');
    d.run({ type: 'StartTurn' });
    const firstPassPeriod = Object.values(d.state.entries).find(
      (e) => e.kind === 'period' && !e.bookend,
    )!;
    d.run({
      type: 'CreateEntry',
      kind: 'event',
      title: 'Elsewhere',
      placement: { parentId: firstPassPeriod.id, index: 0 },
    });
    d.run({ type: 'CommitTurn' });
    const ev2 = Object.values(d.state.entries).find((e) => e.title === 'Elsewhere')!;
    addScene(ev2.id, 'Later', 'ok');
    const codes = softWarnings(d.state).map((w) => w.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'concrete-date',
        'scene-budget',
        'immortal-character',
        'character-spans-periods',
      ]),
    );
    expect(softWarnings(d.state).find((w) => w.code === 'scene-budget')!.message).toMatch(
      /5 words; budget is 1–3/,
    );
    expect(startPeriod(d)).toBeDefined();
  });
});

describe('Chronicle edge cases', () => {
  const chronicle = () => {
    const d = new Driver();
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'chronicle',
      seed: '00112233445566778899aabbccddeeff',
    });
    d.run({
      type: 'SetSubject',
      subject: { name: 'Light', description: 'd', traits: ['a', 'b', 'c'] },
    });
    return d;
  };

  it('Bookend anchors: existing characters, missing ones, and one mortal on both ends', () => {
    const d = chronicle();
    d.run({ type: 'CreateCharacter', name: 'Eternal', description: '', immortal: true });
    d.run({ type: 'CreateCharacter', name: 'Mortal', description: '' });
    const [eternal, mortal] = Object.keys(d.state.characters);
    const b = (anchor: object) => ({ title: 't', prose: '', tone: 'light' as const, anchor });
    expect(
      d.rejection({
        type: 'SetBookends',
        start: b({ characterId: 'ghost' }),
        end: b({ name: 'x' }),
      }).code,
    ).toBe('not-found');
    expect(
      d.rejection({
        type: 'SetBookends',
        start: { title: 't', prose: '', tone: 'light' },
        end: b({ name: 'x' }),
      }).code,
    ).toBe('chronicle');
    expect(
      d.rejection({
        type: 'SetBookends',
        start: b({ characterId: mortal }),
        end: b({ characterId: mortal }),
      }).message,
    ).toMatch(/both Bookends/);
    d.run({
      type: 'SetBookends',
      start: b({ characterId: eternal }),
      end: b({ characterId: eternal }),
    });
    expect(d.state.characters[eternal!]!.entryIds).toHaveLength(2);
  });

  it('SetSubject only in Chronicle and only before Bookends', () => {
    const lens = new Driver();
    lens.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    expect(
      lens.rejection({
        type: 'SetSubject',
        subject: { name: 'x', description: 'd', traits: ['a', 'b', 'c'] },
      }).code,
    ).toBe('wrong-phase');
    const d = chronicle();
    d.run({
      type: 'SetBookends',
      start: { title: 's', prose: '', tone: 'light', anchor: { name: 'A' } },
      end: { title: 'e', prose: '', tone: 'dark', anchor: { name: 'B' } },
    });
    expect(
      d.rejection({
        type: 'SetSubject',
        subject: { name: 'x', description: 'd', traits: ['a', 'b', 'c'] },
      }).code,
    ).toBe('wrong-phase');
  });

  it('a Change invalidated by an earlier insertion is skipped when rendering the Subject', () => {
    const d = new Driver();
    setupGame(d, {
      ruleset: 'chronicle',
      settings: (s) => ({ ...s, modes: { ...s.modes, placement: 'off', cohesion: 'off' } }),
    });
    d.run({ type: 'StartRound' });
    if (!d.state.rounds[0]!.focus) d.run({ type: 'SetFocus', text: 'f' });
    // Later Period removes "lonely"; then an earlier Period is inserted that also removes it.
    d.run({ type: 'StartTurn' });
    d.run({
      type: 'CreateEntry',
      kind: 'period',
      title: 'Late',
      placement: { parentId: null, index: 2 },
      anchor: { name: 'L' },
      change: { op: 'remove', trait: 'lonely' },
    });
    d.run({ type: 'CommitTurn' });
    d.run({ type: 'StartTurn' });
    d.run({
      type: 'CreateEntry',
      kind: 'period',
      title: 'Early',
      placement: { parentId: null, index: 1 },
      anchor: { name: 'E' },
      change: { op: 'remove', trait: 'lonely' },
    });
    const late = Object.values(d.state.entries).find((e) => e.title === 'Late')!;
    const { skipped } = traitsAt(d.state, null);
    expect(skipped).toEqual([late.id]);
    expect(subjectAt(d.state, late.id)!.traits).not.toContain('lonely');
    expect(subjectAt(d.state, 'ghost')).toBeUndefined();
  });

  it('modify rejects a target that already exists and an empty replacement', () => {
    const d = new Driver();
    setupGame(d, {
      ruleset: 'chronicle',
      settings: (s) => ({ ...s, modes: { ...s.modes, placement: 'off' } }),
    });
    d.run({ type: 'StartRound' });
    if (!d.state.rounds[0]!.focus) d.run({ type: 'SetFocus', text: 'f' });
    d.run({ type: 'StartTurn' });
    const base = {
      type: 'CreateEntry',
      kind: 'period',
      title: 'P',
      placement: { parentId: null, index: 1 },
      anchor: { name: 'X' },
    } as const;
    expect(
      d.rejection({ ...base, change: { op: 'modify', from: 'tall', to: 'lonely' } }).message,
    ).toMatch(/already present/);
    expect(
      d.rejection({ ...base, change: { op: 'modify', from: 'tall', to: ' ' } }).message,
    ).toMatch(/needs a new trait/);
    expect(d.rejection({ ...base, change: { op: 'add', trait: '' } }).message).toMatch(
      /needs a trait/,
    );
  });
});

describe('retcon targets', () => {
  it('retcons Legacy text and character fields, applied by the reducer', () => {
    const d = new Driver();
    setupGame(d);
    autoplay(d, cyclePick([3, 1]), { rounds: 1 });
    const legacy = d.state.legacies[0]!;
    d.run({
      type: 'Retcon',
      targetId: legacy.id,
      field: 'text',
      after: 'The drowned bell',
      reason: 'r',
    });
    expect(d.state.legacies[0]!.text).toBe('The drowned bell');
    expect(
      d.rejection({ type: 'Retcon', targetId: legacy.id, field: 'seatId', after: 'x', reason: 'r' })
        .code,
    ).toBe('invalid');
    d.run({ type: 'CreateCharacter', name: 'Ada', description: '' });
    const ada = Object.keys(d.state.characters)[0]!;
    d.run({ type: 'Retcon', targetId: ada, field: 'name', after: 'Adah', reason: 'spelling' });
    d.run({
      type: 'Retcon',
      targetId: ada,
      field: 'immortal',
      after: 'yes',
      reason: 'she endures',
    });
    expect(d.state.characters[ada]).toMatchObject({ name: 'Adah', immortal: true });
    expect(
      d.rejection({ type: 'Retcon', targetId: ada, field: 'entryIds', after: [], reason: 'r' })
        .code,
    ).toBe('invalid');
    expect(
      d.rejection({ type: 'Retcon', targetId: d.state.id, field: 'title', after: 'x', reason: 'r' })
        .code,
    ).toBe('invalid');
    expect(
      d.rejection({ type: 'Retcon', targetId: 'ghost', field: 'title', after: 'x', reason: 'r' })
        .code,
    ).toBe('not-found');
    expect(replay(d.events)).toEqual(d.state);
  });

  it('only locked entries are retconned, and only while a Scene field fits', () => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'scene' });
    d.run({
      type: 'CreateEntry',
      kind: 'scene',
      title: 's',
      placement: d.state.turn!.rolled.placement!.placement,
      scene: { question: 'q', form: 'played' },
    });
    const id = d.state.turn!.entryId!;
    expect(
      d.rejection({ type: 'Retcon', targetId: id, field: 'title', after: 'x', reason: 'r' }).code,
    ).toBe('wrong-phase');
    d.run({ type: 'EditProse', entryId: id, prose: 'p' });
    d.run({ type: 'ResolveScene', entryId: id, answer: 'a' });
    d.run({ type: 'Retcon', targetId: id, field: 'question', after: 'Who?', reason: 'r' });
    d.run({ type: 'Retcon', targetId: id, field: 'answer', after: 'Nobody.', reason: 'r' });
    expect(d.state.entries[id]).toMatchObject({ question: 'Who?', answer: 'Nobody.' });
  });
});

describe('small helpers', () => {
  it('seedFromBytes renders 16 bytes as 32 hex characters usable as a seed', () => {
    const seed = seedFromBytes(new Uint8Array([0, 1, 2, 255, ...new Array(12).fill(16)]));
    expect(seed).toMatch(/^000102ff(10){12}$/);
    expect(seedToState(seed)).toHaveLength(4);
  });
  it.each([
    [0, 1],
    [1, 1],
    [5, 5],
    [9, 9],
    [12, 9],
  ])('clampDial(%i) = %i', (a, b) => expect(clampDial(a)).toBe(b));
  it('describes placements in words', () => {
    const d = readyForTurn();
    const sp = startPeriod(d);
    expect(describePlacement(d.state, 'period', { parentId: null, index: 1 })).toMatch(
      /^between “Fishers settle the delta” and /,
    );
    expect(describePlacement(d.state, 'event', { parentId: sp.id, index: 0 })).toBe(
      'in “Fishers settle the delta”, at the start',
    );
    expect(describePlacement(d.state, 'event', { parentId: sp.id, index: 1 })).toBe(
      'in “Fishers settle the delta”, at the end',
    );
    const fp = Object.values(d.state.entries).find((e) => e.kind === 'period' && !e.bookend)!;
    expect(describePlacement(d.state, 'event', { parentId: fp.id, index: 0 })).toBe(
      'in “First pass period 0”, first',
    );
  });
});

describe('small helpers (2)', () => {
  it('describes each kind of trait Change', async () => {
    const { describeChange } = await import('..');
    expect(describeChange({ op: 'add', trait: 'x' })).toBe('+ x');
    expect(describeChange({ op: 'remove', trait: 'x' })).toBe('− x');
    expect(describeChange({ op: 'modify', from: 'a', to: 'b' })).toBe('a → b');
  });
  it('a seat’s own Focus mode overrides the game defaults', async () => {
    const { defaultSettings, focusModeFor } = await import('..');
    const s = defaultSettings();
    const seat = {
      id: 's',
      name: 'S',
      kind: 'phantom' as const,
      tables: [],
      placementBias: 'uniform' as const,
    };
    expect(focusModeFor(s, seat)).toBe('enforce');
    expect(focusModeFor(s, { ...seat, focusMode: 'off' })).toBe('off');
    expect(focusModeFor(s, { ...seat, kind: 'player' })).toBe('off');
  });
});
