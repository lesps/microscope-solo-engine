import { useEffect, useMemo, useState } from 'react';
import {
  fillTemplate,
  linkedActiveTables,
  tablesByTag,
  type BookendAnswer,
  type BookendQuestion,
  type Content,
  type FromPack,
  type Game,
  type GameEvent,
  type Generator,
  type Id,
  type Mode,
  type Ruleset,
  type Seed,
  type SeedAnswer,
  type SeedQuestion,
} from '../../engine';
import { useApp } from '../StoreContext';
import { useDispatch } from '../hooks/useGame';

type SeedC = Seed & FromPack;
type GeneratorC = Generator & FromPack;

export const UNGROUPED = '';

const fits = (ruleset: Ruleset) => (s: Seed) => s.ruleset === 'any' || s.ruleset === ruleset;

/**
 * Seeds this game can use, and generators for Lens games: a generator's reading is a Big Picture
 * prompt, and Chronicle games have a Subject instead.
 */
export function startupContent(content: Content, ruleset: Ruleset) {
  return {
    seeds: Object.values(content.seeds).filter(fits(ruleset)),
    generators: ruleset === 'lens' ? Object.values(content.generators) : [],
  };
}

/** Installed groups that tag tables, offered on a blank start. */
export function toolkits(content: Content) {
  return [...tablesByTag(content)]
    .flatMap(([id, tables]) => {
      const group = content.groups[id];
      return group ? [{ id, name: group.name, tables: tables.map((t) => t.id) }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function hasStartupContent(content: Content, ruleset: Ruleset): boolean {
  const c = startupContent(content, ruleset);
  return c.seeds.length > 0 || c.generators.length > 0 || toolkits(content).length > 0;
}

export function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

/** Groups (in pack order) with the items that belong to them; Ungrouped last, if non-empty. */
function byGroup<T extends { group?: Id }>(content: Content, items: T[]) {
  const groups = Object.values(content.groups)
    .map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      items: items.filter((x) => x.group === g.id),
    }))
    .filter((g) => g.items.length);
  const ungrouped = items.filter((x) => !x.group || !content.groups[x.group]);
  if (ungrouped.length)
    groups.push({ id: UNGROUPED, name: 'Ungrouped', description: undefined, items: ungrouped });
  return groups;
}

type View =
  | { kind: 'home' }
  | { kind: 'groups' }
  | { kind: 'seeds'; group: string }
  | { kind: 'seed'; seedId: Id }
  | { kind: 'generators' }
  | { kind: 'generator'; generatorId: Id }
  | { kind: 'toolkits' };

export function StartupPicker({
  g,
  onDone,
  initial,
}: {
  g: Game;
  onDone: () => void;
  /** A seed or generator already chosen on the New game screen. */
  initial?: { kind: 'seed' | 'generator'; id: Id };
}) {
  const content = useApp((s) => s.content);
  const { seeds, generators } = startupContent(content, g.ruleset);
  const [view, setView] = useState<View>(() => {
    if (initial?.kind === 'seed' && seeds.some((s) => s.id === initial.id))
      return { kind: 'seed', seedId: initial.id };
    if (initial?.kind === 'generator' && generators.some((x) => x.id === initial.id))
      return { kind: 'generator', generatorId: initial.id };
    return { kind: 'home' };
  });
  const back = (to: View) => (
    <button className="link" onClick={() => setView(to)}>
      ← Back
    </button>
  );

  if (view.kind === 'home') {
    return (
      <section className="stack" aria-label="Start">
        <h2>Start</h2>
        <p className="hint">
          Begin from a seed or a generator to get a premise and Bookends drafted in a few choices,
          or start blank. You can edit everything afterwards.
        </p>
        {g.startup && (
          <p className="facts" style={{ margin: 0 }}>
            Current start:{' '}
            <strong>{g.startup.kind === 'seed' ? g.startup.title : g.startup.name}</strong>.
            Choosing again replaces it.
          </p>
        )}
        <div className="startup-cards">
          <button
            className="card startup-card"
            disabled={!seeds.length}
            onClick={() => setView({ kind: 'groups' })}
          >
            <strong>Start from a seed</strong>
            <span className="hint">A premise with a few questions that shape it.</span>
          </button>
          <button
            className="card startup-card"
            disabled={!generators.length}
            onClick={() => setView({ kind: 'generators' })}
          >
            <strong>Roll a generator</strong>
            <span className="hint">A Big Picture prompt from rolled tables.</span>
          </button>
          <button
            className="card startup-card"
            onClick={() => (toolkits(content).length ? setView({ kind: 'toolkits' }) : onDone())}
          >
            <strong>Start blank</strong>
            <span className="hint">Write the premise yourself.</span>
          </button>
        </div>
      </section>
    );
  }

  if (view.kind === 'toolkits') {
    return (
      <section className="stack" aria-label="Toolkits">
        {back({ kind: 'home' })}
        <Toolkits g={g} content={content} onDone={onDone} />
      </section>
    );
  }

  if (view.kind === 'groups') {
    return (
      <section className="stack" aria-label="Seed categories">
        {back({ kind: 'home' })}
        <h2>Choose a category</h2>
        <ul className="game-list">
          {byGroup(content, seeds).map((grp) => (
            <li key={grp.id}>
              <button
                className="card startup-card"
                onClick={() => setView({ kind: 'seeds', group: grp.id })}
              >
                <strong>{grp.name}</strong>
                {grp.description && <span className="hint">{grp.description}</span>}
                <span className="badge">
                  {grp.items.length} seed{grp.items.length === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (view.kind === 'seeds') {
    const grp = byGroup(content, seeds).find((x) => x.id === view.group);
    return (
      <section className="stack" aria-label="Seeds">
        {back({ kind: 'groups' })}
        <h2>{grp?.name ?? 'Seeds'}</h2>
        <ul className="game-list">
          {(grp?.items ?? []).map((s) => (
            <li key={s.id}>
              <button
                className="card startup-card"
                onClick={() => setView({ kind: 'seed', seedId: s.id })}
              >
                <strong>{s.title}</strong>
                <span className="hint">{firstSentence(s.pitch)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (view.kind === 'seed') {
    const seed = content.seeds[view.seedId];
    if (!seed) return <p>That seed is no longer installed.</p>;
    return (
      <SeedForm
        g={g}
        seed={seed}
        onBack={() =>
          setView({
            kind: 'seeds',
            group: seed.group && content.groups[seed.group] ? seed.group : UNGROUPED,
          })
        }
        onDone={onDone}
      />
    );
  }

  if (view.kind === 'generators') {
    return (
      <section className="stack" aria-label="Generators">
        {back({ kind: 'home' })}
        <h2>Choose a generator</h2>
        {byGroup(content, generators).map((grp) => (
          <div key={grp.id} className="stack">
            <h3>{grp.name}</h3>
            <ul className="game-list">
              {grp.items.map((gen) => (
                <li key={gen.id}>
                  <button
                    className="card startup-card"
                    onClick={() => setView({ kind: 'generator', generatorId: gen.id })}
                  >
                    <strong>{gen.name}</strong>
                    {gen.description && <span className="hint">{gen.description}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    );
  }

  const gen = content.generators[view.generatorId];
  if (!gen) return <p>That generator is no longer installed.</p>;
  return (
    <GeneratorPanel
      g={g}
      gen={gen}
      onBack={() => setView({ kind: 'generators' })}
      onDone={onDone}
    />
  );
}

// ---------------------------------------------------------------------------------------------

interface Answer {
  picked: Id[];
  custom: string;
}

function lastRoll(events: GameEvent[], seedId: Id, target: string) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (
      e.type === 'RollMade' &&
      e.payload.purpose === 'seed.answer' &&
      e.payload.targetId === target
    ) {
      const v = e.payload.value as { seedId: Id };
      if (v.seedId === seedId) return e.payload;
    }
  }
  return undefined;
}

function maxPicks(q: SeedQuestion | undefined): number {
  return q?.pick === 'one' || !q ? 1 : 2;
}

function SeedForm({
  g,
  seed,
  onBack,
  onDone,
}: {
  g: Game;
  seed: SeedC;
  onBack: () => void;
  onDone: () => void;
}) {
  const dispatch = useDispatch();
  const events = useApp((s) => s.current!.events);
  const m: Mode = g.settings.modes['seed.answers'];
  const rolled = g.pendingSeed?.seedId === seed.id ? g.pendingSeed.rolled : {};
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [bookendCustom, setBookendCustom] = useState<
    Record<'start' | 'end', { title: string; text: string }>
  >({
    start: { title: '', text: '' },
    end: { title: '', text: '' },
  });
  const get = (id: string): Answer => answers[id] ?? { picked: [], custom: '' };
  const set = (id: string, a: Partial<Answer>) =>
    setAnswers((x) => ({ ...x, [id]: { ...get(id), ...a } }));

  // A new roll selects its option (keeping a second pick where two are allowed).
  const rolledKey = JSON.stringify(rolled);
  useEffect(() => {
    setAnswers((x) => {
      const next = { ...x };
      for (const [target, optionId] of Object.entries(rolled)) {
        const prev = next[target] ?? { picked: [], custom: '' };
        if (prev.picked.includes(optionId)) continue;
        const max = maxPicks(seed.questions.find((q) => q.id === target));
        next[target] = { custom: '', picked: [optionId, ...prev.picked].slice(0, max) };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolledKey]);

  const toggle = (id: string, optionId: Id, max: number) => {
    const a = get(id);
    if (max === 1) return set(id, { picked: [optionId], custom: '' });
    const picked = a.picked.includes(optionId)
      ? a.picked.filter((x) => x !== optionId)
      : [...a.picked, optionId];
    if (picked.length <= max) set(id, { picked, custom: '' });
  };

  const questionReady = (q: SeedQuestion) => {
    const a = get(q.id);
    if (a.custom.trim()) return q.allowCustom;
    const n = a.picked.length;
    return q.pick === 'one' ? n === 1 : q.pick === 'two' ? n === 2 : n === 1 || n === 2;
  };
  const bookendReady = (which: 'start' | 'end') =>
    get(which).picked.length === 1 || !!bookendCustom[which].text.trim();
  const ready = seed.questions.every(questionReady) && bookendReady('start') && bookendReady('end');

  const apply = async () => {
    const out: Record<Id, SeedAnswer> = {};
    for (const q of seed.questions) {
      const a = get(q.id);
      out[q.id] = a.custom.trim() ? { custom: a.custom } : { optionIds: a.picked };
    }
    const bookend = (which: 'start' | 'end'): BookendAnswer => {
      const custom = bookendCustom[which];
      return custom.text.trim() && !get(which).picked.length
        ? { custom: { title: custom.title, text: custom.text } }
        : { optionId: get(which).picked[0]! };
    };
    const r = await dispatch({
      type: 'ApplySeed',
      seedId: seed.id,
      answers: out,
      start: bookend('start'),
      end: bookend('end'),
    });
    if (r.ok) onDone();
  };

  const rollButton = (target: string) =>
    m !== 'off' && (
      <button
        type="button"
        onClick={() => dispatch({ type: 'RollSeedAnswer', seedId: seed.id, questionId: target })}
      >
        {rolled[target] ? 'Roll again' : 'Roll'}
      </button>
    );
  const rollNote = (target: string) => {
    const r = lastRoll(events, seed.id, target);
    return (
      r &&
      rolled[target] && (
        <span className="die" aria-label={`Rolled d${r.sides}: ${r.result}`}>
          d{r.sides} → {r.result}
        </span>
      )
    );
  };

  const optionsFor = (
    id: string,
    options: { id: Id; text: string; title?: string }[],
    max: number,
    exact: boolean,
  ) => {
    const a = get(id);
    const rolledId = rolled[id];
    const locked = m === 'enforce';
    return (
      <div className="stack">
        <div className="row" style={{ gap: '0.5em' }}>
          {rollButton(id)}
          {rollNote(id)}
          {max === 2 && <span className="hint">{exact ? 'Pick two.' : 'Pick one or two.'}</span>}
        </div>
        {options.map((o) => {
          const checked = a.picked.includes(o.id);
          // Under enforce, nothing is pickable before the roll; after it, the roll is fixed and a
          // second pick (where two are allowed) is free.
          const disabled =
            locked && (!rolledId || o.id === rolledId || (max === 1 && o.id !== rolledId));
          return (
            <label key={o.id} className={`inline seed-option${o.id === rolledId ? ' rolled' : ''}`}>
              <input
                type={max === 1 ? 'radio' : 'checkbox'}
                name={`${seed.id}-${id}`}
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(id, o.id, max)}
              />
              <span>
                {o.title && <strong>{o.title}. </strong>}
                {o.text}
                {o.id === rolledId && <span className="badge">rolled</span>}
              </span>
            </label>
          );
        })}
      </div>
    );
  };

  const bookendFields = (which: 'start' | 'end', question: BookendQuestion) => (
    <fieldset key={which}>
      <legend>{question.text}</legend>
      {optionsFor(which, question.options, 1, true)}
      {m !== 'enforce' && (
        <div className="stack">
          <span className="hint">Or write your own:</span>
          <input
            aria-label={`${which === 'start' ? 'Start' : 'End'} Bookend title (your own)`}
            placeholder="Title"
            value={bookendCustom[which].title}
            onChange={(e) => {
              setBookendCustom((x) => ({ ...x, [which]: { ...x[which], title: e.target.value } }));
              set(which, { picked: [] });
            }}
          />
          <input
            aria-label={`${which === 'start' ? 'Start' : 'End'} Bookend text (your own)`}
            placeholder="What happens"
            value={bookendCustom[which].text}
            onChange={(e) => {
              setBookendCustom((x) => ({ ...x, [which]: { ...x[which], text: e.target.value } }));
              set(which, { picked: [] });
            }}
          />
        </div>
      )}
    </fieldset>
  );

  return (
    <section className="stack" aria-label={`Seed: ${seed.title}`}>
      <button className="link" onClick={onBack}>
        ← Back
      </button>
      <h2>{seed.title}</h2>
      <p className="hint" style={{ margin: 0 }}>
        From {seed.packName}
      </p>
      <p style={{ fontFamily: 'var(--font)' }}>{seed.pitch}</p>
      {m !== 'off' && (
        <p className="hint">
          Seed answers are{' '}
          {m === 'enforce'
            ? 'rolled and enforced: keep the rolled option.'
            : 'rolled; choosing another is logged as an override.'}
        </p>
      )}
      {seed.questions.map((q) => (
        <fieldset key={q.id}>
          <legend>{q.text}</legend>
          {optionsFor(q.id, q.options, maxPicks(q), q.pick === 'two')}
          {q.allowCustom && m !== 'enforce' && (
            <input
              aria-label={`Write your own: ${q.text}`}
              placeholder="Write your own"
              value={get(q.id).custom}
              onChange={(e) => set(q.id, { custom: e.target.value, picked: [] })}
            />
          )}
        </fieldset>
      ))}
      {bookendFields('start', seed.startBookend)}
      {bookendFields('end', seed.endBookend)}
      {seed.note && <p className="facts">{seed.note}</p>}
      <button className="primary" disabled={!ready} onClick={apply}>
        Apply seed
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function GeneratorPanel({
  g,
  gen,
  onBack,
  onDone,
}: {
  g: Game;
  gen: GeneratorC;
  onBack: () => void;
  onDone: () => void;
}) {
  const dispatch = useDispatch();
  const [swapped, setSwapped] = useState(false);
  const pending = g.pendingGenerator?.generatorId === gen.id ? g.pendingGenerator : undefined;
  const reading = useMemo(
    () =>
      pending ? fillTemplate(gen.template, pending.parts, swapped ? pending.swap : undefined) : '',
    [pending, gen.template, swapped],
  );
  return (
    <section className="stack" aria-label={`Generator: ${gen.name}`}>
      <button className="link" onClick={onBack}>
        ← Back
      </button>
      <h2>{gen.name}</h2>
      {gen.description && <p className="hint">{gen.description}</p>}
      {!pending ? (
        <button
          className="primary"
          onClick={() => dispatch({ type: 'RollGenerator', generatorId: gen.id })}
        >
          Roll
        </button>
      ) : (
        <>
          <ul className="rolls" aria-label="Rolled parts">
            {pending.parts.map((p, i) => (
              <li key={`${p.id}-${i}`}>
                <span className="die">{p.label}</span> {p.text}
              </li>
            ))}
          </ul>
          <p className="generator-reading" aria-label="Reading">
            {reading}
          </p>
          <p className="hint" style={{ margin: 0 }}>
            A prompt for your Big Picture, not the Big Picture itself.
          </p>
          <div className="row">
            {pending.swap && (
              <label className="inline">
                <input
                  type="checkbox"
                  checked={swapped}
                  onChange={(e) => setSwapped(e.target.checked)}
                />{' '}
                Swap
              </label>
            )}
            <button
              onClick={() => (
                setSwapped(false),
                dispatch({ type: 'RollGenerator', generatorId: gen.id })
              )}
            >
              Reroll
            </button>
            <button
              className="primary"
              onClick={async () => {
                if ((await dispatch({ type: 'AcceptGeneratorReading', swapped })).ok) onDone();
              }}
            >
              Use this reading
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

/** The chosen startup, shown beside the premise and in the left rail. */
export function StartupNotes({ startup }: { startup: Game['startup'] }) {
  if (!startup) return null;
  if (startup.kind === 'generator') {
    return (
      <div className="facts stack" aria-label="Startup">
        <div className="hint">
          From the generator <strong>{startup.name}</strong> ({startup.packName})
        </div>
        <p className="generator-reading" style={{ margin: 0 }}>
          {startup.reading}
        </p>
      </div>
    );
  }
  return (
    <div className="facts stack" aria-label="Startup">
      <div className="hint">
        From the seed <strong>{startup.title}</strong> ({startup.packName})
      </div>
      <p style={{ margin: 0 }}>{startup.pitch}</p>
      {startup.notes.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '1.1em' }}>
          {startup.notes.map((n) => (
            <li key={n.question}>
              <span className="hint">{n.question}</span> {n.answers.join(' · ')}
            </li>
          ))}
        </ul>
      )}
      {startup.note && (
        <p className="hint" style={{ margin: 0 }}>
          {startup.note}
        </p>
      )}
    </div>
  );
}

function Toolkits({ g, content, onDone }: { g: Game; content: Content; onDone: () => void }) {
  const dispatch = useDispatch();
  const list = toolkits(content);
  const active = new Set(g.settings.activeTables);
  const [checked, setChecked] = useState(
    () => new Set(list.filter((k) => k.tables.some((t) => active.has(t))).map((k) => k.id)),
  );
  return (
    <>
      <h2>Toolkits</h2>
      <p className="hint">
        Toolkit tables are off until a game is linked to them. Tick the genres this game should draw
        from; untagged tables stay as they are.
      </p>
      <div className="stack">
        {list.map((k) => (
          <label key={k.id} className="inline">
            <input
              type="checkbox"
              checked={checked.has(k.id)}
              onChange={(e) => {
                const next = new Set(checked);
                if (e.target.checked) next.add(k.id);
                else next.delete(k.id);
                setChecked(next);
              }}
            />{' '}
            {k.name} <span className="hint">({k.tables.length} tables)</span>
          </label>
        ))}
      </div>
      <button
        className="primary"
        onClick={async () => {
          const current = g.settings.activeTables;
          const activeTables = linkedActiveTables(content, current, [...checked]);
          if (activeTables.join('\n') !== current.join('\n')) {
            const r = await dispatch({
              type: 'ChangeSettings',
              settings: { ...g.settings, activeTables },
            });
            if (!r.ok) return;
          }
          onDone();
        }}
      >
        Continue
      </button>
    </>
  );
}
