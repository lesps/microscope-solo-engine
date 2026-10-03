import type { Content, Id, Mode, Seat, Settings, Table } from './types';

export function defaultSettings(): Settings {
  return {
    modes: {
      tone: 'enforce',
      cohesion: 'enforce',
      'focus.source': 'off',
      'focus.sourcePhantom': 'enforce',
      entryType: 'off',
      placement: 'prompt',
      'palette.roll': 'prompt',
      'legacy.evict': 'off',
      'legacy.explore': 'prompt',
      'scene.reversal': 'prompt',
      'seed.answers': 'off',
    },
    drift: 'counter-trend',
    chaos: false,
    cohesionCap: 8,
    entryTypeWeights: { period: 25, event: 50, scene: 25 },
    focusSourceWeights: { legacy: 50, domain: 30, deck: 20 },
    activeTables: [],
    deck: { reversals: true, toneFromPip: false },
    oracle: { qualifiers: true },
    scene: {
      budget: 'warn',
      pause: false,
      pauseSeconds: 60,
      defaultBudget: { min: 300, max: 900 },
    },
    paletteRollCount: 2,
  };
}

export type PresetId = 'pure-lens' | 'default' | 'high-friction';

export const PRESETS: Record<PresetId, { name: string; apply: (s: Settings) => Settings }> = {
  'pure-lens': {
    name: 'Pure Lens',
    apply: (s) => ({
      ...s,
      modes: {
        tone: 'enforce',
        cohesion: 'enforce',
        'focus.source': 'off',
        'focus.sourcePhantom': 'off',
        entryType: 'off',
        placement: 'off',
        'palette.roll': 'off',
        'legacy.evict': 'off',
        'legacy.explore': 'off',
        'scene.reversal': 'off',
        'seed.answers': 'off',
      },
      drift: 'preference',
      chaos: false,
      deck: { ...s.deck, toneFromPip: false },
      oracle: { qualifiers: false },
      scene: { ...s.scene, pause: false, budget: 'warn' },
    }),
  },
  default: {
    name: 'Default',
    apply: (s) => ({ ...defaultSettings(), activeTables: s.activeTables }),
  },
  'high-friction': {
    name: 'High Friction',
    apply: (s) => ({
      ...defaultSettings(),
      activeTables: s.activeTables,
      modes: {
        tone: 'enforce',
        cohesion: 'enforce',
        'focus.source': 'enforce',
        'focus.sourcePhantom': 'enforce',
        entryType: 'enforce',
        placement: 'enforce',
        'palette.roll': 'enforce',
        'legacy.evict': 'enforce',
        'legacy.explore': 'enforce',
        'scene.reversal': 'enforce',
        'seed.answers': 'enforce',
      },
      chaos: true,
      scene: { ...defaultSettings().scene, budget: 'enforce', pause: true },
    }),
  },
};

export function focusModeFor(settings: Settings, seat: Seat): Mode {
  if (seat.focusMode) return seat.focusMode;
  return seat.kind === 'phantom'
    ? settings.modes['focus.sourcePhantom']
    : settings.modes['focus.source'];
}

export function clampDial(n: number): number {
  return Math.max(1, Math.min(9, n));
}

const tagsOf = (t: Table | undefined) => t?.tags ?? [];

/**
 * Active tables for a game linked to `groupIds`: every currently active untagged table (ids no
 * longer installed included), plus every non-generator table tagged with any of the groups.
 */
export function linkedActiveTables(content: Content, current: Id[], groupIds: Id[]): Id[] {
  const groups = new Set(groupIds);
  const kept = current.filter((id) => !tagsOf(content.tables[id]).length);
  const linked = Object.values(content.tables)
    .filter((t) => t.category !== 'generator' && t.tags?.some((g) => groups.has(g)))
    .map((t) => t.id);
  return [...new Set([...kept, ...linked])];
}

/** Every tag on a non-generator table, with the tables carrying it, in content order. */
export function tablesByTag(content: Content): Map<Id, Table[]> {
  const by = new Map<Id, Table[]>();
  for (const t of Object.values(content.tables)) {
    if (t.category === 'generator') continue;
    for (const tag of t.tags ?? []) by.set(tag, [...(by.get(tag) ?? []), t]);
  }
  return by;
}
