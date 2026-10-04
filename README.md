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
  through setup: start, premise, Bookends, Palette, seats, First Pass, dials.
- **Table** is the play screen: standing context on the left, the timeline in the middle, and a turn
  panel on the right that always shows the next action and every roll behind it.
- **Scene editor** is a full-screen drafting mode with the Question pinned, spread, reversal,
  oracle, word budget and timer. Resolved Scenes reopen in revise mode; facts stay locked.
- **Exports**: chronological manuscript, play-order manuscript, outline (Markdown) and the game file
  (JSON, the backup and transfer format).

Keyboard: `N` next step, `R` roll/draw, `O` oracle, `E` open editor, `Esc` close,
`Cmd/Ctrl+Z` undo within the open turn (undo never removes a roll).

### Starting a game

**New game** asks first how you want to start, then what to call the game:

1. **Choose a start.** Seeds and generators from your packs are listed by category (each toolkit
   is a category).
   - **A seed**: a premise you shape by answering a few multiple-choice questions, including how
     the history begins and ends. The Premise, Bookends and Palette come prefilled from your
     answers; edit anything before committing it.
   - **A generator**: roll several tables into a Big Picture prompt ("the hoarding of salt starves
     the old dynasty"), swap two parts for a second reading, reroll as often as you like, then
     write your own Big Picture from it.
   - **Start blank**: write the premise yourself, and tick any installed toolkits the game should
     draw from.
2. **Name it.** The title is suggested from the seed or generator. The ruleset follows from the
   seed (it's only asked for blank starts and seeds that suit either). The preset and deck are
   under **Options**; the last preset you used is remembered.
3. **Begin.** Setup opens on the seed's questions or the generator's roll; a blank start goes
   straight to the Premise. Until the Bookends are set, setup's **Start** step lets you pick a
   different start.

Rename a game at any time in **Game settings → Game name**.

**Toolkits** are packs whose tables are tagged with a group (a genre). Tagged tables stay off
until a game is linked to their group: by starting from one of the group's seeds or generators, by
ticking it on a blank start, or in Game settings. Untagged tables are always available. Three CC0
toolkits (Myth and Iron, Far Horizons, Close to Home) are in [`toolkits/`](toolkits/); import them
from **Packs**. They also add Scene Question ideas and Roll a person, which appear beside the
fields they help fill.

The bundled _Startup sample_ pack has one original seed and one generator. Seeds and generators
are modeled on how Microscope Explorer by Ben Robbins presents its starting points; Explorer's own
content is not included (see [docs/content-packs.md](docs/content-packs.md) for building a
personal pack from your copy).

### Phantom seats

A phantom seat takes turns like a player, but you write its entries. Each default phantom has a
personality that shapes its turns: **The Reader** draws tarot cards, **The Gambler** rolls dice on
the tables, and **The Archivist** recalls something already in the history and asks what came of it.
When a phantom's turn starts, its draw appears in the turn panel as a suggestion; when it holds the
Lens, its Focus comes from the same source. Change a phantom's name or inspiration in the Seats
editor. Anyone can also tap **Echo** in the prompts row for a callback to the history.

### Playing with a group

By default a game is solo: you plus a phantom seat. For several people sharing one device, choose
**New game → Options → Players → Group** and name 2–4 players. Microscope plays with at most four,
so phantom seats can fill any empty places. Turns and the Lens rotate through every seat; the turn
panel names whose turn it is and the Scene editor whose Scene it is. Anyone can ask the Oracle at
any time, and each answer is credited to whoever asked. Seats can be added, renamed or removed in
setup until the First Pass starts.

### Content packs

Tables and decks arrive as JSON content packs. Import them from **Packs**; a pack with errors is not
installed and each error is listed with its path. Enable a pack's tables per game in **Game
settings → Active tables**. The schema and a worked example are in
[docs/content-packs.md](docs/content-packs.md). Lens's own tables are not bundled; import them as a
pack if you have the right to.

### On iPhone and iPad

In Safari, tap **Share → Add to Home Screen**. The app then opens full screen from its icon, like
an installed app:

- a launch screen in your light or dark theme, and the app's own bar under the status bar;
- no zoom when you tap into a field, no page bounce, touch-sized buttons;
- it reopens where you left off, even after iOS has closed it in the background, and a Scene draft
  is saved the moment you switch away;
- exports (game files, manuscripts, backups) open the share sheet: **Save to Files**, AirDrop or
  another app;
- it checks for a new version each time you return to it, and asks before reloading.

An installed app also keeps its storage (Safari's 7-day deletion doesn't apply to it). Games in
Safari and in the Home Screen app are stored separately: to move games into the installed app, use
**Library → Export all** in Safari, then **Import…** in the app.

### Keep your games safe

Games are stored in this browser's IndexedDB. Clearing site data deletes them, browsers may evict
"best-effort" storage under disk pressure, and Safari can delete storage for sites not visited in
7 days unless the app is installed to the home screen. So:

- The app asks for durable storage on first launch; **Storage** shows the result and usage.
- **Install the app** (Add to Home Screen, or your browser's install button). It works offline.
- Back up regularly. When a round ends, **Back up all games** saves every game in one dated file
  (`solo-microscope-backup-YYYY-MM-DD.json`); on iPhone it opens the share sheet, so **Save to
  Files** keeps a copy in iCloud Drive or on the device. **Library → Export all** does the same at
  any time, **Storage** shows when you last backed up, and a banner reminds you after 3 completed
  rounds or 7 days without one (configurable). Restore with **Library → Import…**.

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
npm test             # Vitest: engine, property, golden, persistence, store, UI components
npm run test:coverage # the same with coverage thresholds (CI)
npm run test:mutation # Stryker mutation testing of the engine (slow)
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
[docs/events.md](docs/events.md). The test suite is described in [docs/testing.md](docs/testing.md).

## Deploying

The app is static files on GitHub Pages, built and deployed by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to `main` (and on
manual dispatch). Pull requests run the same build, test and e2e job without deploying.
[`.github/workflows/nightly.yml`](.github/workflows/nightly.yml) runs long random property tests
and mutation testing every night.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The workflow builds with `BASE_PATH=/<repo>/` so assets, the PWA manifest scope and the service
worker sit under the project sub-path. Routing is hash-based (`#/game/<id>`), so deep links work
without a server fallback. For a custom domain, build with `BASE_PATH=/` — and read the warning
above about URLs first.

Every project site under `<user>.github.io` shares one origin and so shares IndexedDB and storage
quota with the user's other Pages apps. The database is named `solo-microscope` and the app never
clears storage wholesale; a custom domain gives it an origin of its own.
