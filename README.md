# Solo Microscope

A local-first, single-user web app for playing Microscope solo as a structured writing exercise. It
implements the **Lens** solo hack as its core ruleset, adds solo extensions that supply the friction
a table of players normally provides (rolled tone, placement, Focus, Palette and in-Scene
reversals, phantom seats), and has a **Chronicle** mode for the history of a single subject. Every
random mechanic can be dialed from enforced down to fully off. There is no AI of any kind and no
backend: games live in your browser.

**Live app:** https://lesps.github.io/microscope-solo-engine/ (once GitHub Pages is enabled; see
[Deploying](#deploying)).

## Credits

Microscope and Microscope Explorer are by Ben Robbins (Lame Mage Productions). Lens is by
CodenameAwesome. Solo Microscope is an unofficial tool and is **not affiliated** with either. It
bundles no rule text from Microscope, Microscope Explorer or Lens; the starter tables and keyword
deck are original (CC0). The in-app rules follow this project's own wording
([docs/rules.md](docs/rules.md)).

## Using it

- **Library** lists your games: new, duplicate, export, import, delete, export all.
- **New game** picks Lens or Chronicle and a preset (Pure Lens, Default, High Friction), then walks
  through setup: premise, Bookends, Palette, seats, First Pass, dials.
- **Table** is the play screen: standing context on the left, the timeline in the middle, and a turn
  panel on the right that always shows the next action and every roll behind it.
- **Scene editor** is a full-screen drafting mode with the Question pinned, spread, reversal,
  oracle, word budget and timer. Resolved Scenes reopen in revise mode; facts stay locked.
- **Exports**: chronological manuscript, play-order manuscript, outline (Markdown) and the game file
  (JSON, the backup and transfer format).

Keyboard: `N` next step, `R` roll/draw, `O` oracle, `E` open editor, `Esc` close,
`Cmd/Ctrl+Z` undo within the open turn (undo never removes a roll).

### Content packs

Tables and decks arrive as JSON content packs. Import them from **Packs**; a pack with errors is not
installed and each error is listed with its path. Enable a pack's tables per game in **Game
settings → Active tables**. The schema and a worked example are in
[docs/content-packs.md](docs/content-packs.md). Lens's own tables are not bundled; import them as a
pack if you have the right to.

### Keep your games safe

Games are stored in this browser's IndexedDB. Clearing site data deletes them, browsers may evict
"best-effort" storage under disk pressure, and Safari can delete storage for sites not visited in
7 days unless the app is installed to the home screen. So:

- The app asks for durable storage on first launch; **Storage** shows the result and usage.
- **Install the app** (Add to Home Screen, or your browser's install button). It works offline.
- Export game files regularly. A banner reminds you after 3 completed rounds or 7 days since the
  last export (configurable).

> **Changing the app's URL loses access to your games.** A different domain, a custom domain, or a
> repository moved to another user is a new browser origin with empty storage. Before any such
> change, use **Library → Export all**, then import the bundle at the new address.

## Development

Requires Node 22.

```sh
npm ci
npm run dev          # Vite dev server
npm run typecheck
npm run lint         # ESLint, including module import boundaries
npm test             # Vitest: engine unit, property, golden, persistence, store
npm run build        # production build into dist/
npm run e2e          # Playwright against `vite preview` (build first)
```

E2E under the Pages sub-path, as CI runs it:

```sh
BASE_PATH=/microscope-solo-engine/ npm run build
BASE_PATH=/microscope-solo-engine/ npm run e2e
```

Playwright needs Chromium: `npx playwright install chromium` (skip it if one is preinstalled and
`PLAYWRIGHT_BROWSERS_PATH` points at it).

Regenerate the recorded game fixtures after an intentional rules change:

```sh
UPDATE_FIXTURES=1 npx vitest run tests/fixtures/make-fixtures.test.ts
npx vitest run tests/golden.test.ts -u
```

Architecture, conventions and the event contract are in [CLAUDE.md](CLAUDE.md) and
[docs/events.md](docs/events.md).

## Deploying

The app is static files on GitHub Pages, built and deployed by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to `main` (and on
manual dispatch). Pull requests run the same build, test and e2e job without deploying.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The workflow builds with `BASE_PATH=/<repo>/` so assets, the PWA manifest scope and the service
worker sit under the project sub-path. Routing is hash-based (`#/game/<id>`), so deep links work
without a server fallback. For a custom domain, build with `BASE_PATH=/` — and read the warning
above about URLs first.

Every project site under `<user>.github.io` shares one origin and so shares IndexedDB and storage
quota with the user's other Pages apps. The database is named `solo-microscope` and the app never
clears storage wholesale; a custom domain gives it an origin of its own.
