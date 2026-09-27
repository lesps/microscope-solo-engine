import { useEffect, useMemo, useState } from 'react';
import {
  currentRound,
  currentTraits,
  describePlacement,
  focusModeFor,
  legalSlots,
  nextSeat,
  nextStep,
  slotKey,
  type AnchorInput,
  type Command,
  type EntryKind,
  type Game,
  type GameEvent,
  type Mode,
  type Placement,
  type Settings,
  type Step,
  type Tone,
  type TraitChange,
} from '../../engine';
import { useApp, useAppStore } from '../StoreContext';
import { useDispatch } from '../hooks/useGame';
import { navigate } from '../router';
import { CharCount, ToneMark } from './common';
import { RollList } from './RollList';

const mode = (g: Game, m: keyof Settings['modes']): Mode => g.settings.modes[m];

const STEP_ORDER: { key: string; label: string; steps: Step[] }[] = [
  { key: 'focus', label: 'Focus', steps: ['focus'] },
  { key: 'turns', label: 'Turns', steps: ['start-turn', 'turn', 'cohesion'] },
  { key: 'legacy', label: 'Add a Legacy', steps: ['add-legacy'] },
  { key: 'explore', label: 'Explore a Legacy', steps: ['explore-legacy', 'legacy-turn'] },
  { key: 'dials', label: 'Adjust dials', steps: ['adjust-dials'] },
];

function StepList({ step }: { step: Step }) {
  const idx = STEP_ORDER.findIndex((s) => s.steps.includes(step));
  return (
    <ol className="steps" aria-label="Round steps">
      {STEP_ORDER.map((s, i) => (
        <li
          key={s.key}
          className={i < idx ? 'done' : i === idx ? 'current' : 'todo'}
          aria-current={i === idx ? 'step' : undefined}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function ModeNote({ m }: { m: Mode }) {
  if (m === 'enforce')
    return (
      <span className="badge" title="Rolled; no override">
        enforced
      </span>
    );
  if (m === 'prompt')
    return (
      <span className="badge" title="Rolled; overriding is logged">
        prompt
      </span>
    );
  return (
    <span className="badge" title="Player chooses">
      you choose
    </span>
  );
}

function FocusStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const r = currentRound(g)!;
  const lens = g.seats.find((s) => s.id === r.lensSeatId)!;
  const m = focusModeFor(g.settings, lens);
  const rolled = g.pendingRoundRolls.focus;
  const [text, setText] = useState('');
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        <strong>{lens.name}</strong> holds the Lens and sets the Focus. <ModeNote m={m} />
      </p>
      {m !== 'off' && !rolled && (
        <button
          className="primary"
          data-primary
          data-roll
          onClick={() => dispatch({ type: 'RollFocus' })}
        >
          Roll the Focus
        </button>
      )}
      {rolled && (
        <>
          <p style={{ margin: 0 }}>
            Rolled: <strong>{rolled.text}</strong> <span className="hint">({rolled.source})</span>
          </p>
          <button className="primary" data-primary onClick={() => dispatch({ type: 'SetFocus' })}>
            Accept Focus
          </button>
        </>
      )}
      {(m === 'off' || (m === 'prompt' && rolled)) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: 'SetFocus', text });
          }}
        >
          <label>
            {m === 'off' ? 'Focus' : 'Or write your own (logged as an override)'}{' '}
            <CharCount value={text} max={80} />
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} />
          </label>
          {g.ruleset === 'chronicle' && g.subject && (
            <div className="row hint" style={{ marginTop: '0.3em' }}>
              Subject and traits:
              {[g.subject.name, ...currentTraits(g)].map((t) => (
                <button type="button" className="badge" key={t} onClick={() => setText(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <button
            type="submit"
            className={m === 'off' ? 'primary' : undefined}
            data-primary={m === 'off' ? true : undefined}
            disabled={!text.trim()}
            style={{ marginTop: '0.5em' }}
          >
            Set Focus
          </button>
        </form>
      )}
    </div>
  );
}

interface EntryDraft {
  kind?: EntryKind;
  slot?: string;
  tone?: Tone;
  title: string;
  prose: string;
  question: string;
  setting: string;
  form: 'played' | 'dictated';
  required: string[];
  banned: string;
  budgetMin: number;
  budgetMax: number;
  anchorId: string;
  anchorName: string;
  anchorImmortal: boolean;
  changeOp: TraitChange['op'];
  trait: string;
  from: string;
  to: string;
}

function TurnStep({ g, events }: { g: Game; events: GameEvent[] }) {
  const dispatch = useDispatch();
  const t = g.turn!;
  const seat = g.seats.find((s) => s.id === t.seatId)!;
  const entry = t.entryId ? g.entries[t.entryId] : undefined;
  const em = mode(g, 'entryType');
  const pm = mode(g, 'placement');
  const tm = mode(g, 'tone');
  const allowed: EntryKind[] =
    t.kind === 'legacy' ? ['event', 'scene'] : ['period', 'event', 'scene'];
  const [d, setD] = useState<EntryDraft>(() => ({
    title: '',
    prose: '',
    question: '',
    setting: '',
    form: 'played',
    required: [],
    banned: '',
    budgetMin: g.settings.scene.defaultBudget.min,
    budgetMax: g.settings.scene.defaultBudget.max,
    anchorId: '',
    anchorName: '',
    anchorImmortal: false,
    changeOp: 'add',
    trait: '',
    from: '',
    to: '',
  }));
  const up = (p: Partial<EntryDraft>) => setD((x) => ({ ...x, ...p }));
  const kind: EntryKind | undefined =
    t.rolled.placement?.kind ?? d.kind ?? (em !== 'off' ? t.rolled.entryType : undefined);
  const slots = useMemo(() => (kind ? legalSlots(g, kind) : []), [g, kind]);
  const rolledSlot = t.rolled.placement?.placement;
  const chosenSlotKey = d.slot ?? (rolledSlot ? slotKey(rolledSlot) : undefined);
  const chosenSlot: Placement | undefined = slots.find(
    (s) => slotKey(s.placement) === chosenSlotKey,
  )?.placement;
  const tone = d.tone ?? t.rolled.tone;
  const [prose, setProse] = useState(entry?.prose ?? '');
  useEffect(() => setProse(entry?.prose ?? ''), [entry?.id, entry?.prose]);
  const characters = Object.values(g.characters);

  const create = () => {
    if (!kind || !chosenSlot) return;
    const cmd: Extract<Command, { type: 'CreateEntry' }> = {
      type: 'CreateEntry',
      kind,
      title: d.title,
      placement: chosenSlot,
      prose: d.prose,
    };
    if (tone) cmd.tone = tone;
    if (kind === 'scene') {
      cmd.scene = {
        question: d.question,
        form: d.form,
        setting: d.setting || undefined,
        requiredCharacterIds: d.required,
        bannedCharacterIds: d.banned ? [d.banned] : [],
        budget: { min: d.budgetMin, max: d.budgetMax },
      };
    }
    if (kind === 'period' && g.ruleset === 'chronicle') {
      const anchor: AnchorInput = d.anchorId
        ? { characterId: d.anchorId }
        : { name: d.anchorName, immortal: d.anchorImmortal };
      cmd.anchor = anchor;
      cmd.change =
        d.changeOp === 'modify'
          ? { op: 'modify', from: d.from, to: d.to }
          : { op: d.changeOp, trait: d.trait };
    }
    dispatch(cmd);
  };

  if (entry) {
    const isScene = entry.kind === 'scene';
    return (
      <div className="stack">
        <p style={{ margin: 0 }}>
          <ToneMark tone={entry.tone} /> <strong>{entry.title}</strong>{' '}
          <span className="badge">{entry.kind}</span>
        </p>
        {isScene ? (
          <>
            <p className="hint" style={{ margin: 0 }}>
              Draft the Scene in the editor; resolving it commits the turn.
            </p>
            <button
              className="primary"
              data-primary
              data-edit
              onClick={() => navigate({ name: 'scene', gameId: g.id, entryId: entry.id })}
            >
              Open Scene editor
            </button>
          </>
        ) : (
          <>
            <label>
              Description
              <textarea
                value={prose}
                onChange={(e) => setProse(e.target.value)}
                onBlur={() =>
                  prose !== entry.prose && dispatch({ type: 'EditProse', entryId: entry.id, prose })
                }
                rows={6}
              />
            </label>
            <button
              className="primary"
              data-primary
              onClick={async () => {
                if (prose !== entry.prose) {
                  const r = await dispatch({ type: 'EditProse', entryId: entry.id, prose });
                  if (!r.ok) return;
                }
                dispatch({ type: 'CommitTurn' });
              }}
            >
              Commit turn
            </button>
            <p className="hint" style={{ margin: 0 }}>
              Committing locks the facts. Prose stays revisable.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>{seat.name}</strong>’s turn
        {t.kind === 'legacy'
          ? ` — exploring “${g.legacies.find((l) => l.id === t.legacyId)?.text}” (exempt from the Focus)`
          : ''}
        .
      </p>
      <div className="row">
        <span>Tone:</span>
        {tm === 'off' || tm === 'prompt' ? (
          <select
            aria-label="Tone"
            value={tone ?? ''}
            onChange={(e) => up({ tone: (e.target.value || undefined) as Tone })}
            style={{ width: 'auto' }}
          >
            {!tone && <option value="">choose…</option>}
            <option value="light">○ Light{t.rolled.tone === 'light' ? ' (rolled)' : ''}</option>
            <option value="dark">● Dark{t.rolled.tone === 'dark' ? ' (rolled)' : ''}</option>
          </select>
        ) : (
          tone && (
            <strong>
              <ToneMark tone={tone} /> {tone === 'light' ? 'Light' : 'Dark'}
            </strong>
          )
        )}
        <ModeNote m={tm} />
      </div>
      <div className="row">
        <span>Entry:</span>
        <select
          aria-label="Entry type"
          value={kind ?? ''}
          disabled={!!t.rolled.placement || em === 'enforce'}
          onChange={(e) =>
            up({ kind: (e.target.value || undefined) as EntryKind, slot: undefined })
          }
          style={{ width: 'auto' }}
        >
          {!kind && <option value="">choose…</option>}
          {allowed.map((k) => (
            <option key={k} value={k} disabled={!legalSlots(g, k).length}>
              {k[0]!.toUpperCase() + k.slice(1)}
              {t.rolled.entryType === k ? ' (rolled)' : ''}
            </option>
          ))}
        </select>
        <ModeNote m={em} />
      </div>
      {kind && (
        <div className="row">
          <span>Placement:</span>
          {pm !== 'off' && !rolledSlot ? (
            <button
              type="button"
              className="primary"
              data-primary
              data-roll
              onClick={() => dispatch({ type: 'RollPlacement', kind })}
            >
              Roll placement
            </button>
          ) : (
            <select
              aria-label="Placement"
              value={chosenSlotKey ?? ''}
              disabled={pm === 'enforce'}
              onChange={(e) => up({ slot: e.target.value || undefined })}
            >
              {!chosenSlotKey && <option value="">choose…</option>}
              {slots.map((s) => (
                <option key={slotKey(s.placement)} value={slotKey(s.placement)}>
                  {describePlacement(g, kind, s.placement)}
                  {rolledSlot && slotKey(rolledSlot) === slotKey(s.placement) ? ' (rolled)' : ''}
                </option>
              ))}
            </select>
          )}
          <ModeNote m={pm} />
        </div>
      )}
      {kind && chosenSlot && (
        <>
          <label>
            Title <CharCount value={d.title} max={60} />
            <input value={d.title} onChange={(e) => up({ title: e.target.value })} />
          </label>
          {kind === 'scene' ? (
            <>
              <label>
                Question <CharCount value={d.question} max={140} />
                <input value={d.question} onChange={(e) => up({ question: e.target.value })} />
              </label>
              <label>
                Setting (optional)
                <input value={d.setting} onChange={(e) => up({ setting: e.target.value })} />
              </label>
              <div className="row">
                <label className="inline">
                  <input
                    type="radio"
                    checked={d.form === 'played'}
                    onChange={() => up({ form: 'played' })}
                  />{' '}
                  Played
                </label>
                <label className="inline">
                  <input
                    type="radio"
                    checked={d.form === 'dictated'}
                    onChange={() => up({ form: 'dictated' })}
                  />{' '}
                  Dictated
                </label>
              </div>
              {characters.length > 0 && (
                <>
                  <label>
                    Required characters (up to 2)
                    <select
                      multiple
                      value={d.required}
                      onChange={(e) =>
                        up({
                          required: Array.from(e.target.selectedOptions, (o) => o.value).slice(
                            0,
                            2,
                          ),
                        })
                      }
                    >
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Banned character
                    <select value={d.banned} onChange={(e) => up({ banned: e.target.value })}>
                      <option value="">none</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div className="row">
                <label className="inline">
                  Budget
                  <input
                    type="number"
                    aria-label="Minimum words"
                    value={d.budgetMin}
                    min={0}
                    onChange={(e) => up({ budgetMin: +e.target.value })}
                    style={{ width: '6em' }}
                  />
                  –
                  <input
                    type="number"
                    aria-label="Maximum words"
                    value={d.budgetMax}
                    min={0}
                    onChange={(e) => up({ budgetMax: +e.target.value })}
                    style={{ width: '6em' }}
                  />
                  words
                </label>
              </div>
            </>
          ) : (
            <label>
              Description
              <textarea value={d.prose} onChange={(e) => up({ prose: e.target.value })} rows={4} />
            </label>
          )}
          {kind === 'period' && g.ruleset === 'chronicle' && (
            <fieldset>
              <legend>Anchor and Change</legend>
              <label>
                Anchor
                <select value={d.anchorId} onChange={(e) => up({ anchorId: e.target.value })}>
                  <option value="">new character…</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.immortal ? ' (immortal)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {!d.anchorId && (
                <div className="row">
                  <input
                    aria-label="Anchor name"
                    placeholder="Name"
                    value={d.anchorName}
                    onChange={(e) => up({ anchorName: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={d.anchorImmortal}
                      onChange={(e) => up({ anchorImmortal: e.target.checked })}
                    />{' '}
                    immortal
                  </label>
                </div>
              )}
              <label>
                Change to the subject
                <select
                  value={d.changeOp}
                  onChange={(e) => up({ changeOp: e.target.value as TraitChange['op'] })}
                >
                  <option value="add">Add a trait</option>
                  <option value="remove">Remove a trait</option>
                  <option value="modify">Modify a trait</option>
                </select>
              </label>
              {d.changeOp === 'add' && (
                <input
                  aria-label="New trait"
                  placeholder="New trait"
                  value={d.trait}
                  onChange={(e) => up({ trait: e.target.value })}
                />
              )}
              {d.changeOp === 'remove' && (
                <select
                  aria-label="Trait to remove"
                  value={d.trait}
                  onChange={(e) => up({ trait: e.target.value })}
                >
                  <option value="">choose…</option>
                  {currentTraits(g).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              )}
              {d.changeOp === 'modify' && (
                <div className="row">
                  <select
                    aria-label="Trait to modify"
                    value={d.from}
                    onChange={(e) => up({ from: e.target.value })}
                    style={{ flex: 1 }}
                  >
                    <option value="">choose…</option>
                    {currentTraits(g).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  →
                  <input
                    aria-label="Modified trait"
                    value={d.to}
                    onChange={(e) => up({ to: e.target.value })}
                    style={{ flex: 1 }}
                  />
                </div>
              )}
              <p className="hint">Traits are checked as of this Period’s place in the timeline.</p>
            </fieldset>
          )}
          <button
            type="submit"
            className="primary"
            data-primary
            disabled={!d.title.trim() || !tone || (kind === 'scene' && !d.question.trim())}
          >
            {kind === 'scene' ? 'Frame Scene' : `Write ${kind}`}
          </button>
        </>
      )}
      <RollList events={events} label="This turn’s rolls" />
    </form>
  );
}

function LegacyForm({ g, alsoOverride }: { g: Game; alsoOverride?: boolean }) {
  const dispatch = useDispatch();
  const [text, setText] = useState('');
  const full = g.legacies.length >= 6;
  const em = mode(g, 'legacy.evict');
  const rolledEvict = g.pendingRoundRolls.evict;
  const [evict, setEvict] = useState('');
  const needsRoll = full && em !== 'off' && !rolledEvict;
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        dispatch({ type: 'AddLegacy', text, evictId: evict || undefined });
      }}
    >
      <label>
        Add a Legacy — a concrete noun phrase <CharCount value={text} max={80} />
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {full && (
        <div className="stack">
          <span className="hint">
            Six Legacies already: one leaves first. <ModeNote m={em} />
          </span>
          {needsRoll ? (
            <button type="button" data-roll onClick={() => dispatch({ type: 'RollEvict' })}>
              Roll which Legacy leaves
            </button>
          ) : (
            <select
              aria-label="Legacy to remove"
              value={evict || rolledEvict || ''}
              disabled={em === 'enforce'}
              onChange={(e) => setEvict(e.target.value)}
            >
              {!rolledEvict && <option value="">choose…</option>}
              {g.legacies.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.text}
                  {l.id === rolledEvict ? ' (rolled)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <button
        type="submit"
        className={alsoOverride ? undefined : 'primary'}
        data-primary={alsoOverride ? undefined : true}
        disabled={!text.trim() || needsRoll || (full && em === 'off' && !evict)}
      >
        Add Legacy{alsoOverride ? ' (override)' : ''}
      </button>
    </form>
  );
}

function CohesionStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const m = mode(g, 'cohesion');
  const rolled = g.pendingRoundRolls.cohesion;
  const next = nextSeat(g);
  const extraOk = m === 'off' || m === 'prompt' || rolled === true;
  const legacyOk = m === 'off' || m === 'prompt' || rolled === false;
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        Cohesion{' '}
        {m === 'off' ? (
          'is your call'
        ) : rolled ? (
          <strong>passed: another turn</strong>
        ) : (
          <strong>failed: on to Legacies</strong>
        )}
        . <ModeNote m={m} />
      </p>
      {extraOk && (
        <button
          className={rolled || m === 'off' ? 'primary' : undefined}
          data-primary={rolled || m === 'off' ? true : undefined}
          onClick={() => dispatch({ type: 'StartTurn' })}
        >
          Take another turn ({next.name}){m === 'prompt' && !rolled ? ' (override)' : ''}
        </button>
      )}
      {legacyOk && <LegacyForm g={g} alsoOverride={m === 'prompt' && rolled === true} />}
    </div>
  );
}

function ExploreStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const m = mode(g, 'legacy.explore');
  const rolled = g.pendingRoundRolls.explore;
  const [pick, setPick] = useState('');
  const seat = nextSeat(g);
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        <strong>{seat.name}</strong> explores a Legacy with one Event or Scene. <ModeNote m={m} />
      </p>
      {m !== 'off' && !rolled ? (
        <button
          className="primary"
          data-primary
          data-roll
          onClick={() => dispatch({ type: 'RollExplore' })}
        >
          Roll a Legacy
        </button>
      ) : (
        <>
          <select
            aria-label="Legacy to explore"
            value={pick || rolled || ''}
            disabled={m === 'enforce'}
            onChange={(e) => setPick(e.target.value)}
          >
            {!rolled && <option value="">choose…</option>}
            {g.legacies.map((l) => (
              <option key={l.id} value={l.id}>
                {l.text}
                {l.id === rolled ? ' (rolled)' : ''}
              </option>
            ))}
          </select>
          <button
            className="primary"
            data-primary
            disabled={!(pick || rolled)}
            onClick={() => dispatch({ type: 'ExploreLegacy', legacyId: pick || undefined })}
          >
            Explore
          </button>
        </>
      )}
    </div>
  );
}

function DialsStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const [mood, setMood] = useState<-1 | 0 | 1>(0);
  const [cohesion, setCohesion] = useState<-1 | 0 | 1>(0);
  const pref = g.settings.drift === 'preference';
  const sel = (label: string, v: -1 | 0 | 1, set: (x: -1 | 0 | 1) => void) => (
    <label className="inline">
      {label}
      <select
        value={v}
        onChange={(e) => set(+e.target.value as -1 | 0 | 1)}
        style={{ width: 'auto' }}
      >
        <option value={-1}>−1</option>
        <option value={0}>±0</option>
        <option value={1}>+1</option>
      </select>
    </label>
  );
  const describe: Record<Settings['drift'], string> = {
    preference: 'Move each dial by one, or leave it.',
    random: 'A d6 per dial: 1–2 is −1, 3–4 no change, 5–6 is +1.',
    'counter-trend':
      'Mood moves one step toward the tone that appeared less this round; Cohesion rolls a d6.',
  };
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>
        Drift: <strong>{g.settings.drift}</strong>.{' '}
        <span className="hint">{describe[g.settings.drift]}</span>
      </p>
      {pref && (
        <div className="row">
          {sel('Mood', mood, setMood)}
          {sel('Cohesion', cohesion, setCohesion)}
        </div>
      )}
      <button
        className="primary"
        data-primary
        data-roll={pref ? undefined : true}
        onClick={() => dispatch(pref ? { type: 'EndRound', mood, cohesion } : { type: 'EndRound' })}
      >
        Adjust dials and end round
      </button>
    </div>
  );
}

function Prompts({ g, onOracle }: { g: Game; onOracle: () => void }) {
  const dispatch = useDispatch();
  const prompts = g.turn?.prompts ?? [];
  return (
    <section aria-label="Prompts" className="stack">
      <h3>On-demand prompts</h3>
      <div className="row">
        <button onClick={() => dispatch({ type: 'DrawPrompt', kind: 'domain' })}>Domain</button>
        <button onClick={() => dispatch({ type: 'DrawPrompt', kind: 'wordPair' })}>
          Word pair
        </button>
        <button onClick={() => dispatch({ type: 'DrawPrompt', kind: 'card' })} disabled={!g.deck}>
          Card
        </button>
        <button
          onClick={() => dispatch({ type: 'DrawPrompt', kind: 'character' })}
          disabled={!g.deck}
        >
          Character
        </button>
        <button onClick={onOracle} aria-keyshortcuts="O">
          Oracle
        </button>
      </div>
      {prompts.length > 0 && (
        <ul className="rolls" aria-label="Prompts drawn">
          {prompts.map((p) => (
            <li key={p.seq}>
              <span className="die">{p.kind}</span> {p.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TurnPanel({
  g,
  events,
  onOracle,
}: {
  g: Game;
  events: GameEvent[];
  onOracle: () => void;
}) {
  const dispatch = useDispatch();
  const store = useAppStore();
  const canUndo = useApp((s) => !!s.current && s.canUndo());
  const step = nextStep(g);
  const r = currentRound(g);
  const roundStart =
    r && !r.ended ? events.findIndex((e) => e.type === 'RoundStarted' && e.payload.n === r.n) : -1;
  const turnEvents = g.turn ? events.filter((e) => e.seq >= g.turn!.startSeq) : [];
  const roundEvents =
    roundStart >= 0
      ? events.slice(roundStart).filter((e) => !g.turn || e.seq < g.turn.startSeq)
      : [];
  const lens = r ? g.seats.find((s) => s.id === r.lensSeatId) : undefined;
  const turnKey = g.turn ? `t${g.turn.startSeq}` : step;

  return (
    <div className="stack">
      <div>
        <h2 style={{ marginBottom: '0.2em' }}>
          {r && !r.ended ? `Round ${r.n}` : `Round ${(r?.n ?? 0) + 1}`}
        </h2>
        {r && !r.ended && (
          <div className="hint">
            Focus: <strong style={{ color: 'var(--text)' }}>{r.focus ?? '—'}</strong> · Lens:{' '}
            {lens?.name}
          </div>
        )}
      </div>
      {r && !r.ended && <StepList step={step} />}
      <div key={turnKey} aria-live="polite">
        {step === 'start-round' && (
          <button className="primary" data-primary onClick={() => dispatch({ type: 'StartRound' })}>
            Start round {(r?.n ?? 0) + 1}
          </button>
        )}
        {step === 'focus' && <FocusStep g={g} />}
        {step === 'start-turn' && (
          <button className="primary" data-primary onClick={() => dispatch({ type: 'StartTurn' })}>
            Start turn ({nextSeat(g).name})
          </button>
        )}
        {(step === 'turn' || step === 'legacy-turn') && <TurnStep g={g} events={turnEvents} />}
        {step === 'cohesion' && <CohesionStep g={g} />}
        {step === 'add-legacy' && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>
              The turn cap ({g.settings.cohesionCap}) is reached.
            </p>
            <LegacyForm g={g} />
          </div>
        )}
        {step === 'explore-legacy' && <ExploreStep g={g} />}
        {step === 'adjust-dials' && <DialsStep g={g} />}
      </div>
      {g.turn && (
        <button
          onClick={() => store.getState().undo()}
          disabled={!canUndo}
          aria-keyshortcuts="Control+Z Meta+Z"
        >
          Undo
        </button>
      )}
      {!g.turn && roundEvents.length > 0 && (
        <RollList events={roundEvents} label="This round’s rolls" />
      )}
      {r && !r.ended && <Prompts g={g} onOracle={onOracle} />}
    </div>
  );
}
