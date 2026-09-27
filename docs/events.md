# Events

Every change to a game is an event appended to that game's log. State is a pure fold:
`state = events.reduce(apply, initialGame())` (`src/engine/reducer.ts`). Types live in
`src/engine/types.ts` (`EventPayloads`); this file documents each one.

A new event type needs: a payload in `EventPayloads`, an entry in `EVENT_TYPES`, a reducer handler,
a reducer test, and a section here. `src/engine/__tests__/events-contract.test.ts` fails if the
reducer or this document misses a type.

## Envelope

```ts
{
  id: string; // ULID
  gameId: string;
  seq: number; // gapless per-game counter, starting at 1
  batch: number; // seq of the first event emitted by the same command
  at: string; // ISO timestamp
  type: EventType;
  payload: EventPayloads[type];
}
```

`batch` groups the events of one command. Undo removes the last batch, and only when it is inside
the open turn and contains no roll or draw events (see `src/engine/undo.ts`). Undo truncates the
tail of the log; it never leaves a gap and never adds an event.

Payloads carry everything replay needs: entity ids, rolled results, recorded generator state and
the text a table line produced. Replay never calls the PRNG and never reads content packs.

## Setup

### `GameCreated`

`{ id, title, ruleset: 'lens' | 'chronicle', seed, rng, settings, seats, deck?: { deckId, cardIds }, schemaVersion }`

`seed` is 128 bits as 32 hex characters; `rng` is the sfc32 state derived from it. The deck's card
ids are copied in so deck state replays without the pack.

### `BigPictureSet`

`{ text }` — Lens only; at most 200 characters.

### `SubjectSet`

`{ subject: { name, description, traits } }` — Chronicle only; 3–5 distinct traits. Also sets
`bigPicture` to the description.

### `BookendsSet`

`{ start: Period, end: Period, characters: Character[] }` — the two Bookend Periods, locked. In
Chronicle, `characters` holds any Anchors created with them.

### `PaletteItemAdded`

`{ list: 'yes' | 'no', item: { id, text, rolled } }` — a rolled item also clears the pending roll.

### `PaletteItemRemoved`

`{ id }`

### `SeatsConfigured`

`{ seats: Seat[] }`

### `DialsSet`

`{ mood, cohesion, chaos? }` — setup only (also emitted when Chaos is switched on after setup,
starting it at 5).

### `SettingsChanged`

`{ settings }` — the full settings object.

## Play

### `RoundStarted`

`{ n, lensSeatId }` — the Lens seat is `seats[(n - 1) % seats.length]`.

### `FocusSet`

`{ text, source }` — `source` is `player`, `legacy`, `deck`, `subject`, `trait` or `table:<id>`.

### `TurnStarted`

`{ seatId, kind: 'normal' | 'legacy', legacyId? }` — opens a turn and advances the seat rotation.

### `EntryCreated`

`{ entry: Entry }` — a Period, Event or Scene with its order key. First Pass entries carry
`firstPass: true` and are locked on creation.

### `EntryProseEdited`

`{ entryId, prose }` — prose of the open turn's entry.

### `CharacterCreated`

`{ character: { id, name, description, immortal } }`

### `SceneFramed`

`{ entryId, question, form, setting?, requiredCharacterIds, bannedCharacterIds, budget }`

### `ReversalPlaced`

`{ entryId, source, text, offset }` — inserts `[[REVERSAL: text]]` into the Scene's prose at
`offset` and records the reversal on the Scene. Not in the original spec's list: a Scene's reversal
is a fact and needed its own event.

### `SceneResolved`

`{ entryId, answer, characterIds }` — always followed by `TurnCommitted` in the same batch.

### `TurnCommitted`

`{ entryId }` — locks the entry, stores `playProse` and the first revision, closes the turn.

### `LegacyAdded`

`{ legacy: { id, text, seatId, addedInRound } }` — `seatId` is the round's Lens seat.

### `LegacyRemoved`

`{ id }` — eviction when all six slots are full.

### `LegacyExplored`

`{ id }` — followed by a `TurnStarted` of kind `legacy`.

### `DialsAdjusted`

`{ before, after, drift }`

### `RoundEnded`

`{ n }`

## Randomness

### `RollMade`

`{ purpose, sides, result, value?, text?, tableId?, targetId?, rng }`

`result` is 1..`sides`. Weighted draws roll one die whose size is the total weight. `value` is the
interpreted result the reducer records as a pending roll, by purpose:

| purpose                           | value                                      | recorded as                            |
| --------------------------------- | ------------------------------------------ | -------------------------------------- |
| `tone`                            | `'light' \| 'dark'`                        | `turn.rolled.tone`                     |
| `entryType`                       | `'period' \| 'event' \| 'scene'`           | `turn.rolled.entryType`                |
| `placement`                       | `{ kind, placement: { parentId, index } }` | `turn.rolled.placement`                |
| `scene.reversal`                  | `{ source, text }`                         | `turn.rolled.reversal`                 |
| `cohesion`                        | `boolean` (pass)                           | `pendingRoundRolls.cohesion`           |
| `focus`                           | `{ text, source }`                         | `pendingRoundRolls.focus`              |
| `legacy.evict` / `legacy.explore` | Legacy id                                  | `pendingRoundRolls.evict` / `.explore` |
| `palette`                         | `{ text, tableId, rerolled }`              | `pendingPalette`                       |
| `prompt.*`                        | `{ kind, text }`                           | `turn.prompts`                         |

Other purposes (`focus.source`, `table.pick`, `oracle`, `oracle.qualifier`, `drift.*`,
`prompt.wordPair.action`) are informational. `rng` is the generator state after the draw.

### `CardDrawn`

`{ purpose, deckId, cardId, reversed, keyword, value?, targetId?, role?, rng }` — removes the card
from the remaining pile. `purpose: 'scene.spread'` with `targetId` and `role` (`setup`,
`complication`, `pressure`) appends to the Scene's spread. `value` follows the `RollMade` table.

### `DeckReshuffled`

`{ deckId, rng }` — all cards return to the remaining pile.

### `OracleAsked`

`{ entryId?, call: { question, odds, effectiveOdds, roll, answer, qualifierRoll?, qualifier?, seq } }`
— attaches to the Scene when `entryId` is given.

### `OverrideUsed`

`{ mechanic, rolled, chosen, targetId? }` — a prompt-mode roll the player overrode. Counts toward
`stats.overrides`.

## After the fact

### `ProseRevised`

`{ entryId, prose }` — locked entries only; appends a revision.

### `Retconned`

`{ targetId, field, before, after, reason }` — the only way a locked fact changes. Targets: an
entry (`title`, `tone`; Scenes also `question`, `answer`, `setting`), a Legacy (`text`), a
character (`name`, `description`, `immortal`) or the game (`bigPicture`). Counts toward
`stats.retcons`.
