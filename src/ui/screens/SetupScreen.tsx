import { useEffect, useState, type ReactNode } from 'react';
import {
  describePlacement,
  legalSlots,
  periods,
  slotKey,
  type AnchorInput,
  type Game,
  type StartupBookend,
  type Tone,
  type TraitChange,
} from '../../engine';
import { useApp } from '../StoreContext';
import { CharCount } from '../components/common';
import { RollList } from '../components/RollList';
import { SeatsEditor } from '../components/SeatsEditor';
import { StartupNotes, StartupPicker, hasStartupContent } from '../components/StartupPicker';
import { useDispatch } from '../hooks/useGame';
import { useOpenGame } from '../hooks/useOpenGame';
import { navigate, type StartChoice } from '../router';

export default function SetupScreen({ gameId, start }: { gameId: string; start?: StartChoice }) {
  const status = useOpenGame(gameId);
  if (status === 'missing') return <div className="page">That game was not found.</div>;
  if (status === 'loading') return <div className="page">Loading…</div>;
  return <Wizard start={start} />;
}

type StepKey = 'start' | 'premise' | 'bookends' | 'palette' | 'seats' | 'firstPass' | 'dials';
const LABELS: Record<StepKey, string> = {
  start: 'Start',
  premise: 'Premise',
  bookends: 'Bookends',
  palette: 'Palette',
  seats: 'Seats',
  firstPass: 'First Pass',
  dials: 'Dials',
};

function firstIncomplete(g: Game, visited: Set<StepKey>, startup: boolean): StepKey {
  const premiseSet = g.ruleset === 'chronicle' ? !!g.subject : !!g.bigPicture;
  if (startup && !g.startup && !premiseSet && !visited.has('start')) return 'start';
  if (!premiseSet) return 'premise';
  if (periods(g).length < 2) return 'bookends';
  const fp = Object.values(g.entries).filter((e) => e.firstPass).length;
  if (fp === 0 && !visited.has('palette')) return 'palette';
  if (fp === 0 && !visited.has('seats')) return 'seats';
  if (fp < g.seats.length) return 'firstPass';
  return 'dials';
}

function Wizard({ start }: { start?: StartChoice }) {
  const cur = useApp((s) => s.current)!;
  const content = useApp((s) => s.content);
  const g = cur.state;
  // The Start step is offered when enabled packs hold startup content for this ruleset, or a
  // startup was already chosen (so it stays visible even if its pack is later disabled).
  const startup = hasStartupContent(content, g.ruleset) || !!g.startup;
  const steps: StepKey[] = [
    ...(startup ? (['start'] as const) : []),
    'premise',
    'bookends',
    'palette',
    'seats',
    'firstPass',
    'dials',
  ];
  // A start chosen on the New game screen: blank skips Start; a seed or generator opens on it.
  const chosen = start && start.kind !== 'blank' && !g.startup ? start : undefined;
  const [visited, setVisited] = useState(
    () => new Set<StepKey>(start?.kind === 'blank' ? ['start'] : []),
  );
  const auto = firstIncomplete(g, visited, startup);
  const [manual, setManual] = useState<StepKey | undefined>(chosen ? 'start' : undefined);
  const reachable = (k: StepKey) =>
    k === 'start' ? periods(g).length < 2 : steps.indexOf(k) <= steps.indexOf(auto);
  const step = manual !== undefined && reachable(manual) ? manual : auto;
  const advance = () => {
    setVisited((v) => new Set(v).add(step));
    setManual(undefined);
  };
  const started = g.rounds.length > 0;
  useEffect(() => {
    if (started) navigate({ name: 'table', gameId: g.id });
  }, [started, g.id]);
  if (started) return null;
  const startLabel = g.startup
    ? `Start: ${g.startup.kind === 'seed' ? g.startup.title : g.startup.name}`
    : LABELS.start;
  return (
    <div className="page stack">
      <h1>{g.title}</h1>
      <ol className="row" aria-label="Setup steps" style={{ listStyle: 'none', padding: 0 }}>
        {steps.map((k, i) => (
          <li key={k}>
            <button
              aria-current={k === step ? 'step' : undefined}
              className={k === step ? 'primary' : undefined}
              disabled={!reachable(k)}
              onClick={() => setManual(k)}
            >
              {i + 1}. {k === 'start' ? startLabel : LABELS[k]}
            </button>
          </li>
        ))}
      </ol>
      <div className="card">
        {step === 'start' && (
          <StartupPicker
            key={g.startup ? 'chosen' : 'none'}
            g={g}
            onDone={advance}
            initial={chosen}
          />
        )}
        {step === 'premise' && <PremiseStep g={g} />}
        {step === 'bookends' && <BookendsStep g={g} />}
        {step === 'palette' && <PaletteStep g={g} onNext={advance} />}
        {step === 'seats' && (
          <Section
            title="Seats"
            intro="Seats are rotation slots with their own random profiles. You write every entry; a phantom seat only decides what the rolls draw from."
          >
            <SeatsEditor g={g} rosterLocked={Object.values(g.entries).some((e) => e.firstPass)} />
            <button className="primary" style={{ marginTop: '1em' }} onClick={advance}>
              Continue to the First Pass
            </button>
          </Section>
        )}
        {step === 'firstPass' && <FirstPassStep g={g} />}
        {step === 'dials' && <DialsStep g={g} />}
      </div>
      {cur.rejection && (
        <p role="alert" className="warn">
          {cur.rejection.message}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      {intro && <p className="hint">{intro}</p>}
      {children}
    </section>
  );
}

function PremiseStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const seed = g.startup?.kind === 'seed' ? g.startup : undefined;
  // A seed's draft prefills an empty field; a generator reading is a prompt and is never copied.
  const subject = g.subject ?? seed?.subject;
  const [text, setText] = useState(g.bigPicture || seed?.bigPictureDraft || '');
  const [name, setName] = useState(subject?.name ?? '');
  const [desc, setDesc] = useState(subject?.description ?? '');
  const [traits, setTraits] = useState((subject?.traits ?? ['', '', '']).join('\n'));
  const notes = g.startup && <StartupNotes startup={g.startup} />;
  if (g.ruleset === 'chronicle') {
    return (
      <Section title="Subject" intro="A place, organization or object whose history this is.">
        {notes}
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({
              type: 'SetSubject',
              subject: {
                name,
                description: desc,
                traits: traits
                  .split('\n')
                  .map((t) => t.trim())
                  .filter(Boolean),
              },
            });
          }}
        >
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            One-sentence description <CharCount value={desc} max={200} />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <label>
            Traits (3–5, one per line)
            <textarea value={traits} onChange={(e) => setTraits(e.target.value)} rows={5} />
          </label>
          <button type="submit" className="primary">
            Set Subject
          </button>
        </form>
      </Section>
    );
  }
  return (
    <Section title="Big Picture" intro="One sentence: what is this history about?">
      {notes}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: 'SetBigPicture', text });
        }}
      >
        <label>
          Big Picture <CharCount value={text} max={200} />
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={!text.trim()}>
          Set Big Picture
        </button>
      </form>
    </Section>
  );
}

function BookendFields({
  label,
  v,
  set,
  chronicle,
}: {
  label: string;
  v: BookendDraft;
  set: (p: Partial<BookendDraft>) => void;
  chronicle: boolean;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <label>
        Title <CharCount value={v.title} max={60} />
        <input
          aria-label={`${label} title`}
          value={v.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          aria-label={`${label} description`}
          value={v.prose}
          onChange={(e) => set({ prose: e.target.value })}
          rows={3}
        />
      </label>
      <ToneRadio name={label} tone={v.tone} set={(tone) => set({ tone })} />
      {chronicle && (
        <div className="row">
          <input
            aria-label={`${label} Anchor`}
            placeholder="Anchor character"
            value={v.anchor}
            onChange={(e) => set({ anchor: e.target.value })}
            style={{ flex: 1 }}
          />
          <label className="inline">
            <input
              type="checkbox"
              checked={v.immortal}
              onChange={(e) => set({ immortal: e.target.checked })}
            />{' '}
            immortal
          </label>
        </div>
      )}
    </fieldset>
  );
}

function ToneRadio({ name, tone, set }: { name: string; tone: Tone; set: (t: Tone) => void }) {
  return (
    <div className="row" role="radiogroup" aria-label={`${name} tone`}>
      <label className="inline">
        <input
          type="radio"
          name={`${name}-tone`}
          checked={tone === 'light'}
          onChange={() => set('light')}
        />{' '}
        ○ Light
      </label>
      <label className="inline">
        <input
          type="radio"
          name={`${name}-tone`}
          checked={tone === 'dark'}
          onChange={() => set('dark')}
        />{' '}
        ● Dark
      </label>
    </div>
  );
}

interface BookendDraft {
  title: string;
  prose: string;
  tone: Tone;
  anchor: string;
  immortal: boolean;
}

/** A Bookend title from a seed: its own title, else its text cut to 60 at a word boundary. */
export function bookendTitle(b: StartupBookend): { title: string; cut: boolean } {
  if (b.title) return { title: b.title, cut: false };
  if (b.text.length <= 60) return { title: b.text, cut: false };
  const head = b.text.slice(0, 61);
  const space = head.lastIndexOf(' ');
  return {
    title: (space > 20 ? head.slice(0, space) : b.text.slice(0, 60)).replace(/[\s,;:.]+$/, ''),
    cut: true,
  };
}

function BookendsStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const blank: BookendDraft = { title: '', prose: '', tone: 'light', anchor: '', immortal: false };
  const seed = g.startup?.kind === 'seed' ? g.startup : undefined;
  const from = (b: StartupBookend | undefined) =>
    b ? { title: bookendTitle(b).title, prose: b.text } : {};
  const [start, setStart] = useState({ ...blank, ...from(seed?.bookends.start) });
  const [end, setEnd] = useState({ ...blank, tone: 'dark' as Tone, ...from(seed?.bookends.end) });
  const cut =
    seed && (bookendTitle(seed.bookends.start).cut || bookendTitle(seed.bookends.end).cut);
  const chronicle = g.ruleset === 'chronicle';
  const input = (b: BookendDraft) => ({
    title: b.title,
    prose: b.prose,
    tone: b.tone,
    ...(chronicle ? { anchor: { name: b.anchor, immortal: b.immortal } } : {}),
  });
  return (
    <Section
      title="Bookends"
      intro="The first and last Periods. Nothing may be placed outside them."
    >
      {seed && (
        <p className="hint" style={{ margin: 0 }}>
          Drafted from {seed.title}. Choose each tone and edit anything.
          {cut && ' A title was cut from its text; you may want to shorten it.'}
        </p>
      )}
      <BookendFields
        label="First Period"
        v={start}
        set={(p) => setStart((x) => ({ ...x, ...p }))}
        chronicle={chronicle}
      />
      <BookendFields
        label="Last Period"
        v={end}
        set={(p) => setEnd((x) => ({ ...x, ...p }))}
        chronicle={chronicle}
      />
      <button
        className="primary"
        disabled={!start.title.trim() || !end.title.trim()}
        onClick={() => dispatch({ type: 'SetBookends', start: input(start), end: input(end) })}
      >
        Set Bookends
      </button>
    </Section>
  );
}

function PaletteStep({ g, onNext }: { g: Game; onNext: () => void }) {
  const dispatch = useDispatch();
  const events = useApp((s) => s.current!.events);
  const [yes, setYes] = useState('');
  const [no, setNo] = useState('');
  const m = g.settings.modes['palette.roll'];
  const pending = g.pendingPalette;
  const suggested = g.startup?.kind === 'seed' ? g.startup.palette : undefined;
  const [dismissed, setDismissed] = useState(false);
  const present = new Set([...g.palette.yes, ...g.palette.no].map((i) => i.text.toLowerCase()));
  const chips =
    dismissed || !suggested
      ? []
      : (['yes', 'no'] as const).flatMap((list) =>
          suggested[list]
            .filter((t) => !present.has(t.toLowerCase()))
            .map((t) => ({ list, text: t })),
        );
  const add = async (list: 'yes' | 'no', text: string, clear: () => void) => {
    if ((await dispatch({ type: 'AddPaletteItem', list, text })).ok) clear();
  };
  return (
    <Section
      title="Palette"
      intro="What belongs in this history (Yes) and what is banned (No). Short items."
    >
      {chips.length > 0 && (
        <div className="row" role="group" aria-label="Suggested Palette items">
          <span className="hint">Suggested:</span>
          {chips.map((c) => (
            <button
              key={`${c.list}:${c.text}`}
              className="chip"
              onClick={() => dispatch({ type: 'AddPaletteItem', list: c.list, text: c.text })}
            >
              {c.list === 'yes' ? 'Yes' : 'No'}: {c.text}
            </button>
          ))}
          <button className="link" onClick={() => setDismissed(true)}>
            Dismiss all
          </button>
        </div>
      )}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {(['yes', 'no'] as const).map((k) => (
          <div key={k} style={{ flex: 1, minWidth: 220 }}>
            <strong>{k === 'yes' ? 'Yes' : 'No'}</strong>
            <ul>
              {g.palette[k].map((i) => (
                <li key={i.id}>
                  {i.text} {i.rolled && <span className="badge">rolled</span>}{' '}
                  <button
                    className="link"
                    aria-label={`Remove ${i.text}`}
                    onClick={() => dispatch({ type: 'RemovePaletteItem', id: i.id })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (k === 'yes') add('yes', yes, () => setYes(''));
                else add('no', no, () => setNo(''));
              }}
            >
              <input
                aria-label={`Add to ${k === 'yes' ? 'Yes' : 'No'}`}
                value={k === 'yes' ? yes : no}
                onChange={(e) => (k === 'yes' ? setYes : setNo)(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit">Add</button>
            </form>
          </div>
        ))}
      </div>
      {m !== 'off' && (
        <fieldset>
          <legend>
            Rolled items ({g.paletteRolled}/{g.settings.paletteRollCount})
          </legend>
          {pending ? (
            <div className="stack">
              <p style={{ margin: 0 }}>
                Rolled: <strong>{pending.text}</strong>
              </p>
              <div className="row">
                <button onClick={() => dispatch({ type: 'AssignPaletteRoll', list: 'yes' })}>
                  Add to Yes
                </button>
                <button onClick={() => dispatch({ type: 'AssignPaletteRoll', list: 'no' })}>
                  Add to No
                </button>
                {m === 'prompt' && (
                  <button
                    disabled={pending.rerolled}
                    onClick={() => dispatch({ type: 'RerollPaletteItem' })}
                  >
                    Reroll{pending.rerolled ? ' (used)' : ''}
                  </button>
                )}
              </div>
            </div>
          ) : g.paletteRolled < g.settings.paletteRollCount ? (
            <button onClick={() => dispatch({ type: 'RollPaletteItem' })}>
              Roll a Palette item
            </button>
          ) : (
            <p className="hint">All rolled items placed.</p>
          )}
          <RollList
            events={events.filter((e) => e.type === 'RollMade' && e.payload.purpose === 'palette')}
            label="Palette rolls"
          />
        </fieldset>
      )}
      <button className="primary" onClick={onNext} disabled={!!pending}>
        Continue
      </button>
    </Section>
  );
}

function FirstPassStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const done = Object.values(g.entries).filter((e) => e.firstPass).length;
  const seat = g.seats[done];
  const [kind, setKind] = useState<'period' | 'event'>('period');
  const [title, setTitle] = useState('');
  const [prose, setProse] = useState('');
  const [tone, setTone] = useState<Tone>('light');
  const [slot, setSlot] = useState('');
  const [anchor, setAnchor] = useState('');
  const [change, setChange] = useState<TraitChange>({ op: 'add', trait: '' });
  const slots = legalSlots(g, kind);
  const chosen = slots.find((s) => slotKey(s.placement) === slot)?.placement ?? slots[0]?.placement;
  if (!seat) return <p>Every seat has added its First Pass entry.</p>;
  const reset = () => {
    setTitle('');
    setProse('');
    setAnchor('');
    setSlot('');
    setChange({ op: 'add', trait: '' });
  };
  return (
    <Section
      title={`First Pass — ${seat.name}`}
      intro={`Each seat adds one Period or Event, in seat order (${done + 1} of ${g.seats.length}). You choose the tone.`}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!chosen) return;
          const a: AnchorInput | undefined =
            g.ruleset === 'chronicle' && kind === 'period' ? { name: anchor } : undefined;
          const r = await dispatch({
            type: 'AddFirstPassEntry',
            kind,
            title,
            tone,
            prose,
            placement: chosen,
            anchor: a,
            change: g.ruleset === 'chronicle' && kind === 'period' ? change : undefined,
          });
          if (r.ok) reset();
        }}
      >
        <div className="row">
          <label className="inline">
            <input
              type="radio"
              checked={kind === 'period'}
              onChange={() => (setKind('period'), setSlot(''))}
            />{' '}
            Period
          </label>
          <label className="inline">
            <input
              type="radio"
              checked={kind === 'event'}
              onChange={() => (setKind('event'), setSlot(''))}
            />{' '}
            Event
          </label>
        </div>
        <label>
          Placement
          <select value={chosen ? slotKey(chosen) : ''} onChange={(e) => setSlot(e.target.value)}>
            {slots.map((s) => (
              <option key={slotKey(s.placement)} value={slotKey(s.placement)}>
                {describePlacement(g, kind, s.placement)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title <CharCount value={title} max={60} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Description
          <textarea value={prose} onChange={(e) => setProse(e.target.value)} rows={3} />
        </label>
        <ToneRadio name="first-pass" tone={tone} set={setTone} />
        {g.ruleset === 'chronicle' && kind === 'period' && (
          <fieldset>
            <legend>Anchor and Change</legend>
            <input
              aria-label="Anchor name"
              placeholder="Anchor character"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
            <div className="row" style={{ marginTop: '0.4em' }}>
              <select
                aria-label="Change"
                value={change.op}
                onChange={(e) => setChange({ op: e.target.value as TraitChange['op'] })}
                style={{ width: 'auto' }}
              >
                <option value="add">Add trait</option>
                <option value="remove">Remove trait</option>
                <option value="modify">Modify trait</option>
              </select>
              {change.op === 'modify' ? (
                <>
                  <input
                    aria-label="From trait"
                    placeholder="from"
                    value={change.from ?? ''}
                    onChange={(e) => setChange({ ...change, from: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <input
                    aria-label="To trait"
                    placeholder="to"
                    value={change.to ?? ''}
                    onChange={(e) => setChange({ ...change, to: e.target.value })}
                    style={{ flex: 1 }}
                  />
                </>
              ) : (
                <input
                  aria-label="Trait"
                  placeholder="trait"
                  value={change.trait ?? ''}
                  onChange={(e) => setChange({ ...change, trait: e.target.value })}
                  style={{ flex: 1 }}
                />
              )}
            </div>
            <p className="hint">Subject traits: {g.subject?.traits.join(', ')}</p>
          </fieldset>
        )}
        <button type="submit" className="primary" disabled={!title.trim() || !chosen}>
          Add First Pass entry
        </button>
      </form>
    </Section>
  );
}

function DialsStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const [mood, setMood] = useState(g.dials.mood);
  const [cohesion, setCohesion] = useState(g.dials.cohesion);
  const [chaos, setChaos] = useState(g.dials.chaos ?? 5);
  const slider = (label: string, v: number, set: (n: number) => void, hint: string) => (
    <label>
      {label}: {v}
      <input type="range" min={1} max={9} value={v} onChange={(e) => set(+e.target.value)} />
      <span className="hint">{hint}</span>
    </label>
  );
  return (
    <Section title="Dials" intro="From here on, tone is always rolled.">
      {slider('Mood', mood, setMood, 'd10 ≤ Mood makes an entry Light.')}
      {slider(
        'Cohesion',
        cohesion,
        setCohesion,
        'd10 ≤ Cohesion grants another turn in the round.',
      )}
      {g.settings.chaos &&
        slider('Chaos', chaos, setChaos, 'Skews the oracle and drifts with the round’s tone.')}
      <div className="row" style={{ marginTop: '1em' }}>
        <button
          onClick={() =>
            dispatch({
              type: 'SetDials',
              mood,
              cohesion,
              chaos: g.settings.chaos ? chaos : undefined,
            })
          }
        >
          {g.dialsSet ? 'Update dials' : 'Set dials'}
        </button>
        <button
          className="primary"
          disabled={Object.values(g.entries).filter((e) => e.firstPass).length < g.seats.length}
          onClick={async () => {
            if (!g.dialsSet || g.dials.mood !== mood || g.dials.cohesion !== cohesion) {
              const r = await dispatch({
                type: 'SetDials',
                mood,
                cohesion,
                chaos: g.settings.chaos ? chaos : undefined,
              });
              if (!r.ok) return;
            }
            const r = await dispatch({ type: 'StartRound' });
            if (r.ok) navigate({ name: 'table', gameId: g.id });
          }}
        >
          Begin round 1
        </button>
      </div>
    </Section>
  );
}
