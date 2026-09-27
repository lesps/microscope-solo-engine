# Content packs

All table text and deck keywords reach the engine as content packs: JSON files validated with zod
(`src/content/schemas.ts`). The app ships one original pack, _Starter pack_
(`src/content/packs/starter/starter.json`, CC0). Lens's own tables, and anything derived from
Microscope, are not bundled; import them yourself as a pack if you have the right to use them.

Import packs from **Packs** in the app. A pack with any error is not installed, and every error is
listed with its path (for example `tables[2].entries[5].text: must not be empty`). Installed packs
can be inspected, disabled or removed. Which tables a game uses is chosen per game in **Game
settings → Active tables** (Lens's "add or ban tables in your palette"); a new game starts with
every enabled table active.

## Schema

```ts
{
  schemaVersion: 1,
  id: string,            // letters, digits, . _ -; unique across installed packs
  name: string,
  version: string,
  description?: string,
  author?: string,
  license?: string,
  tables: Table[],       // default []
  decks: Deck[]          // default []
}
```

### Tables

```ts
// domain | palette | reversal | focus
{ id, name, category, die?: number, entries: Entry[] }
// wordPair: an action and a subject are rolled together
{ id, name, category: 'wordPair', die?: number, action: Entry[], subject: Entry[] }

Entry = { text: string, weight?: positive integer, range?: [low, high] }
```

- **Weighted** (default): one roll of a die the size of the total weight; `weight` defaults to 1.
- **Die-mapped**: give `die` and a `range` on every entry. The ranges must cover 1..`die` exactly
  once. Mixing ranged and unranged entries in one list is an error.

| Category   | Used for                                                       |
| ---------- | -------------------------------------------------------------- |
| `domain`   | Domain prompts; a Focus source                                 |
| `focus`    | Focus seeds; drawn with domain tables when the Focus is rolled |
| `wordPair` | Word-pair prompts                                              |
| `palette`  | Rolled Palette items at setup                                  |
| `reversal` | Scene reversals (the deck is the fallback)                     |

Table ids must be unique within a pack and across installed packs.

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
