import { useState } from 'react';
import {
  MAX_SEATS,
  PRESETS,
  linkedActiveTables,
  type Content,
  type FromPack,
  type Generator,
  type PresetId,
  type Ruleset,
  type Seat,
  type Seed,
} from '../../engine';
import { useApp, useAppStore } from '../StoreContext';
import { firstSentence, toolkits } from '../components/StartupPicker';
import { localStore } from '../lib/standalone';
import { navigate, type StartChoice } from '../router';

export const LAST_PRESET_KEY = 'solo-microscope:last-preset';

type SeedC = Seed & FromPack;
type GeneratorC = Generator & FromPack;
type Choice =
  { kind: 'blank' } | { kind: 'seed'; seed: SeedC } | { kind: 'generator'; generator: GeneratorC };

const RULESET_NAME: Record<Ruleset, string> = { lens: 'Lens', chronicle: 'Chronicle' };

function lastPreset(): PresetId {
  const p = localStore(window).getItem(LAST_PRESET_KEY);
  return p && p in PRESETS ? (p as PresetId) : 'default';
}

/** Categories in pack order, each with its seeds and generators; uncategorized ones last. */
function categories(content: Content) {
  const seeds = Object.values(content.seeds);
  const generators = Object.values(content.generators);
  const known = (g?: string) => !!g && !!content.groups[g];
  const cats = Object.values(content.groups).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    seeds: seeds.filter((s) => s.group === g.id),
    generators: generators.filter((x) => x.group === g.id),
  }));
  cats.push({
    id: '',
    name: 'Other starts',
    description: undefined,
    seeds: seeds.filter((s) => !known(s.group)),
    generators: generators.filter((x) => !known(x.group)),
  });
  return cats.filter((c) => c.seeds.length || c.generators.length);
}

export default function NewGameScreen() {
  const content = useApp((s) => s.content);
  const cats = categories(content);
  const [choice, setChoice] = useState<Choice | undefined>(() =>
    cats.length ? undefined : { kind: 'blank' },
  );
  return (
    <div className="page stack">
      <h1>New game</h1>
      {choice ? (
        <NameForm
          key={choice.kind === 'blank' ? 'blank' : choiceId(choice)}
          choice={choice}
          content={content}
          onChange={cats.length ? () => setChoice(undefined) : undefined}
        />
      ) : (
        <section className="stack" aria-label="Choose a start">
          <h2>How do you want to start?</h2>
          <p className="hint" style={{ margin: 0 }}>
            A seed sets up a premise with a few questions; a generator rolls a Big Picture prompt.
            Either way you can edit everything before play.
          </p>
          <p style={{ margin: 0 }}>
            Prefer a blank page?{' '}
            <button className="link" onClick={() => setChoice({ kind: 'blank' })}>
              Start blank
            </button>
          </p>
          {cats.map((c) => (
            <section key={c.id} className="stack" aria-labelledby={`cat-${c.id}`}>
              <div>
                <h3 id={`cat-${c.id}`} style={{ margin: 0 }}>
                  {c.name}
                </h3>
                {c.description && <span className="hint">{c.description}</span>}
              </div>
              <div className="startup-cards">
                {c.seeds.map((s) => (
                  <button
                    key={s.id}
                    className="card startup-card"
                    onClick={() => setChoice({ kind: 'seed', seed: s })}
                  >
                    <strong>{s.title}</strong>
                    <span className="hint">{firstSentence(s.pitch)}</span>
                    {s.ruleset !== 'lens' && (
                      <span className="badge">
                        {s.ruleset === 'chronicle' ? 'Chronicle' : 'Lens or Chronicle'}
                      </span>
                    )}
                  </button>
                ))}
                {c.generators.map((x) => (
                  <button
                    key={x.id}
                    className="card startup-card"
                    onClick={() => setChoice({ kind: 'generator', generator: x })}
                  >
                    <strong>Roll {x.name}</strong>
                    <span className="hint">{x.description ?? 'A Big Picture prompt.'}</span>
                    <span className="badge">Generator</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </section>
      )}
    </div>
  );
}

function choiceId(c: Exclude<Choice, { kind: 'blank' }>) {
  return c.kind === 'seed' ? c.seed.id : c.generator.id;
}

function NameForm({
  choice,
  content,
  onChange,
}: {
  choice: Choice;
  content: Content;
  onChange?: () => void;
}) {
  const store = useAppStore();
  const decks = Object.values(content.decks);
  const kits = choice.kind === 'blank' ? toolkits(content) : [];
  const fixed: Ruleset | undefined =
    choice.kind === 'generator'
      ? 'lens'
      : choice.kind === 'seed' && choice.seed.ruleset !== 'any'
        ? choice.seed.ruleset
        : undefined;
  const [title, setTitle] = useState(
    choice.kind === 'seed'
      ? choice.seed.title
      : choice.kind === 'generator'
        ? choice.generator.name
        : '',
  );
  const [ruleset, setRuleset] = useState<Ruleset>(fixed ?? 'lens');
  const [preset, setPreset] = useState<PresetId>(lastPreset);
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '');
  const [linked, setLinked] = useState<string[]>([]);
  const [group, setGroup] = useState(false);
  const [names, setNames] = useState(['Player 1', 'Player 2']);
  const [phantomCount, setPhantomCount] = useState(0);
  const maxPhantoms = MAX_SEATS - names.length;
  const [busy, setBusy] = useState(false);

  const from =
    choice.kind === 'seed'
      ? { name: choice.seed.title, group: content.groups[choice.seed.group ?? '']?.name }
      : choice.kind === 'generator'
        ? { name: choice.generator.name, group: content.groups[choice.generator.group ?? '']?.name }
        : undefined;

  return (
    <section className="card stack" aria-labelledby="name-game">
      <h2 id="name-game" className="visually-hidden">
        Name your game
      </h2>
      <div className="row spread">
        <span>
          {from ? (
            <>
              Starting from <strong>{from.name}</strong>
              {from.group && <span className="hint"> · {from.group}</span>}
            </>
          ) : (
            <strong>Starting blank</strong>
          )}
        </span>
        {onChange && (
          <button type="button" className="link" onClick={onChange}>
            Change
          </button>
        )}
      </div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const s = store.getState();
          const id = await s.createGame({ title, ruleset, deckId: deckId || undefined });
          const created = store.getState().current!.state.settings;
          let settings = preset === 'default' ? created : PRESETS[preset].apply(created);
          if (linked.length)
            settings = {
              ...settings,
              activeTables: linkedActiveTables(content, settings.activeTables, linked),
            };
          if (settings !== created) await s.dispatch({ type: 'ChangeSettings', settings });
          if (group) {
            const [you, stranger] = store.getState().current!.state.seats;
            const seat = (i: number, kind: Seat['kind'], name: string, base?: Seat): Seat => ({
              id: base?.id ?? `seat-${Date.now().toString(36)}-${i}`,
              name,
              kind,
              tables: [],
              placementBias: kind === 'player' ? 'uniform' : 'sparse',
            });
            await s.dispatch({
              type: 'ConfigureSeats',
              seats: [
                ...names.map((n, i) =>
                  seat(i, 'player', n.trim() || `Player ${i + 1}`, i === 0 ? you : undefined),
                ),
                ...Array.from({ length: Math.min(phantomCount, maxPhantoms) }, (_, i) =>
                  seat(
                    names.length + i,
                    'phantom',
                    i === 0 ? 'The Stranger' : `Phantom ${i + 1}`,
                    i === 0 ? stranger : undefined,
                  ),
                ),
              ],
            });
          }
          localStore(window).setItem(LAST_PRESET_KEY, preset);
          const start: StartChoice =
            choice.kind === 'blank'
              ? { kind: 'blank' }
              : { kind: choice.kind, id: choiceId(choice) };
          navigate({ name: 'setup', gameId: id, start });
        }}
      >
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Name this history"
            autoFocus
          />
        </label>
        {fixed ? (
          <p className="hint" style={{ margin: 0 }}>
            Ruleset: {RULESET_NAME[fixed]}
          </p>
        ) : (
          <fieldset>
            <legend>Ruleset</legend>
            <label className="inline">
              <input
                type="radio"
                name="ruleset"
                checked={ruleset === 'lens'}
                onChange={() => setRuleset('lens')}
              />{' '}
              Lens — a history from a Big Picture
            </label>
            <label className="inline">
              <input
                type="radio"
                name="ruleset"
                checked={ruleset === 'chronicle'}
                onChange={() => setRuleset('chronicle')}
              />{' '}
              Chronicle — the history of one subject, with an Anchor per Period
            </label>
          </fieldset>
        )}
        {kits.length > 0 && (
          <fieldset>
            <legend>Toolkits</legend>
            <p className="hint" style={{ margin: 0 }}>
              Genre tables to draw from. Untagged tables are always on.
            </p>
            {kits.map((k) => (
              <label key={k.id} className="inline">
                <input
                  type="checkbox"
                  checked={linked.includes(k.id)}
                  onChange={(e) =>
                    setLinked((l) =>
                      e.target.checked ? [...l, k.id] : l.filter((x) => x !== k.id),
                    )
                  }
                />{' '}
                {k.name} <span className="hint">({k.tables.length} tables)</span>
              </label>
            ))}
          </fieldset>
        )}
        <details>
          <summary>Options</summary>
          <div className="stack" style={{ marginTop: '0.6em' }}>
            <fieldset className="stack">
              <legend>Players</legend>
              <label className="inline">
                <input
                  type="radio"
                  name="players"
                  checked={!group}
                  onChange={() => setGroup(false)}
                />{' '}
                Solo — you, with a phantom seat for company
              </label>
              <label className="inline">
                <input
                  type="radio"
                  name="players"
                  checked={group}
                  onChange={() => setGroup(true)}
                />{' '}
                Group — 2–{MAX_SEATS} people sharing this device, taking turns
              </label>
              {group && (
                <>
                  {names.map((n, i) => (
                    <div key={i} className="row">
                      <label style={{ flex: 1 }}>
                        Player {i + 1} name
                        <input
                          value={n}
                          maxLength={40}
                          onChange={(e) =>
                            setNames((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))
                          }
                        />
                      </label>
                      {i >= 2 && (
                        <button
                          type="button"
                          aria-label={`Remove Player ${i + 1}`}
                          onClick={() => setNames((xs) => xs.filter((_, j) => j !== i))}
                          style={{ alignSelf: 'flex-end' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="row">
                    <button
                      type="button"
                      disabled={names.length >= MAX_SEATS}
                      onClick={() => {
                        setNames((xs) => [...xs, `Player ${xs.length + 1}`]);
                        setPhantomCount((p) => Math.min(p, MAX_SEATS - names.length - 1));
                      }}
                    >
                      Add player
                    </button>
                    <label className="inline">
                      Phantom seats{' '}
                      <select
                        value={Math.min(phantomCount, maxPhantoms)}
                        onChange={(e) => setPhantomCount(+e.target.value)}
                        style={{ width: 'auto' }}
                      >
                        {Array.from({ length: maxPhantoms + 1 }, (_, k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="hint" style={{ margin: 0 }}>
                    Up to {MAX_SEATS} seats in all, as in Microscope. Phantom seats roll their own
                    turns.
                  </p>
                </>
              )}
            </fieldset>
            <label>
              Preset
              <select value={preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
                {(Object.keys(PRESETS) as PresetId[]).map((p) => (
                  <option key={p} value={p}>
                    {PRESETS[p].name}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint" style={{ margin: 0 }}>
              Pure Lens keeps Lens’s original behavior: tone and cohesion rolled, dials drift by
              preference, every extension off. Default adds rolled placement, phantom Focus and
              friction you can override. High Friction enforces every roll. Your last choice is
              remembered, and everything can be changed later in Game settings.
            </p>
            {decks.length > 1 && (
              <label>
                Deck
                <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </details>
        <button type="submit" className="primary" disabled={!title.trim() || busy}>
          Begin
        </button>
      </form>
    </section>
  );
}
