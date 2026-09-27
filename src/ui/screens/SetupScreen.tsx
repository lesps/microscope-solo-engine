import { useEffect, useState, type ReactNode } from 'react';
import {
  describePlacement,
  legalSlots,
  periods,
  slotKey,
  type AnchorInput,
  type Game,
  type Tone,
  type TraitChange,
} from '../../engine';
import { useApp } from '../StoreContext';
import { CharCount } from '../components/common';
import { RollList } from '../components/RollList';
import { SeatsEditor } from '../components/SeatsEditor';
import { useDispatch } from '../hooks/useGame';
import { useOpenGame } from '../hooks/useOpenGame';
import { navigate } from '../router';

export default function SetupScreen({ gameId }: { gameId: string }) {
  const status = useOpenGame(gameId);
  if (status === 'missing') return <div className="page">That game was not found.</div>;
  if (status === 'loading') return <div className="page">Loading…</div>;
  return <Wizard />;
}

const STEPS = ['Premise', 'Bookends', 'Palette', 'Seats', 'First Pass', 'Dials'] as const;

function firstIncomplete(g: Game, visited: Set<number>): number {
  if (g.ruleset === 'chronicle' ? !g.subject : !g.bigPicture) return 0;
  if (periods(g).length < 2) return 1;
  const fp = Object.values(g.entries).filter((e) => e.firstPass).length;
  if (fp === 0 && !visited.has(2)) return 2;
  if (fp === 0 && !visited.has(3)) return 3;
  if (fp < g.seats.length) return 4;
  return 5;
}

function Wizard() {
  const cur = useApp((s) => s.current)!;
  const g = cur.state;
  const [visited, setVisited] = useState(new Set<number>());
  const auto = firstIncomplete(g, visited);
  const [manual, setManual] = useState<number | undefined>();
  const step = manual !== undefined && manual <= auto ? manual : auto;
  const advance = () => {
    setVisited((v) => new Set(v).add(step));
    setManual(undefined);
  };
  const started = g.rounds.length > 0;
  useEffect(() => {
    if (started) navigate({ name: 'table', gameId: g.id });
  }, [started, g.id]);
  if (started) return null;
  return (
    <div className="page stack">
      <h1>{g.title}</h1>
      <ol className="row" aria-label="Setup steps" style={{ listStyle: 'none', padding: 0 }}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              aria-current={i === step ? 'step' : undefined}
              className={i === step ? 'primary' : undefined}
              disabled={i > auto}
              onClick={() => setManual(i)}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>
      <div className="card">
        {step === 0 && <PremiseStep g={g} />}
        {step === 1 && <BookendsStep g={g} />}
        {step === 2 && <PaletteStep g={g} onNext={advance} />}
        {step === 3 && (
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
        {step === 4 && <FirstPassStep g={g} />}
        {step === 5 && <DialsStep g={g} />}
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
  const [text, setText] = useState(g.bigPicture);
  const [name, setName] = useState(g.subject?.name ?? '');
  const [desc, setDesc] = useState(g.subject?.description ?? '');
  const [traits, setTraits] = useState((g.subject?.traits ?? ['', '', '']).join('\n'));
  if (g.ruleset === 'chronicle') {
    return (
      <Section title="Subject" intro="A place, organization or object whose history this is.">
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

function BookendsStep({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const blank: BookendDraft = { title: '', prose: '', tone: 'light', anchor: '', immortal: false };
  const [start, setStart] = useState(blank);
  const [end, setEnd] = useState({ ...blank, tone: 'dark' as Tone });
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
  const add = async (list: 'yes' | 'no', text: string, clear: () => void) => {
    if ((await dispatch({ type: 'AddPaletteItem', list, text })).ok) clear();
  };
  return (
    <Section
      title="Palette"
      intro="What belongs in this history (Yes) and what is banned (No). Short items."
    >
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
