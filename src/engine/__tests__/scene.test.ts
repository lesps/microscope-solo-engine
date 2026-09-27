import { describe, expect, it } from 'vitest';
import { readyForTurn, withModes } from '../../../tests/support/fixtures';
import type { Driver } from '../../../tests/support/driver';
import { reversalMarker, wordCount, type Scene, type Settings } from '..';

function openScene(
  d: Driver,
  frame: Partial<{
    question: string;
    requiredCharacterIds: string[];
    bannedCharacterIds: string[];
  }> = {},
) {
  d.run({ type: 'StartTurn' });
  d.run({ type: 'RollPlacement', kind: 'scene' });
  d.run({
    type: 'CreateEntry',
    kind: 'scene',
    title: 'The toll',
    placement: d.state.turn!.rolled.placement!.placement,
    scene: { question: 'Who pays the toll?', form: 'played', ...frame },
  });
  return d.state.turn!.entryId!;
}
const scene = (d: Driver, id: string) => d.state.entries[id] as Scene;
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('Scene frame', () => {
  it('creates the Scene with a locked-to-be Question and default budget', () => {
    const d = readyForTurn();
    const id = openScene(d);
    expect(scene(d, id)).toMatchObject({
      question: 'Who pays the toll?',
      form: 'played',
      budget: { min: 300, max: 900 },
      locked: false,
    });
  });
  it.each([
    [{ question: '' }, 'invalid'],
    [{ question: 'x'.repeat(141) }, 'invalid'],
    [{ requiredCharacterIds: ['a', 'b', 'c'] }, 'invalid'],
    [{ bannedCharacterIds: ['a', 'b'] }, 'invalid'],
    [{ requiredCharacterIds: ['ghost'] }, 'not-found'],
  ])('rejects frame %j', (frame, code) => {
    const d = readyForTurn();
    d.run({ type: 'StartTurn' });
    d.run({ type: 'RollPlacement', kind: 'scene' });
    expect(
      d.rejection({
        type: 'CreateEntry',
        kind: 'scene',
        title: 't',
        placement: d.state.turn!.rolled.placement!.placement,
        scene: { question: 'q', form: 'played', ...frame },
      }).code,
    ).toBe(code);
  });
  it('may be reframed before drafting starts but not after', () => {
    const d = readyForTurn();
    const id = openScene(d);
    d.run({
      type: 'FrameScene',
      entryId: id,
      frame: { question: 'Who really pays?', form: 'dictated' },
    });
    expect(scene(d, id).question).toBe('Who really pays?');
    d.run({ type: 'EditProse', entryId: id, prose: 'Rain.' });
    expect(
      d.rejection({ type: 'FrameScene', entryId: id, frame: { question: 'x', form: 'played' } })
        .code,
    ).toBe('wrong-phase');
  });
});

describe('Scene draft tools', () => {
  it('draws a three-card spread: setup, complication, pressure', () => {
    const d = readyForTurn();
    const id = openScene(d);
    const evs = d.run({ type: 'DrawSpread', entryId: id });
    expect(evs.map((e) => e.type === 'CardDrawn' && e.payload.role)).toEqual([
      'setup',
      'complication',
      'pressure',
    ]);
    expect(scene(d, id).spread).toHaveLength(3);
    expect(d.rejection({ type: 'DrawSpread', entryId: id }).code).toBe('already-rolled');
  });
  it('draws one reversal from the seat’s reversal tables and places it as a marker', () => {
    const d = readyForTurn();
    const id = openScene(d);
    d.run({ type: 'EditProse', entryId: id, prose: 'Before. After.' });
    d.run({ type: 'DrawReversal', entryId: id });
    const rolled = d.state.turn!.rolled.reversal!;
    expect(rolled.text).toMatch(/^reversal \d$/);
    expect(d.rejection({ type: 'DrawReversal', entryId: id }).code).toBe('already-rolled');
    d.run({ type: 'PlaceReversal', entryId: id, offset: 8 });
    expect(scene(d, id).prose).toBe(`Before. ${reversalMarker(rolled.text)}After.`);
    expect(scene(d, id).reversal).toMatchObject({ text: rolled.text, offset: 8 });
  });
  it('falls back to the deck when the seat has no reversal tables', () => {
    const d = readyForTurn((s: Settings) => ({
      ...s,
      activeTables: s.activeTables.filter((t) => t !== 't-reversal'),
    }));
    const id = openScene(d);
    const evs = d.run({ type: 'DrawReversal', entryId: id });
    expect(d.types(evs)).toEqual(['CardDrawn']);
  });
  it('prompt: a replaced reversal is an override; enforce: it is not allowed', () => {
    const d = readyForTurn();
    const id = openScene(d);
    d.run({ type: 'DrawReversal', entryId: id });
    expect(
      d.types(d.run({ type: 'PlaceReversal', entryId: id, offset: 0, text: 'my own twist' })),
    ).toEqual(['OverrideUsed', 'ReversalPlaced']);
    const e = readyForTurn(withModes({ 'scene.reversal': 'enforce' }));
    const id2 = openScene(e);
    e.run({ type: 'DrawReversal', entryId: id2 });
    expect(e.rejection({ type: 'PlaceReversal', entryId: id2, offset: 0, text: 'mine' }).code).toBe(
      'enforced',
    );
  });
  it('asks the oracle and attaches the call to the Scene', () => {
    const d = readyForTurn();
    const id = openScene(d);
    const evs = d.run({ type: 'AskOracle', question: 'Is the gate open?', odds: 5, entryId: id });
    expect(d.types(evs)).toEqual(['RollMade', 'RollMade', 'OracleAsked']);
    expect(scene(d, id).oracleCalls[0]).toMatchObject({ question: 'Is the gate open?', odds: 5 });
  });
});

describe('ResolveScene', () => {
  it('may not commit an empty draft', () => {
    const d = readyForTurn();
    const id = openScene(d);
    expect(d.rejection({ type: 'ResolveScene', entryId: id, answer: 'Nobody.' }).message).toMatch(
      /empty/,
    );
  });
  it('locks the answer and commits the turn; CommitTurn is not used for Scenes', () => {
    const d = readyForTurn();
    const id = openScene(d);
    d.run({ type: 'EditProse', entryId: id, prose: words(10) });
    expect(d.rejection({ type: 'CommitTurn' }).code).toBe('wrong-phase');
    const evs = d.run({ type: 'ResolveScene', entryId: id, answer: 'The ferryman.' });
    expect(d.types(evs).slice(0, 2)).toEqual(['SceneResolved', 'TurnCommitted']);
    expect(scene(d, id)).toMatchObject({
      answer: 'The ferryman.',
      locked: true,
      playProse: words(10),
    });
  });
  it('word budget warns by default and blocks when enforced', () => {
    const d = readyForTurn(
      withModes(
        {},
        {
          scene: {
            budget: 'enforce',
            pause: false,
            pauseSeconds: 60,
            defaultBudget: { min: 5, max: 8 },
          },
        },
      ),
    );
    const id = openScene(d);
    d.run({ type: 'EditProse', entryId: id, prose: words(3) });
    expect(d.rejection({ type: 'ResolveScene', entryId: id, answer: 'a' }).message).toMatch(
      /budget/,
    );
    d.run({ type: 'EditProse', entryId: id, prose: words(6) });
    d.run({ type: 'ResolveScene', entryId: id, answer: 'a' });
    expect(wordCount(`a b ${reversalMarker('x y z')} c`)).toBe(3);
  });
  it('enforced reversal must be placed before resolving', () => {
    const d = readyForTurn(withModes({ 'scene.reversal': 'enforce' }));
    const id = openScene(d);
    d.run({ type: 'EditProse', entryId: id, prose: 'text' });
    expect(d.rejection({ type: 'ResolveScene', entryId: id, answer: 'a' }).message).toMatch(
      /reversal/,
    );
  });
  it('rejects banned characters in the answer’s cast and records appearances', () => {
    const d = readyForTurn();
    d.run({ type: 'CreateCharacter', name: 'Ada', description: 'a ferrywoman' });
    d.run({ type: 'CreateCharacter', name: 'Bo', description: 'a toll clerk' });
    const [ada, bo] = Object.keys(d.state.characters);
    const id = openScene(d, { requiredCharacterIds: [ada!], bannedCharacterIds: [bo!] });
    d.run({ type: 'EditProse', entryId: id, prose: 'text' });
    expect(
      d.rejection({ type: 'ResolveScene', entryId: id, answer: 'a', characterIds: [bo!] }).code,
    ).toBe('invalid');
    d.run({ type: 'ResolveScene', entryId: id, answer: 'a' });
    expect(d.state.characters[ada!]!.entryIds).toContain(id);
  });
});

describe('Revise', () => {
  it('changes prose only, keeps facts and the play-time draft', () => {
    const d = readyForTurn();
    const id = openScene(d);
    d.run({ type: 'EditProse', entryId: id, prose: 'draft one' });
    d.run({ type: 'ResolveScene', entryId: id, answer: 'Answer.' });
    const facts = (s: Scene) => ({
      q: s.question,
      a: s.answer,
      t: s.title,
      tone: s.tone,
      o: s.order,
    });
    const before = facts(scene(d, id));
    d.run({ type: 'ReviseProse', entryId: id, prose: 'draft two' });
    d.run({ type: 'ReviseProse', entryId: id, prose: 'draft three' });
    const s = scene(d, id);
    expect(facts(s)).toEqual(before);
    expect(s.playProse).toBe('draft one');
    expect(s.revisions.map((r) => r.prose)).toEqual(['draft one', 'draft two', 'draft three']);
    expect(d.rejection({ type: 'EditProse', entryId: id, prose: 'x' }).code).toBe('locked');
  });
});
