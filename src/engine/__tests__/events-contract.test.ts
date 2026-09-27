import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, HANDLED_EVENT_TYPES } from '..';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

describe('event contract', () => {
  it('the reducer handles every event type', () => {
    expect([...HANDLED_EVENT_TYPES].sort()).toEqual([...EVENT_TYPES].sort());
  });
  it('docs/events.md documents every event type', () => {
    const doc = fs.readFileSync(path.join(root, 'docs/events.md'), 'utf8');
    const missing = EVENT_TYPES.filter((t) => !new RegExp(`^### \`${t}\``, 'm').test(doc));
    expect(missing).toEqual([]);
  });
});
