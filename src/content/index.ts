import type { Content } from '../engine';
import starterJson from './packs/starter/starter.json';
import { validatePack, type Pack } from './schemas';

export * from './schemas';

const starterResult = validatePack(starterJson);
if (!starterResult.ok)
  throw new Error(`starter pack is invalid: ${JSON.stringify(starterResult.errors)}`);
export const STARTER_PACK: Pack = starterResult.pack;

/** Merge packs into the engine's content index. Later packs cannot shadow earlier ids. */
export function buildContent(packs: Pack[]): Content {
  const content: Content = { tables: {}, decks: {} };
  for (const p of packs) {
    for (const t of p.tables) if (!content.tables[t.id]) content.tables[t.id] = t;
    for (const d of p.decks)
      if (!content.decks[d.id]) content.decks[d.id] = d as Content['decks'][string];
  }
  return content;
}

/** Ids in `pack` that collide with already-installed packs. */
export function collisions(pack: Pack, installed: Pack[]): string[] {
  const taken = new Set(
    installed
      .filter((p) => p.id !== pack.id)
      .flatMap((p) => [...p.tables.map((t) => t.id), ...p.decks.map((d) => d.id)]),
  );
  return [...pack.tables.map((t) => t.id), ...pack.decks.map((d) => d.id)].filter((id) =>
    taken.has(id),
  );
}
