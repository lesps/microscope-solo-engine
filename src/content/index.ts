import type { Content } from '../engine';
import starterJson from './packs/starter/starter.json';
import startupSampleJson from './packs/startup-sample/startup-sample.json';
import { validatePack, type Pack } from './schemas';

export * from './schemas';

function bundled(json: unknown, name: string): Pack {
  const r = validatePack(json);
  if (!r.ok) throw new Error(`${name} pack is invalid: ${JSON.stringify(r.errors)}`);
  return r.pack;
}

export const STARTER_PACK: Pack = bundled(starterJson, 'starter');
export const STARTUP_SAMPLE_PACK: Pack = bundled(startupSampleJson, 'startup sample');
/** Packs shipped with the app: installed on first load, refreshed from the build, never removable. */
export const BUNDLED_PACKS: readonly Pack[] = [STARTER_PACK, STARTUP_SAMPLE_PACK];

/** Merge packs into the engine's content index. Later packs cannot shadow earlier ids. */
export function buildContent(packs: readonly Pack[]): Content {
  const content: Content = { tables: {}, decks: {}, groups: {}, seeds: {}, generators: {} };
  for (const p of packs) {
    const from = { packId: p.id, packName: p.name };
    for (const t of p.tables) content.tables[t.id] ??= t;
    for (const d of p.decks) content.decks[d.id] ??= d as Content['decks'][string];
    for (const g of p.groups) content.groups[g.id] ??= { ...g, ...from };
    for (const s of p.seeds) content.seeds[s.id] ??= { ...s, ...from };
    for (const g of p.generators) content.generators[g.id] ??= { ...g, ...from };
  }
  return content;
}

function ids(p: Pack): string[] {
  return [p.tables, p.decks, p.groups, p.seeds, p.generators].flatMap((xs) => xs.map((x) => x.id));
}

/** Ids in `pack` that collide with already-installed packs. */
export function collisions(pack: Pack, installed: readonly Pack[]): string[] {
  const taken = new Set(installed.filter((p) => p.id !== pack.id).flatMap(ids));
  return ids(pack).filter((id) => taken.has(id));
}
