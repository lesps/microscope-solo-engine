# Content packs

All table text, deck keywords and startup content reach the engine as content packs: JSON files
validated with zod (`src/content/schemas.ts`). The app ships two original CC0 packs, installed on
first load and refreshed from the build (they can be disabled, not removed):

- _Starter pack_ (`src/content/packs/starter/starter.json`): tables and a keyword deck.
- _Startup sample_ (`src/content/packs/startup-sample/startup-sample.json`): one seed, one
  generator and one group, showing how startup packs work.

Three genre toolkits (Myth and Iron, Far Horizons, Close to Home) live in `toolkits/` in the
repository as user content, not bundled; see [Toolkits](#toolkits-tags-and-linking).

Lens's own tables, Microscope Explorer's seeds and oracles, and anything else derived from
Microscope are not bundled. Import them yourself as a personal pack if you own the source; such a
pack is for personal use and must not be redistributed.

Import packs from **Packs** in the app. A pack with any error is not installed, and every error is
listed with its path (for example `tables[2].entries[5].text: must not be empty`). Installed packs
can be inspected, disabled or removed. Which tables a game uses is chosen per game in **Game
settings → Active tables** (Lens's "add or ban tables in your palette"); a new game starts with
every enabled untagged table active, and tagged tables join when the game is linked to their
group.

## Schema

```ts
{
  schemaVersion: 1 | 2 | 3,  // 3 is current; 1 and 2 are accepted and normalized to 3
  id: string,            // letters, digits, . _ -; unique across installed packs
  name: string,
  version: string,
  description?: string,
  author?: string,
  license?: string,
  tables: Table[],       // default []
  decks: Deck[],         // default []
  groups: Group[],       // v2 only, default []
  seeds: Seed[],         // v2 only, default []
  generators: Generator[] // v2 only, default []
}
```

A pack needs at least one table, deck, seed or generator. Older packs, including packs installed
before a version existed, load as version 3: version 1 gets empty `groups`, `seeds` and
`generators`, and neither version 1 nor 2 has tags. A version 1 pack that uses the startup arrays
is an error, and so is a version 1 or 2 pack that uses `question` or `person` tables, `slot` or
`tags`.

### Tables

```ts
// domain | palette | reversal | focus | generator | question (v3) | person (v3)
{
  id, name, category, die?: number, entries: Entry[],
  slot?: 'name' | 'role' | 'want',   // v3: required on person tables, forbidden on the rest
  tags?: GroupId[]                   // v3: 1–4 group ids; not on generator tables
}
// wordPair: an action and a subject are rolled together
{ id, name, category: 'wordPair', die?: number, action: Entry[], subject: Entry[], tags?: GroupId[] }

Entry = { text: string, weight?: positive integer, range?: [low, high] }
```

- **Weighted** (default): one roll of a die the size of the total weight; `weight` defaults to 1.
- **Die-mapped**: give `die` and a `range` on every entry. The ranges must cover 1..`die` exactly
  once. Mixing ranged and unranged entries in one list is an error.

| Category    | Used for                                                       |
| ----------- | -------------------------------------------------------------- |
| `domain`    | Domain prompts; a Focus source                                 |
| `focus`     | Focus seeds; drawn with domain tables when the Focus is rolled |
| `wordPair`  | Word-pair prompts                                              |
| `palette`   | Rolled Palette items at setup                                  |
| `reversal`  | Scene reversals (the deck is the fallback)                     |
| `generator` | Parts of a generator; never an active table in play            |
| `question`  | Question ideas for a Scene                                     |
| `person`    | One part of a rolled person, chosen by `slot`                  |

Entry rules for the v3 categories: `question` entries end with "?" and are at most 140 characters
(the Scene Question limit). On `person` tables, `name` entries are at most 40 characters, and
`want` entries start with "to " (they read as "who wants to …") and are at most 120.

Table ids must be unique within a pack and across installed packs. A `generator` table that no
generator in the pack uses is a warning (shown on the Packs screen), not an error.

### Toolkits: tags and linking

A table's `tags` name groups. A tagged table is a toolkit table: it starts inactive and becomes
active when the game is linked to one of its groups, which keeps genre tables from bleeding into
each other. Untagged tables behave as they always have. A game is linked when:

- it starts from a seed or generator that has a `group` (the same command records the new active
  tables as a `SettingsChanged`);
- the player ticks the group in the **Toolkits** checklist on a blank start;
- the player turns a group's tables on in **Game settings → Active tables**, where tables are
  listed under their tags (Untagged first) with a toggle per group.

Linking keeps the untagged tables that are active and swaps the tagged ones for the linked
groups'. Tags are ids: a duplicate tag in one table and a tag on a `generator` table are errors.
Tags are matched against group ids in every enabled pack, so a tag that matches no installed group
is a warning on the Packs screen, not an error (the group's pack may be imported later).

```json
{
  "schemaVersion": 3,
  "id": "harbor-toolkit",
  "name": "Harbor toolkit",
  "version": "1.0.0",
  "license": "CC0-1.0",
  "groups": [{ "id": "harbors", "name": "Harbors" }],
  "tables": [
    {
      "id": "harbors.questions",
      "name": "Harbor questions",
      "category": "question",
      "tags": ["harbors"],
      "entries": [
        { "text": "Who gets the last berth?" },
        { "text": "What does the tide bring in?" }
      ]
    },
    {
      "id": "harbors.names",
      "name": "Harbor names",
      "category": "person",
      "slot": "name",
      "tags": ["harbors"],
      "entries": [{ "text": "Maren" }, { "text": "Old Tobias" }]
    },
    {
      "id": "harbors.wants",
      "name": "Harbor wants",
      "category": "person",
      "slot": "want",
      "tags": ["harbors"],
      "entries": [{ "text": "to own a boat" }, { "text": "to leave before winter" }]
    }
  ]
}
```

The three toolkits in `toolkits/` each come in two versions with the same pack id, so importing
the later one replaces the earlier in place:

| Toolkit       | Group id        | Generator    |
| ------------- | --------------- | ------------ |
| Myth and Iron | `myth-and-iron` | Old Tellings |
| Far Horizons  | `far-horizons`  | Deep Survey  |
| Close to Home | `close-to-home` | Small Hours  |

- `toolkits/import-now/*.json` (schema 1, version 1.0.0): Focus (30), Domains (12), Reversals
  (24), Palette (20) and Word pairs (20 × 20), untagged.
- `toolkits/*.json` (schema 3, version 2.0.0): the same tables tagged with the group, plus Scene
  Questions (24), Names (24), Roles (20) and Wants (20), the group, three seeds and a four-part
  generator (8 × 12 × 8 × 12).

Table ids are namespaced `toolkit.<myth|far|home>.*`. A game created while an import-now version
was installed keeps those tables active after the upgrade; the new tagged tables wait for a link.

### Startup content: groups, seeds and generators

Startup content gets a new game from a blank page to the Palette in a few choices. Its structure
is modeled on how Microscope Explorer presents its starting points: pick a category, then a
starting point, then customize it.

```ts
Group = { id, name /* ≤ 60 */, description? /* ≤ 300 */ }

Seed = {
  id, title /* ≤ 60 */, group?: GroupId,
  ruleset: 'lens' | 'chronicle' | 'any',           // default 'lens'
  pitch /* ≤ 800 */,
  bigPicture? /* ≤ 200: prefills the Big Picture */,
  subject?: { name /* ≤ 60 */, description /* ≤ 200 */, traits: string[] /* 3–5, each ≤ 60 */ },
  questions: Question[],                            // 0–6, default []
  startBookend: BookendQuestion,
  endBookend: BookendQuestion,
  palette?: { yes: string[], no: string[] },        // items ≤ 60, at most 6 per list
  note? /* ≤ 600 */
}

Question = {
  id, text /* ≤ 140 */,
  pick: 'one' | 'two' | 'oneOrTwo',                 // default 'one'
  allowCustom: boolean,                             // default true: a written-in answer is allowed
  options: { id, text /* ≤ 200 */ }[]               // 2–8
}

BookendQuestion = { text /* ≤ 140 */, options: { id, text /* ≤ 200 */, title? /* ≤ 60 */ }[] /* 2–6 */ }

Generator = {
  id, name /* ≤ 60 */, group?: GroupId, description? /* ≤ 300 */,
  parts: { id, label /* ≤ 40 */, tableId }[],      // 2–6
  template /* ≤ 200, e.g. '{trend} {a} {impact} {b}' */,
  swap?: [PartId, PartId]                           // two parts the player may exchange
}
```

Validation, each error with its path:

- Ids are unique within their kind in the pack: groups, seeds, generators; question ids within a
  seed; option ids within a question or Bookend question; part ids within a generator.
- A seed's or generator's `group` names a group in the same pack.
- A `chronicle` seed needs a `subject`; a `lens` seed may not have one.
- `pick: 'two'` needs at least 3 options.
- Every part's `tableId` names a table in the same pack with category `generator`.
- Every `{placeholder}` in a template is a part id, and every part id appears exactly once.
- `swap` names two different parts of the generator.
- Group, seed and generator ids must not collide with another installed pack's ids.

Generators are offered for Lens games only (a reading is a Big Picture prompt); seeds are offered
when their `ruleset` matches the game or is `any`.

### Decks

```ts
{ id, name, cards: Card[] }

Card = {
  id: string,                     // unique in the deck
  arcana: 'major' | 'minor',
  suit?: string,                  // required for minor cards
  rank?: 0..21 | 'page' | 'knight' | 'queen' | 'king',   // required for minor cards
  name: string,
  upright: string,                // one keyword (one or two words)
  reversed: string,               // one keyword (one or two words)
  tier: 'grand' | 'character' | 'moment'
}
```

Keywords are single fixed words so a card cannot be read as whatever the player wanted. `tier` maps
cards to scale and must match the card: majors are `grand` (Periods, Focus), courts are `character`,
pips (rank 1–10) are `moment` (Events and Scenes). Character prompts draw only `character` cards;
tone-from-pip uses `moment` cards' rank. A deck can have any number of cards; the starter deck has 78.

## Worked example

A small pack with a die-mapped domain table, a weighted reversal table and a word-pair table:

```json
{
  "schemaVersion": 1,
  "id": "harbor",
  "name": "Harbor towns",
  "version": "1.0.0",
  "license": "CC-BY-4.0",
  "tables": [
    {
      "id": "harbor.domains",
      "name": "Harbor life",
      "category": "domain",
      "die": 6,
      "entries": [
        { "text": "Fishing fleets", "range": [1, 2] },
        { "text": "Customs and smuggling", "range": [3, 4] },
        { "text": "Storms and wrecks", "range": [5, 5] },
        { "text": "Lighthouses", "range": [6, 6] }
      ]
    },
    {
      "id": "harbor.reversals",
      "name": "Harbor complications",
      "category": "reversal",
      "entries": [
        { "text": "The tide turns early", "weight": 3 },
        { "text": "A ship that should not be here", "weight": 2 },
        { "text": "The harbormaster changes sides" }
      ]
    },
    {
      "id": "harbor.pairs",
      "name": "Harbor verbs and things",
      "category": "wordPair",
      "action": [{ "text": "Salvage" }, { "text": "Blockade" }, { "text": "Christen" }],
      "subject": [{ "text": "a hull" }, { "text": "a net" }, { "text": "a beacon" }]
    }
  ]
}
```

`harbor.reversals` rolls a d6 (total weight 3 + 2 + 1). A Scene drafted on a seat whose tables
include it draws its reversal from there instead of the deck.

## Worked example: a startup pack

A trimmed copy of the bundled _Startup sample_: one group holding one seed and one generator.

```json
{
  "schemaVersion": 2,
  "id": "startup-demo",
  "name": "Startup demo",
  "version": "1.0.0",
  "license": "CC0-1.0",
  "tables": [
    {
      "id": "demo.trend",
      "name": "Force",
      "category": "generator",
      "entries": [{ "text": "the arrival of" }, { "text": "the hoarding of" }]
    },
    {
      "id": "demo.a",
      "name": "Element",
      "category": "generator",
      "entries": [{ "text": "salt" }, { "text": "a comet" }]
    },
    {
      "id": "demo.impact",
      "name": "Effect",
      "category": "generator",
      "entries": [{ "text": "unites" }, { "text": "starves" }]
    },
    {
      "id": "demo.b",
      "name": "Element",
      "category": "generator",
      "entries": [{ "text": "river towns" }, { "text": "the old dynasty" }]
    }
  ],
  "groups": [
    { "id": "frontiers", "name": "Frontiers", "description": "Edges of the known world." }
  ],
  "seeds": [
    {
      "id": "salt-road",
      "title": "The Salt Road",
      "group": "frontiers",
      "pitch": "An inland sea is drying up, leaving a single road across the new desert between two peoples.",
      "bigPicture": "As an inland sea dries to salt, a single road across its bed decides the fate of the peoples on either shore.",
      "questions": [
        {
          "id": "salt",
          "text": "What does the salt mean to the people who cross it?",
          "pick": "oneOrTwo",
          "options": [
            { "id": "wealth", "text": "Wealth: salt is money." },
            { "id": "holy", "text": "Holiness: the flats are sacred ground." },
            { "id": "danger", "text": "Danger: the flats hide sinkholes and sudden storms." }
          ]
        }
      ],
      "startBookend": {
        "text": "How does the history begin?",
        "options": [
          {
            "id": "ferry",
            "title": "The last ferry",
            "text": "The last ferry makes its crossing before the water gets too shallow."
          },
          {
            "id": "stones",
            "text": "Surveyors from both shores begin paving one route across the flats."
          }
        ]
      },
      "endBookend": {
        "text": "How does the history end?",
        "options": [
          {
            "id": "border",
            "title": "The road is the border",
            "text": "The road is walled along its length."
          },
          { "id": "flood", "title": "The sea returns", "text": "Water floods the basin again." }
        ]
      },
      "palette": { "yes": ["Caravans and waystations"], "no": ["Magic that makes water"] },
      "note": "The road gives every Period a question to answer: who holds it now?"
    }
  ],
  "generators": [
    {
      "id": "crossroads",
      "name": "Crossroads",
      "group": "frontiers",
      "parts": [
        { "id": "trend", "label": "Force", "tableId": "demo.trend" },
        { "id": "a", "label": "Element", "tableId": "demo.a" },
        { "id": "impact", "label": "Effect", "tableId": "demo.impact" },
        { "id": "b", "label": "Element", "tableId": "demo.b" }
      ],
      "template": "{trend} {a} {impact} {b}",
      "swap": ["a", "b"]
    }
  ]
}
```

A reading reads like "the hoarding of salt starves the old dynasty"; swapped, "the hoarding of the
old dynasty starves salt".

## Importing Microscope Explorer's content

Explorer's seeds and oracles are not bundled and never enter this repository. If you own the book,
you can build a personal pack from your copy and import it on the Packs screen like any other
pack. Nothing in the app is Explorer-specific: the pack only has to meet the schema above (groups
for Explorer's categories, seeds with the `one`, `two` and `oneOrTwo` pick rules, and generators
over `generator` tables, using a ranged d36 table where Explorer uses two dice to pick a column
and row). Give it a license such as "Personal use only. Not for distribution."
