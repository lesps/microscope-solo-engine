import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PACKS,
  STARTER_PACK,
  STARTUP_SAMPLE_PACK,
  buildContent,
  collisions,
  type Pack,
} from '.';

const withIds = (p: Pack, id: string, name = p.name): Pack => ({ ...p, id, name });

describe('bundled packs', () => {
  it('ships the starter pack and the startup sample, in that order', () => {
    expect(BUNDLED_PACKS.map((p) => p.id)).toEqual(['starter', 'startup-sample']);
    expect(STARTUP_SAMPLE_PACK.license).toBe('CC0-1.0');
  });
});

describe('buildContent', () => {
  it('merges groups, seeds and generators, tagging each with its pack', () => {
    const c = buildContent([STARTER_PACK, STARTUP_SAMPLE_PACK]);
    expect(c.seeds['salt-road']).toMatchObject({
      title: 'The Salt Road',
      packId: 'startup-sample',
      packName: 'Startup sample',
    });
    expect(c.generators.crossroads).toMatchObject({ name: 'Crossroads', packId: 'startup-sample' });
    expect(c.groups.frontiers).toMatchObject({ name: 'Frontiers', packId: 'startup-sample' });
    expect(c.tables['crossroads.trend']?.category).toBe('generator');
    expect(Object.keys(c.tables)).toContain('starter.domains');
  });

  it('the first pack to define an id wins', () => {
    const other: Pack = {
      ...withIds(STARTUP_SAMPLE_PACK, 'other', 'Other'),
      seeds: [{ ...STARTUP_SAMPLE_PACK.seeds[0]!, title: 'Impostor' }],
      generators: [{ ...STARTUP_SAMPLE_PACK.generators[0]!, name: 'Impostor' }],
      groups: [{ ...STARTUP_SAMPLE_PACK.groups[0]!, name: 'Impostor' }],
    };
    const c = buildContent([STARTUP_SAMPLE_PACK, other]);
    expect(c.seeds['salt-road']!.title).toBe('The Salt Road');
    expect(c.generators.crossroads!.name).toBe('Crossroads');
    expect(c.groups.frontiers!.name).toBe('Frontiers');
    expect(buildContent([other, STARTUP_SAMPLE_PACK]).seeds['salt-road']!.title).toBe('Impostor');
  });

  it('empty input gives empty content', () => {
    expect(buildContent([])).toEqual({
      tables: {},
      decks: {},
      groups: {},
      seeds: {},
      generators: {},
    });
  });
});

describe('collisions', () => {
  it('reports seed, generator, group, table and deck ids used by another pack', () => {
    const copy = withIds(STARTUP_SAMPLE_PACK, 'copy');
    expect(collisions(copy, [STARTER_PACK, STARTUP_SAMPLE_PACK]).sort()).toEqual(
      [
        'crossroads',
        'crossroads.a',
        'crossroads.b',
        'crossroads.impact',
        'crossroads.trend',
        'frontiers',
        'salt-road',
      ].sort(),
    );
  });
  it('a pack does not collide with its own installed copy', () => {
    expect(collisions(STARTUP_SAMPLE_PACK, [STARTUP_SAMPLE_PACK])).toEqual([]);
  });
});
