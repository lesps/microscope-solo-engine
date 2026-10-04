# Rules as implemented

This is the ruleset the engine enforces (`src/engine/`), with every default. It is written from the
app's own spec and a general description of Lens and Chronicle, not from their text. Change it in
the same commit as any rules code.

## Mechanic modes

Every random mechanic has a mode:

- **off** — nothing is rolled; the player chooses.
- **prompt** — rolled; the player may choose something else, which records `OverrideUsed`.
- **enforce** — rolled; the roll stands. Only a retcon can change the resulting fact later.

| Mechanic              | Controls                                        | Default |
| --------------------- | ----------------------------------------------- | ------- |
| `tone`                | Light/Dark per entry                            | enforce |
| `cohesion`            | Extra turns per round                           | enforce |
| `focus.source`        | Round Focus when the player seat holds the Lens | off     |
| `focus.sourcePhantom` | Round Focus when a phantom seat holds the Lens  | enforce |
| `entryType`           | Period / Event / Scene                          | off     |
| `placement`           | Slot on the timeline                            | prompt  |
| `palette.roll`        | Rolled Palette items at setup                   | prompt  |
| `legacy.evict`        | Which Legacy leaves when all six are full       | off     |
| `legacy.explore`      | Which Legacy is explored                        | prompt  |
| `scene.reversal`      | Mid-Scene complication                          | prompt  |
| `seed.answers`        | Answers to a seed's questions at setup          | off     |

A seat's own `focusMode` overrides both Focus defaults. Non-mode settings:

| Setting                                | Default                                  |
| -------------------------------------- | ---------------------------------------- |
| `drift`                                | `counter-trend` (`preference`, `random`) |
| `chaos`                                | off                                      |
| `cohesionCap` (normal turns per round) | 8                                        |
| `entryTypeWeights`                     | Period 25, Event 50, Scene 25            |
| `focusSourceWeights`                   | Legacy 50, domain 30, deck 20            |
| `activeTables`                         | every non-`generator` table at creation  |
| `deck.reversals`                       | on (50% per draw)                        |
| `deck.toneFromPip`                     | off                                      |
| `oracle.qualifiers`                    | on                                       |
| `scene.budget`                         | `warn` (`enforce` blocks resolving)      |
| `scene.defaultBudget`                  | 300–900 words                            |
| `scene.pause` / `pauseSeconds`         | off / 60                                 |
| `paletteRollCount`                     | 2                                        |

**Presets** (Game settings, or chosen at creation):

- _Pure Lens_: tone and cohesion enforced, every other mode off, drift by preference, Chaos off,
  oracle qualifiers off, no pause.
- _Default_: the table above.
- _High Friction_: every mode enforced, Chaos on, Scene budget enforced, pause on.

## Start (optional first setup step)

**New game** chooses the start before the title: seeds and generators are listed by category,
with Start blank offered up front. Choosing one suggests the title (the seed's title or the
generator's name) and decides the ruleset where it can: a `lens` or `chronicle` seed sets it, a
generator means Lens, and only blank starts and `any` seeds ask. Blank starts also offer the
Toolkits checklist there. The game is then created and setup opens on the chosen seed's questions
or the generator's roll (`#/game/<id>/setup/seed/<seedId>`, `…/generator/<generatorId>`); a blank
start (`…/setup/blank`) skips the Start step. Nothing is applied until the player applies the seed
or accepts a reading in setup, using the commands below.

When the enabled packs hold startup content for the game's ruleset, or groups that tag tables,
setup has a **Start** step, with three paths. All of them continue into the Premise step; nothing after the Palette changes.

- **Start from a seed.** Pick a category (group), then a seed, then answer its questions. Each
  question takes one option, exactly two, or one or two, plus a written-in answer unless the seed
  disallows it. The two Bookend questions take one option or a written title and text. Applying
  the seed records the answers as premise notes. Seeds apply when their ruleset matches the game or
  is `any`; Chronicle seeds carry a Subject.
- **Roll a generator** (Lens only). Each part rolls its table; the template joins the results into
  a Big Picture prompt such as "the hoarding of salt starves the old dynasty". If the generator has
  a swap pair, the player may exchange those two parts for a second reading. Rerolling is always
  allowed. The accepted reading is a prompt, never copied into the Big Picture.
- **Start blank.** Setup proceeds exactly as without startup packs. When installed groups tag
  tables, a **Toolkits** checklist comes first (each group with its table count, ticked if its
  tables are already active); Continue links the game to the ticked groups.

**Active tables.** A new game activates every enabled untagged table except generator tables.
Tagged (toolkit) tables start inactive. Applying a seed or accepting a generator reading whose
`group` is set also links the game to that group in the same command: the active tables become the
untagged ones already active plus every non-generator table tagged with the group, recorded as a
`SettingsChanged` after the startup event. Nothing is emitted when the list would not change, or
when the seed or generator has no group. Applying another seed relinks from scratch, so the last
group wins. The Toolkits checklist does the same for the ticked groups, and **Game settings →
Active tables** lists tables under their tags (Untagged first) with a toggle per group. Untagged
tables stay active alongside a toolkit; turn them off in Game settings.

The game title is a label, not part of the history: `RenameGame` changes it at any time (Game
settings → Game name), including mid-turn, and is not a retcon.

Start can be revisited, and a new choice replaces the old one, until the Bookends are set. After
that the startup is fixed (commands are rejected with `setup-advanced`).

**Prefill.** Fields are filled only when the step opens with them empty:

- Premise: the seed's Big Picture draft (Lens) or Subject (Chronicle); the seed's pitch and notes,
  or the generator's reading, are shown beside the form and later in the left rail.
- Bookends: title from the chosen option's title, or its text cut to 60 characters at a word
  boundary (with a hint to shorten it); description from its text. Tones stay the player's choice.
- Palette: the seed's suggested Yes and No items appear as chips that add themselves when clicked.

**`seed.answers`.** Off (default): the player picks. Prompt: each question and Bookend question
can be rolled with a uniform die over its options; the roll preselects its option, and an answer
that leaves the rolled option out records `OverrideUsed`. Enforce: every question must be rolled
before applying; the rolled option is locked in (a second pick is free where two are allowed) and
written answers are refused. Pure Lens: off. High Friction: enforce.

## Setup

1. **Premise.** Lens: a Big Picture, one sentence, required, at most 200 characters. Chronicle: a
   Subject (see below).
2. **Bookends.** First and last Period, each with title (required, ≤ 60), description and a tone the
   player chooses. Both lock immediately. Nothing may be placed outside them.
3. **Palette.** Yes and No lists of short items (≤ 60 characters). With `palette.roll` on,
   `paletteRollCount` items (0–6; Game settings → Rolled Palette items at setup) are drawn from the
   player seat's palette tables. The default is 2, or one per player (at least two) in a group
   game; 0 rolls none, whatever the mode. Each rolled item is assigned to Yes or No by the player; the player assigns each to Yes or No. In prompt
   mode each rolled item may be rerolled once; in enforce mode not at all. Items can be added
   whenever no turn is open, and removed before play or between rounds.
4. **Seats.** At least one player seat and at most four seats in all (Microscope's maximum), so
   1–4 players and 0–3 phantoms. Default (Solo): _You_ (uniform bias) and one phantom, _The
   Stranger_ (sparse bias). **Group** play (New game → Options → Players) seats 2–4 named players
   sharing one device, plus phantoms up to four seats; players sit ahead of phantoms. Turns and the
   Lens rotate through every seat in order. Where the rules say "the player seat" (the Bookends'
   seat, the setup Palette rolls, draws outside a round) it means the first player seat. The
   roster is fixed once the First Pass starts; profiles (bias, tables, weights, Focus mode) can
   change before play and between rounds.
5. **First Pass.** Each seat, in seat order, adds one Period (strictly between the Bookends) or one
   Event (in any Period). The player chooses the tone. First Pass entries lock on creation.
6. **Dials.** Mood 1–9 (default 5), Cohesion 1–9 (default 5), Chaos 1–9 (default 5) only when Chaos
   is on.

Play starts with round 1 once all six are done. From then on tone is rolled.

## Round

1. **Focus.** The Lens seat is `seats[(n − 1) mod seats]`, so the Lens rotates once per round
   independently of turn order. The Focus is at most 80 characters.
   - Rolled Focus draws a source by weight, then an item. Sources with nothing to draw from weigh
     zero (no Legacies yet, no domain/focus tables, no deck).
     - _Legacy_: uniform among current Legacies.
     - _Domain_: one of the seat's `domain` or `focus` tables (a d*N* picks the table when there are
       several), then a line from it.
     - _Deck_: a card; the Focus is its keyword and name.
   - Chronicle: rolled Focus is uniform among the Subject's name and its current traits.
   - Enforce mode rolls and sets the Focus when the round starts.
2. **Turns.** Turns rotate through seats in order, continuing across rounds; Legacy turns take a
   seat too. The first turn of a round needs the Focus. Each turn:
   - **Tone**: d10 ≤ Mood is Light, otherwise Dark. With `deck.toneFromPip`, a card is drawn
     instead; a pip (1–10) is compared to Mood. Majors and courts fall back to a d10. The deck is
     drawn without replacement, so tone odds skew as it thins.
   - **Entry type**: when on, one weighted roll among kinds that have a legal slot (a Scene needs an
     Event to exist). Weights: the seat's, else the game's, else uniform — whichever gives a legal
     kind non-zero weight.
   - **Placement**: see below. Rolled once per turn, for one kind; the entry must be of that kind.
     Rolling for a kind other than a rolled entry type is an entry-type override (prompt) or
     rejected (enforce).
   - **On-demand prompts** (any time a round is open): domain line, word pair (an action and a
     subject rolled together), a card, a character card (courts only), a Scene Question idea, or a
     person. A Question idea rolls one active `question` table (a `d(N)` picks the table first when
     several are active). A person rolls one active `person` table per slot, in the order name,
     role, want (each slot picks its table the same way), and reads "{name}, {role}, who wants
     {want}", dropping the clause of a slot with no active table; with none at all the prompt is
     rejected (`content-missing`). Question ideas sit beside the Scene frame's Question field and
     people beside every new-character form (the Scene frame, the Scene editor and a Chronicle
     Period's new Anchor). Use copies the result into the form for editing: the Question, or the
     name plus "{role}, who wants {want}" as the description. Both buttons are hidden while no
     table of their kind is active. Rolled people ignore the Palette; discard a bad roll.
   - **Write**: title required (≤ 60). Periods and Events take a description; Scenes are framed.
   - **Commit** locks the entry's facts. Scenes commit by resolving.
   - **Cohesion**: after a normal turn commits, if the round is below the cap and the mode is on,
     d10 ≤ Cohesion means another turn. Enforce: the result decides. Prompt: the other choice is an
     override. Off: the player decides. At the cap (default 8 normal turns) the round moves on.
3. **Add a Legacy.** A concrete noun phrase (≤ 80 characters) tagged with the round's Lens seat and
   round. At most six. When six exist one leaves first: player's choice (`legacy.evict: off`) or a
   uniform roll.
4. **Explore a Legacy.** Required each round. The next seat in rotation takes a Legacy turn: one
   Event or Scene tied to the Legacy, tone rolled as usual, exempt from the Focus, no cohesion roll.
   A rolled choice weighs that seat's own Legacies 2 and the others 1.
5. **Adjust dials** and end the round. Drift:
   - `preference` (Lens): the player moves each of Mood and Cohesion by −1, 0 or +1.
   - `random`: a d6 per dial; 1–2 is −1, 3–4 no change, 5–6 is +1.
   - `counter-trend`: Mood moves 1 toward the tone that appeared less among this round's entries
     (up when Dark dominated, since high Mood favors Light; no change on a tie). Cohesion uses
     `random`.
   - Chaos, when on: +1 after a majority-Dark round, −1 after a majority-Light round.
   - All dials clamp to 1–9.

## Placement

Legal slots:

- **Period**: between two adjacent Periods, strictly inside the Bookends.
- **Event**: any position inside any Period (Bookends included).
- **Scene**: any position inside any Event.

The roll enumerates legal slots in timeline order, weights them by the active seat's bias, and rolls
one die of the total weight:

- `uniform`: 1 each.
- `early` / `late`: linear, N…1 or 1…N along the timeline.
- `sparse`: `round(2520 / (1 + children))`, where children is the number of Events in the
  containing Period or Scenes in the containing Event. For a Period slot it is the Events in the two
  neighboring Periods (an interpretation: a new Period has no container).

In prompt mode the player may choose another legal slot (logged); in off mode there is no roll.

## Scenes

1. **Frame**: Question (required, ≤ 140), tone (rolled), setting (optional, ≤ 140), required
   characters (0–2), banned characters (0–1, not also required), form `played` or `dictated`, word
   budget (default 300–900). The frame can be changed until drafting starts (any prose, spread or
   reversal).
2. **Draft**: the three-card spread (setup, complication, pressure) is optional, once per Scene. One
   reversal per Scene, drawn from the seat's `reversal` tables, or from the deck if it has none, and
   inserted at the cursor as `[[REVERSAL: text]]`.
   - prompt: drawing is on demand, and the text may be replaced (logged).
   - enforce: the reversal must be placed before resolving and cannot be replaced.
   - off: no reversals.
     The optional pause (`scene.pause`) shows a skippable countdown before an empty draft.
3. **Resolve**: the draft may not be empty. The word count excludes reversal markers; outside the
   budget is a warning, or a rejection when `scene.budget` is `enforce`. The answer is one sentence
   (≤ 200). Required characters plus any named ones are recorded; a banned character is rejected.
   Resolving commits the turn.
4. **Revise**: any time later, prose only. Every save is a revision; the play-time draft is kept as
   `playProse` and as the first revision.

## Oracle

Odds 1–9 in 10. d10 ≤ effective odds is yes. With qualifiers, a d6: 1 adds "but", 6 adds "and",
2–5 nothing. With Chaos on, effective odds = clamp(odds + floor((Chaos − 5) / 2), 1, 9). Asked from
the Scene editor, the call attaches to the Scene and locks with it. The Oracle can be asked at any
time; in group games the form asks who is asking (any player seat, defaulting to the seat whose
turn it is) and the call records it as `askedBy`, shown in the Oracle logs, the Scene's facts and
the play-order manuscript. The Scene editor also names whose Scene it is.

## Deck

A 78-card tarot model with one fixed keyword per side. Drawn without replacement per game; when the
remaining pile has no eligible card (empty, or no court left for a character prompt) the deck
reshuffles and logs `DeckReshuffled`. Reversal is a 50% d2 per draw when `deck.reversals` is on.

## Commit, undo and retcon

A turn stays open until committed. Undo (Ctrl/Cmd+Z, or the Undo button) removes the most recent
player-authored command in the open turn. It stops at any roll or draw: rolls persist, so undo can
never reroll. After commit, facts change only by retcon, which needs a reason and records before and
after. Retconnable: entry title and tone; Scene question, answer and setting; Legacy text; character
name, description and immortality; the Big Picture.

## Lens checks

Soft warnings, shown in the left rail, never blocking:

- A concrete date or duration in a title or prose (digits followed by year, century, decade,
  millennium, AD/BC/BCE/CE).
- A mortal character appearing in more than one Period.
- A character marked immortal.
- A Scene outside its word budget.

Titles are required and capped at 60 characters as hard validation, not a soft check: every export
needs a title.

## Chronicle

- **Subject** replaces the Big Picture: name, one-sentence description, 3–5 distinct traits.
- **Anchor**: every Period has exactly one, created with it or chosen from existing characters. The
  Bookends need Anchors too. A mortal character may not anchor a Period if it already appears in
  another Period, and a mortal Anchor may not appear (as a required or named Scene character) in any
  other Period. This is a hard rule here.
- **Change**: every non-Bookend Period adds, removes or modifies one trait. The Change is validated
  against the traits in force at the Period's place in the timeline. The Subject as of any Period is
  the base traits with every Change up to that Period applied in timeline order; a Change that no
  longer applies after a later insertion is skipped.
- Rolled Focus draws from the Subject and its current traits. Everything else works as in Lens.

## Interpretations

Places where the spec left room, and what the engine does:

- Evicting and exploring by roll use "the exploring seat" = the next seat in rotation.
- Exploring a Legacy is mandatory every round; there is no skip.
- The cohesion roll is skipped once the cap is reached, and never follows a Legacy turn.
- `palette.roll: enforce` rolls the items but allows no reroll; the player still assigns Yes/No.
- A seat's tables filter the game's active tables; a seat with none selected uses all active tables.
