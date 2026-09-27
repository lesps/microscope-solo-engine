import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replay } from '../src/engine';
import {
  chronologicalManuscript,
  outline,
  parseGameFile,
  playOrderManuscript,
  toGameFile,
} from '../src/export';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');

describe.each(['lens-3-rounds', 'chronicle-3-rounds'])('golden: %s', (name) => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
  const parsed = parseGameFile(raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const { file, state } = parsed;

  it('replays to the snapshot state', async () => {
    await expect(JSON.stringify(state, null, 1)).toMatchFileSnapshot(
      `./__snapshots__/${name}.state.json`,
    );
  });
  it('chronological manuscript', async () => {
    await expect(chronologicalManuscript(state)).toMatchFileSnapshot(
      `./__snapshots__/${name}.chronological.md`,
    );
  });
  it('play-order manuscript, with and without rolls', async () => {
    await expect(playOrderManuscript(file.events)).toMatchFileSnapshot(
      `./__snapshots__/${name}.play-order.md`,
    );
    const bare = playOrderManuscript(file.events, { rolls: false });
    expect(bare).not.toMatch(/🎲/);
    expect(bare.length).toBeLessThan(playOrderManuscript(file.events).length);
  });
  it('outline', async () => {
    await expect(outline(state)).toMatchFileSnapshot(`./__snapshots__/${name}.outline.md`);
  });
  it('game file round-trips to an identical state', () => {
    const again = parseGameFile(JSON.parse(JSON.stringify(toGameFile(state, file.events, 'x'))));
    expect(again.ok && again.state).toEqual(state);
    expect(replay(file.events)).toEqual(state);
  });
});
