import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoplay, cyclePick, setupGame } from '../../tests/support/autoplay';
import { Driver } from '../../tests/support/driver';
import { withModes } from '../../tests/support/fixtures';
import {
  parseGameFile,
  playOrderManuscript,
  rewriteGameId,
  statsFooter,
  toGameFile,
  toneMark,
} from '.';
import { migrateEvents } from '../../tests/support/migrate';

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '../../tests/fixtures/lens-3-rounds.json',
    ),
    'utf8',
  ),
);

describe('game file parsing', () => {
  it('rejects wrong format, seq gaps and foreign events with paths', () => {
    expect(parseGameFile({ format: 'nope' }, migrateEvents).ok).toBe(false);
    const bad = structuredClone(fixture);
    bad.events[3].seq = 99;
    bad.events[4].gameId = 'other';
    const r = parseGameFile(bad, migrateEvents);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual(
        expect.arrayContaining([
          'events.3.seq: expected seq 4',
          'events.4.gameId: event belongs to another game',
        ]),
      );
    }
  });

  it('reports migration and replay failures', () => {
    const r = parseGameFile(fixture, () => {
      throw new Error('schema 9 is newer');
    });
    expect(r).toEqual({ ok: false, errors: ['replay failed: schema 9 is newer'] });
  });

  it('reports invariant violations in an otherwise well-formed log', () => {
    const f = structuredClone(fixture);
    const drawn = {
      ...f.events[f.events.length - 1],
      type: 'CardDrawn',
      payload: {
        purpose: 'x',
        deckId: 'test-deck',
        cardId: 'M0',
        reversed: false,
        keyword: 'k',
        rng: [1, 2, 3, 4],
      },
    };
    f.events.push({ ...drawn, seq: f.events.length + 1, batch: f.events.length + 1 });
    f.events.push({ ...drawn, seq: f.events.length + 1, batch: f.events.length + 1 });
    const r = parseGameFile(f, migrateEvents);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/drawn twice/);
  });

  it('rewriteGameId re-keys every event, the creation payload and game-level retcons', () => {
    const d = new Driver();
    setupGame(d);
    d.run({ type: 'StartRound' });
    d.run({
      type: 'Retcon',
      targetId: d.state.id,
      field: 'bigPicture',
      after: 'Different.',
      reason: 'r',
    });
    const out = rewriteGameId(d.events, 'NEW');
    expect(out.every((e) => e.gameId === 'NEW')).toBe(true);
    const created = out[0]!;
    expect(created.type === 'GameCreated' && created.payload.id).toBe('NEW');
    const retcon = out.at(-1)!;
    expect(retcon.type === 'Retconned' && retcon.payload.targetId).toBe('NEW');
    expect(rewriteGameId([], 'x')).toEqual([]);
  });
});

describe('manuscript branches', () => {
  it('play order describes every kind of override and eviction in words', () => {
    const d = new Driver();
    setupGame(d, {
      settings: withModes({
        cohesion: 'prompt',
        'legacy.evict': 'prompt',
        'legacy.explore': 'prompt',
        'scene.reversal': 'prompt',
        'focus.sourcePhantom': 'prompt',
        tone: 'prompt',
      }),
    });
    autoplay(d, cyclePick([0, 3, 0, 1, 0, 2, 0, 4, 0, 5]), { rounds: 8, maxSteps: 5000 });
    const md = playOrderManuscript(d.events);
    expect(md).toMatch(/Legacy removed:\*\* legacy/);
    const overrides = md.split('\n').filter((l) => l.startsWith('- ✎ override'));
    expect(overrides.length).toBeGreaterThan(0);
    for (const l of overrides) expect(l).not.toMatch(/\{|\[object/);
    const mechanics = new Set(overrides.map((l) => l.split(':')[0]!.replace('- ✎ override ', '')));
    expect(mechanics.size).toBeGreaterThan(1);
    expect(md).not.toMatch(/undefined/);
  });

  it('the stats footer handles an empty game and singulars', () => {
    const d = new Driver();
    d.run({
      type: 'CreateGame',
      id: 'g',
      title: 'T',
      ruleset: 'lens',
      seed: '00112233445566778899aabbccddeeff',
    });
    expect(statsFooter(d.state)).toMatch(
      /Rounds: 0 · 0 periods \(0 ○, 0 ●\), 0 events .* Words: 0/,
    );
    d.run({ type: 'SetBigPicture', text: 'x' });
    d.run({
      type: 'SetBookends',
      start: { title: 'a', prose: 'one two', tone: 'light' },
      end: { title: 'b', prose: '', tone: 'dark' },
    });
    expect(statsFooter(d.state)).toMatch(/2 periods \(1 ○, 1 ●\).*Words: 2/);
    expect(toneMark('light')).toBe('○');
    expect(toneMark('dark')).toBe('●');
  });

  it('a game file carries its schema version', () => {
    const d = new Driver();
    setupGame(d);
    expect(toGameFile(d.state, d.events, 'now')).toMatchObject({
      format: 'solo-microscope/game',
      schemaVersion: 2,
      gameId: 'game1',
      exportedAt: 'now',
    });
  });
});

describe('group games in the play-order manuscript', () => {
  it('credits each Oracle question to the seat that asked it', () => {
    const d = new Driver();
    setupGame(d, { players: 2 });
    d.run({ type: 'StartRound' });
    d.run({ type: 'AskOracle', question: 'Will it rain?', odds: 5, askedBy: 'player2' });
    d.run({ type: 'AskOracle', question: 'Unattributed?', odds: 5 });
    const md = playOrderManuscript(d.events);
    expect(md).toMatch(/Oracle: “Will it rain\?”.* \*\(asked by Player 2\)\*/);
    expect(md).toContain('Oracle: “Unattributed?”');
    expect(md).not.toMatch(/Unattributed\?”[^\n]*asked by/);
  });
});
