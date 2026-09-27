import type { EntryKind, Game, PlacementBias } from './types';
import { legalSlots, type Slot } from './timeline';

const SPARSE_SCALE = 2520;

export function weightedSlots(
  g: Game,
  kind: EntryKind,
  bias: PlacementBias,
): { slot: Slot; weight: number }[] {
  const slots = legalSlots(g, kind);
  const n = slots.length;
  return slots.map((slot, r) => {
    switch (bias) {
      case 'uniform':
        return { slot, weight: 1 };
      case 'early':
        return { slot, weight: n - r };
      case 'late':
        return { slot, weight: r + 1 };
      case 'sparse':
        return { slot, weight: Math.max(1, Math.round(SPARSE_SCALE / (1 + slot.density))) };
    }
  });
}
