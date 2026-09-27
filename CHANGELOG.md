# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Component and screen tests (Vitest + jsdom + Testing Library) for every UI component, hook and
  screen, driving a real store on fake-indexeddb.
- Tests proving the invariant checker detects each kind of violation; soft Lens check tests;
  Chronicle, retcon, export, storage-API, migration and store error-path tests.
- Import robustness properties: arbitrary JSON and corrupted real logs never crash game-file or
  pack import.
- Coverage thresholds enforced in CI (98% lines overall, 99% for the engine); coverage report
  uploaded as an artifact; Prettier check in CI.
- Nightly workflow: 2000-run property tests on random seeds and Stryker mutation testing of the
  engine. `FC_RUNS`, `FC_RANDOM` and `FC_SEED` control property runs.
- `docs/testing.md`.
- Tests for gaps found by mutation testing: three-seat Lens and turn rotation, drift arithmetic,
  exact placement-bias weights, zero-weight options never rolled, ranged tables without a die,
  oracle call sequence numbers, Chaos dial start.
- Stryker type-checks mutants and ignores rejection-message wording (`stryker-plugins.mjs`);
  runs are incremental locally.

### Fixed

- Game-file import now validates every event payload (`src/export/eventSchemas.ts`). Previously
  about 30% of events with a corrupted payload were accepted, leaving a game that could crash on
  the next roll.
- The Scene editor's drafting timer briefly showed negative time when started.
- Storage usage of exactly 1 GB (or 1 MB) displayed in the smaller unit.

### Removed

- Unused `nextUint32`, `placementOf` and `useGame`.

## [0.1.0] - 2026-09-27

First implementation of the Solo Microscope spec, milestones 1–9.

### Added

- Event-sourced rules engine (`src/engine`): seeded sfc32 generator with recorded rolls, pure
  reducer, typed commands and rejections, Lens setup and five-step round, placement legality and
  seat bias, cohesion cap, Legacies with eviction and seat-weighted exploration, three drift modes,
  Chaos, oracle with qualifiers, 78-card deck without replacement, Scenes (frame, spread, reversal,
  resolve, revise), retcon, undo of the open turn's tail, soft Lens checks, invariant checker.
- Mechanic modes (off / prompt / enforce) for tone, cohesion, Focus (player and phantom), entry
  type, placement, rolled Palette, Legacy eviction and exploration, Scene reversal; presets Pure
  Lens, Default, High Friction.
- Seats: one player and up to three phantoms with tables, placement bias, entry-type weights and
  Focus mode; turn rotation and independent Lens rotation.
- Chronicle mode: Subject with versioned traits, one Anchor per Period (mortal Anchors confined to
  their Period), required Change per Period.
- Content packs: zod schema with per-entry error paths, die-mapped and weighted tables, original
  starter pack (five tables, keyword deck).
- Persistence: Dexie database `solo-microscope` with events keyed by `[gameId, seq]`, snapshots
  every 200 events, installed packs; durable-storage request and status; backup reminder.
- Store: Zustand single writer, serialized appends, undo, game file and bundle import/export with
  import-as-copy.
- Exports: chronological manuscript, play-order manuscript (rolls toggleable), outline, game file;
  each Markdown export ends with a stats footer.
- UI: Library, new-game and setup wizards, table screen (context rail, zoomable timeline with rolled
  slot gaps, turn panel), Scene editor, game settings, storage settings, content packs; keyboard
  map; light/dark themes; reduced-motion support; responsive drawers below 900 px.
- PWA with offline support and prompt-to-reload updates; hash routing; GitHub Pages workflow.
- Tests: engine unit and table-driven tests, fast-check property test over random settings, seats
  and command sequences (invariants and replay determinism), RNG regression and distribution,
  schema tests, golden replay and export snapshots from recorded logs, persistence and store tests
  on fake-indexeddb, Playwright flows (full round with a Scene; import and export; Chronicle;
  content packs; game settings; offline; keyboard; reduced motion).
- Docs: README, CLAUDE.md, docs/rules.md, docs/content-packs.md, docs/events.md.

### Deviations from the spec

- New event type `ReversalPlaced` (a Scene's reversal is a fact and needed its own event).
- Events carry a `batch` field (first seq of the command) so undo can remove one command at a time.
- `focus.source` is split into `focus.source` (player seat) and `focus.sourcePhantom`.
- Entry titles are hard-validated (required, ≤ 60) rather than a soft check.
- Engine tests are grouped by command area rather than one file per command.
- Pull-request CI runs use a per-PR concurrency group so they never cancel a `main` deploy.

### Without automated coverage

- UI components have no unit tests; they are covered only through the Playwright flows (every
  screen is exercised at least once, but not every control on it).
- The Lighthouse "installable" check is not automated; the offline e2e test covers the service
  worker, and the manifest is checked by hand.
