# Testing

The suite has six layers. Each one catches a kind of bug the others miss.

| Layer                              | Tool                                               | Where                                                               | Runs on                                                  |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| Engine unit and table-driven tests | Vitest (node)                                      | `src/engine/__tests__/`                                             | every PR                                                 |
| Property tests                     | fast-check                                         | `invariants.property.test.ts`, `src/export/import.property.test.ts` | every PR (fixed seed); nightly (random seeds, 2000 runs) |
| Golden tests                       | Vitest file snapshots                              | `tests/golden.test.ts`, `tests/__snapshots__/`                      | every PR                                                 |
| Persistence and store              | Vitest + fake-indexeddb                            | `src/persistence/`, `src/store/`                                    | every PR                                                 |
| Components and screens             | Vitest (jsdom) + Testing Library                   | `src/ui/**/*.test.tsx`                                              | every PR                                                 |
| End to end                         | Playwright (Chromium) against the production build | `tests/e2e/`                                                        | every PR                                                 |
| Mutation testing                   | Stryker                                            | `src/engine/`                                                       | nightly                                                  |

## Commands

```sh
npm test                 # everything except e2e and mutation
npm run test:coverage    # the same, with coverage thresholds (what CI runs)
npx vitest run --project node   # engine, export, persistence, store, golden
npx vitest run --project dom    # React components and screens
npm run build && npm run e2e    # Playwright
npm run test:mutation    # Stryker on src/engine (~45 minutes on 4 cores)

# Long random property runs, as the nightly job does
FC_RUNS=2000 FC_RANDOM=1 npx vitest run --project node src/engine/__tests__/invariants.property.test.ts
# Replay a failing seed that fast-check printed
FC_SEED=123456 npx vitest run src/engine/__tests__/invariants.property.test.ts
```

## What each layer guards

- **Engine tests** pin every command's accepted path, each rejection code, the events emitted and
  every rules default (tone threshold, cohesion cap, Legacy cap, drift modes, oracle qualifiers,
  Chaos skew), and each mechanic's off / prompt / enforce behavior (`modes.test.ts`).
- **The invariant property test** plays random games (random settings, 0–3 phantoms, both
  rulesets) interleaved with random out-of-band commands (oracle, prompts, undo, retcon, revise)
  and checks every invariant after every step, then that replaying the log from empty deep-equals
  the live state. `checks.test.ts` proves the invariant checker itself fires on corrupted states;
  a checker that never fires would make that property vacuous.
- **Import properties** feed arbitrary JSON and corrupted real logs (dropped, duplicated, swapped
  and mangled events) to game-file and pack import: they must return errors, never throw, and a
  mangled payload must always be rejected.
- **Event schemas** (`src/export/eventSchemas.test.ts`) generate games that emit every event type
  and check each payload against the schema import uses, so import stays in step with the engine.
- **Golden tests** replay recorded logs in `tests/fixtures/` and snapshot the state and all four
  exports. An intended rules change re-records fixtures and accepts new snapshots (see
  CLAUDE.md); an unintended diff is a regression.
- **Component and screen tests** render the real store on fake-indexeddb with deterministic ids,
  drive it with `userEvent`, and assert on roles and labels, the same way a player (or a screen
  reader) sees the page. `tests/support/ui.tsx` has helpers to reach any game stage;
  `tests/support/app.tsx` renders the whole app at a hash route.
- **E2E** runs the production build under the GitHub Pages sub-path: a full round with a Scene,
  import and export of every format, Chronicle, content packs, game settings, offline after first
  load, the keyboard map and reduced motion.
- **Mutation testing** changes engine code (flipped conditions, removed statements, swapped
  operators) and reports mutants no test notices. The report is in `reports/mutation/index.html`.

## Thresholds

Coverage floors in `vitest.config.ts` fail `npm run test:coverage`: 98% statements and lines, 95%
functions, 90% branches overall; the engine is held to 99% lines, 100% functions, 93% branches.
The Stryker `break` threshold in `stryker.config.json` (72%) fails the nightly mutation job. It
is set just under the measured baseline (73.4% on 2026-09-27); raise it as survivors are killed,
never lower it to get green.

## Writing tests

- Engine: use `Driver` and `setupGame` / `readyForTurn` from `tests/support/`. Assert rejection
  codes, not message wording.
- UI: prefer `getByRole` / `getByLabelText` over test ids; if a control can't be found by role or
  label, that's usually an accessibility bug worth fixing in the component.
- Anything async (store writes, lazy screens) needs `findBy…` or `waitFor`.
- jsdom has no layout: `clickFirst` needs `offsetParent` faked (see `Table.test.tsx`), and range
  inputs need `fireEvent.change`.
