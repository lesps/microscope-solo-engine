# CLAUDE.md

Solo Microscope: a static, local-first React app for playing Microscope solo with the Lens hack.
Event-sourced; no backend. Rules as implemented: `docs/rules.md`. Events: `docs/events.md`.

## Commands

```sh
npm run dev | build | preview
npm run typecheck        # tsc, strict
npm run lint             # eslint incl. import boundaries
npm run format:check     # prettier (snapshots and fixtures excluded)
npm test                 # vitest: node project (engine, export, persistence, store, golden) + dom project (UI)
npm run test:coverage    # same with coverage thresholds — what CI runs
npm run test:mutation    # Stryker on src/engine (slow; nightly in CI)
npm run e2e              # playwright against vite preview; run `npm run build` first
BASE_PATH=/microscope-solo-engine/ npm run build && BASE_PATH=/microscope-solo-engine/ npm run e2e
UPDATE_FIXTURES=1 npx vitest run tests/fixtures/make-fixtures.test.ts   # re-record the schema-1 fixtures
UPDATE_SEED_FIXTURE=1 npx vitest run tests/fixtures/make-fixtures.test.ts  # re-record lens-seed-start
npx vitest run tests/golden.test.ts -u                                   # accept golden changes
UPDATE_SPLASH=1 npx vitest run tests/ios-splash.test.ts                  # re-render the iOS launch images
```

## Modules and the import rule

```
engine  ←  content  ←  export / persistence  ←  store  ←  ui
```

- `src/engine/` — pure TypeScript rules engine: types, rng, reducer, commands, placement, oracle,
  dials, chronicle, lint, undo, invariants. No DOM, storage, React, Dexie or Zustand; no `window`,
  `crypto`, `fetch` globals. Ids, time and content are injected through `Env`.
- `src/content/` — zod pack schema (version 3: tables with optional `slot` and `tags`, decks,
  groups, seeds, generators) and `BUNDLED_PACKS` (the starter pack and the startup sample), which
  the store installs and refreshes on every load; bundled packs can be disabled but not removed.
- `toolkits/` — three CC0 genre toolkit packs (full v3 and `import-now/` v1). User content, not
  bundled; `src/content/toolkit-schema.test.ts` keeps the two versions in step.
- `src/export/` — game file / bundle (zod), Markdown manuscripts. Pure functions of state or log.
- `src/persistence/` — Dexie (`solo-microscope` DB): games, events, snapshots, packs, meta;
  migrations; storage persistence API.
- `src/store/` — Zustand vanilla store, the only writer. Runs commands through the engine, appends
  events, handles undo, import/export, packs, backup reminder.
- `src/ui/` — React screens, components, hooks. Talks to the store, never to persistence.
  `src/ui/lib/standalone.ts` handles the installed app (iOS Home Screen): the `standalone` class on
  `<html>` that styles key off, and resuming the last route.
- `scripts/ios-splash.ts` — the iOS launch-image device list; a Vite plugin injects its `<link>`
  tags and `public/splash/` holds the PNGs.

ESLint (`eslint.config.js`) enforces these boundaries with `no-restricted-imports`; the engine also
has `no-restricted-globals`.

## Event-sourcing contract

- State is `events.reduce(apply, initialGame())`. The reducer is pure and deterministic; replaying
  the full log must deep-equal the live state (property-tested).
- Commands: `execute(state, command, env)` returns `{ ok, events, state }` or a typed
  `Rejection { code, message }`. Nothing else mutates state.
- Rolls are events. Draws go through the `Tx` helpers in `commands.ts`, which emit `RollMade` /
  `CardDrawn` with the result, the interpreted `value` and the generator state after the draw.
  Replay never calls the PRNG or reads content.
- Events carry `seq` (gapless) and `batch` (first seq of the command). Undo truncates the last batch
  only if it is in the open turn and contains no roll/draw events.
- Facts lock at `TurnCommitted`; after that only `Retconned` changes them. Prose changes by
  `ProseRevised`.
- A new event type needs: payload in `EventPayloads`, entry in `EVENT_TYPES`, a reducer handler, a
  reducer test and a section in `docs/events.md` (the contract test checks the last two).
- Game files carry `schemaVersion` (currently 2); migrations live in `src/persistence/migrations`.
  Stored logs are migrated and rewritten when a game loads (`loadGame`); imported files are
  migrated before payload validation (`parseGameFile` takes the migrate function). Schema 1 → 2
  adds the `seed.answers` mode, off.
- Startup commands (`RollSeedAnswer`, `ApplySeed`, `RollGenerator`, `AcceptGeneratorReading`) are
  valid only before the Bookends exist. Their events carry resolved text, never content ids to
  look up, so replay stays content-free. `ApplySeed` and `AcceptGeneratorReading` link the game to
  their group's tagged tables with a `SettingsChanged` in the same batch (only when the active
  tables change); `linkedActiveTables` in `settings.ts` computes the list for that and the UI.

## Mechanic-mode pattern

Every random mechanic has a `Mode` in `settings.modes`: `off` (player chooses), `prompt` (rolled;
a different choice emits `OverrideUsed`), `enforce` (rolled; other choices rejected with
`enforced`). The roll command records the pending value; the choosing command resolves it with
`choose()` in `commands.ts`. Add new mechanics the same way and document the default in
`docs/rules.md`.

## Conventions

- TDD: engine commands and invariants get a failing test first. Engine tests live in
  `src/engine/__tests__/`; shared drivers and fixtures in `tests/support/`. UI tests are
  `*.test.tsx` next to the component and run in jsdom. Layers, helpers and thresholds:
  `docs/testing.md`. Don't lower a coverage or mutation threshold to get green.
- Import validates every event payload (`src/export/eventSchemas.ts`); a new or changed payload
  needs its schema updated (the schema test fails otherwise).
- Comments only for non-obvious logic.
- No default exports outside `src/ui/screens/` (lint-enforced).
- Engine functions are pure and take state explicitly.
- zustand v5: selectors must return stable references (select the object, derive arrays outside),
  or React loops.
- Docs describe the code as it is. Keep README, this file, CHANGELOG (Keep a Changelog) and
  `docs/` in step with the code; note any change shipped without test coverage in the CHANGELOG.
