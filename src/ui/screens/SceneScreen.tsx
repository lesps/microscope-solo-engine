import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wordCount, type Game, type Scene } from '../../engine';
import { useApp, useAppStore } from '../StoreContext';
import { Lock, ToneMark } from '../components/common';
import { OracleForm } from '../components/OracleDialog';
import { NewCharacterForm } from '../components/PromptTools';
import { RollList } from '../components/RollList';
import { useDispatch } from '../hooks/useGame';
import { useHotkeys } from '../hooks/useHotkeys';
import { useOpenGame } from '../hooks/useOpenGame';
import { navigate } from '../router';

export default function SceneScreen({ gameId, entryId }: { gameId: string; entryId: string }) {
  const status = useOpenGame(gameId);
  const scene = useApp((s) => s.current?.state.entries[entryId]);
  if (status === 'missing') return <div className="page">That game was not found.</div>;
  if (status === 'loading') return <div className="page">Loading…</div>;
  if (!scene || scene.kind !== 'scene')
    return <div className="page">That Scene was not found.</div>;
  return <SceneEditor key={scene.id} sceneId={scene.id} />;
}

function useTimer() {
  const [start, setStart] = useState<number | undefined>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (start === undefined) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [start]);
  const secs = start === undefined ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  return {
    running: start !== undefined,
    secs,
    toggle: () => {
      const t = Date.now();
      setNow(t);
      setStart((s) => (s === undefined ? t : undefined));
    },
  };
}

function Pause({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone]);
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-label="Pause before drafting"
        style={{ textAlign: 'center' }}
      >
        <h2>Pause</h2>
        <p>Before drafting, sit with the Question. What would each character want here?</p>
        <p style={{ fontSize: '2rem', fontFamily: 'var(--font)' }} aria-live="off">
          {left}s
        </p>
        <button onClick={onDone} autoFocus>
          Skip
        </button>
      </div>
    </div>
  );
}

function SceneEditor({ sceneId }: { sceneId: string }) {
  const store = useAppStore();
  const cur = useApp((s) => s.current)!;
  const g = cur.state;
  const scene = g.entries[sceneId] as Scene;
  const back = useCallback(() => navigate({ name: 'table', gameId: g.id }), [g.id]);
  const hotkeys = useMemo(() => ({ escape: back }), [back]);
  useHotkeys(hotkeys);
  const drafting = !scene.locked && g.turn?.entryId === scene.id;

  return (
    <div className="scene-editor" role="region" aria-label="Scene editor">
      <header>
        <div className="row spread">
          <div className="row">
            <ToneMark tone={scene.tone} />
            <span>{scene.title}</span>
            {scene.locked && <Lock />}
            <span className="badge">{scene.form}</span>
          </div>
          <button onClick={back}>Back to table</button>
        </div>
        <div className="scene-question" aria-label="Question">
          {scene.question}
        </div>
      </header>
      {drafting ? <Draft g={g} scene={scene} /> : <Revise g={g} scene={scene} />}
      {cur.rejection && (
        <div className="toast" role="alert">
          <span>{cur.rejection.message}</span>
          <button onClick={() => store.getState().clearRejection()}>OK</button>
        </div>
      )}
    </div>
  );
}

function Draft({ g, scene }: { g: Game; scene: Scene }) {
  const dispatch = useDispatch();
  const events = useApp((s) => s.current!.events);
  const [text, setText] = useState(scene.prose);
  const [answer, setAnswer] = useState('');
  const [named, setNamed] = useState<string[]>([]);
  const [customReversal, setCustomReversal] = useState('');
  const [paused, setPaused] = useState(!(g.settings.scene.pause && !scene.prose));
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useTimer();
  const dirty = useRef(false);
  const lastSent = useRef<string | undefined>(undefined);
  const rm = g.settings.modes['scene.reversal'];
  const rolledReversal = g.turn?.rolled.reversal;

  // Prose changed elsewhere (reversal insertion, undo) replaces the local draft; our own saves don't.
  useEffect(() => {
    if (scene.prose === lastSent.current) return;
    setText(scene.prose);
    dirty.current = false;
  }, [scene.prose]);

  const flush = useCallback(async () => {
    if (!dirty.current) return true;
    dirty.current = false;
    const prose = area.current?.value ?? '';
    lastSent.current = prose;
    return (await dispatch({ type: 'EditProse', entryId: scene.id, prose })).ok;
  }, [dispatch, scene.id]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void flush(), 1200);
    return () => clearTimeout(t);
  }, [text, flush]);

  const n = wordCount(text);
  const { min, max } = scene.budget;
  const outOfBudget = n < min || n > max;
  const turnEvents = events.filter(
    (e) =>
      g.turn &&
      e.seq >= g.turn.startSeq &&
      (e.type === 'CardDrawn' || (e.type === 'RollMade' && e.payload.purpose === 'scene.reversal')),
  );
  const characters = Object.values(g.characters);

  return (
    <div className="scene-body">
      {!paused && <Pause seconds={g.settings.scene.pauseSeconds} onDone={() => setPaused(true)} />}
      <div className="draft">
        <div
          className="row spread hint"
          style={{ maxWidth: '44em', width: '100%', margin: '0 auto 0.5em' }}
        >
          <span className={outOfBudget && n > 0 ? 'warn' : undefined} aria-live="polite">
            {n} words · budget {min}–{max}
            {g.settings.scene.budget === 'enforce' ? ' (enforced)' : ''}
          </span>
          <span className="row">
            {timer.running && (
              <span>{`${Math.floor(timer.secs / 60)}:${String(timer.secs % 60).padStart(2, '0')}`}</span>
            )}
            <button onClick={timer.toggle}>{timer.running ? 'Stop timer' : 'Timer'}</button>
          </span>
        </div>
        <textarea
          ref={area}
          aria-label="Scene draft"
          value={text}
          onChange={(e) => {
            dirty.current = true;
            setText(e.target.value);
          }}
          onBlur={() => void flush()}
          placeholder="Write until the Question is answered."
        />
      </div>
      <aside className="stack" aria-label="Scene tools">
        <section className="facts">
          {scene.setting && <div>Setting: {scene.setting}</div>}
          {scene.requiredCharacterIds.length > 0 && (
            <div>
              Must appear:{' '}
              {scene.requiredCharacterIds.map((id) => g.characters[id]?.name).join(', ')}
            </div>
          )}
          {scene.bannedCharacterIds.length > 0 && (
            <div>
              May not appear:{' '}
              {scene.bannedCharacterIds.map((id) => g.characters[id]?.name).join(', ')}
            </div>
          )}
          <div className="hint">A Scene ends when the Question is answered.</div>
        </section>

        <section className="stack">
          <h3>Spread</h3>
          {scene.spread?.length ? (
            <div>
              {scene.spread.map((c) => (
                <span className="tarot" key={c.cardId}>
                  <span className="hint">{c.role}</span>
                  <strong>{c.keyword}</strong>
                  {c.reversed && <span className="hint">reversed</span>}
                </span>
              ))}
            </div>
          ) : (
            <button
              onClick={() => dispatch({ type: 'DrawSpread', entryId: scene.id })}
              disabled={!g.deck}
            >
              Draw setup · complication · pressure
            </button>
          )}
        </section>

        {rm !== 'off' && (
          <section className="stack">
            <h3>Reversal {rm === 'enforce' && <span className="badge">required</span>}</h3>
            {scene.reversal ? (
              <p style={{ margin: 0 }}>
                Placed: <strong>{scene.reversal.text}</strong>
              </p>
            ) : rolledReversal ? (
              <>
                <p style={{ margin: 0 }}>
                  <strong>{rolledReversal.text}</strong>{' '}
                  <span className="hint">({rolledReversal.source})</span>
                </p>
                {rm === 'prompt' && (
                  <input
                    aria-label="Replace reversal (override)"
                    placeholder="…or your own (logged as an override)"
                    value={customReversal}
                    onChange={(e) => setCustomReversal(e.target.value)}
                  />
                )}
                <button
                  className="primary"
                  onClick={async () => {
                    if (!(await flush())) return;
                    const offset = Math.min(
                      area.current?.selectionStart ?? text.length,
                      text.length,
                    );
                    dispatch({
                      type: 'PlaceReversal',
                      entryId: scene.id,
                      offset,
                      text: customReversal.trim() || undefined,
                    });
                  }}
                >
                  Insert at cursor
                </button>
              </>
            ) : (
              <button onClick={() => dispatch({ type: 'DrawReversal', entryId: scene.id })}>
                Draw a reversal
              </button>
            )}
          </section>
        )}
        <RollList events={turnEvents} label="Scene draws" />

        <section className="stack">
          <h3>Oracle</h3>
          <OracleForm g={g} entryId={scene.id} />
        </section>

        <section className="stack">
          <h3>Characters</h3>
          <NewCharacterForm g={g} />
        </section>

        <section className="stack">
          <h3>Resolve</h3>
          <label>
            Answer in one sentence
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={200} />
          </label>
          {characters.length > 0 && (
            <label>
              Characters who appeared
              <select
                multiple
                value={named}
                onChange={(e) => setNamed(Array.from(e.target.selectedOptions, (o) => o.value))}
              >
                {characters
                  .filter((c) => !scene.bannedCharacterIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {outOfBudget && n > 0 && g.settings.scene.budget === 'warn' && (
            <p className="warn">Outside the word budget — allowed, but noted.</p>
          )}
          <button
            className="primary"
            disabled={!answer.trim() || !text.trim()}
            onClick={async () => {
              if (!(await flush())) return;
              const r = await dispatch({
                type: 'ResolveScene',
                entryId: scene.id,
                answer,
                characterIds: named,
              });
              if (r.ok) navigate({ name: 'table', gameId: g.id });
            }}
          >
            Resolve Scene and commit turn
          </button>
          <p className="hint">The Question, answer, oracle results and named characters lock.</p>
        </section>
      </aside>
    </div>
  );
}

function Revise({ g, scene }: { g: Game; scene: Scene }) {
  const dispatch = useDispatch();
  const [text, setText] = useState(scene.prose);
  const [view, setView] = useState<number | undefined>();
  const n = wordCount(text);
  return (
    <div className="scene-body">
      <div className="draft">
        <div
          className="facts"
          style={{ maxWidth: '44em', width: '100%', margin: '0 auto 0.8em' }}
          aria-label="Locked facts"
        >
          <div>
            <strong>Answer:</strong> {scene.answer ?? '—'}
          </div>
          {scene.characterIds.length > 0 && (
            <div>
              Characters: {scene.characterIds.map((id) => g.characters[id]?.name).join(', ')}
            </div>
          )}
          {scene.oracleCalls.length > 0 && (
            <div>
              Oracle:{' '}
              {scene.oracleCalls
                .map(
                  (c) =>
                    `${c.question} → ${c.answer ? 'yes' : 'no'}${c.qualifier ? `, ${c.qualifier}` : ''}`,
                )
                .join('; ')}
            </div>
          )}
          <div className="hint">Facts are read-only. Revisions change prose only.</div>
        </div>
        <div className="hint" style={{ maxWidth: '44em', width: '100%', margin: '0 auto' }}>
          {n} words
        </div>
        <textarea
          aria-label="Scene prose"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={!scene.locked}
        />
      </div>
      <aside className="stack" aria-label="Revisions">
        {scene.locked ? (
          <button
            className="primary"
            disabled={text === scene.prose}
            onClick={() => dispatch({ type: 'ReviseProse', entryId: scene.id, prose: text })}
          >
            Save revision
          </button>
        ) : (
          <p className="hint">This Scene belongs to a turn that is not open.</p>
        )}
        <h3>Revisions</h3>
        <ol style={{ paddingLeft: '1.2em' }}>
          {scene.revisions.map((r, i) => (
            <li key={r.seq}>
              <button className="link" onClick={() => setView(i)}>
                {i === 0 ? 'Play-time draft' : `Revision ${i}`}
              </button>{' '}
              <span className="hint">{new Date(r.at).toLocaleString()}</span>
            </li>
          ))}
        </ol>
        {view !== undefined && (
          <div className="stack">
            <p className="prose-preview">{scene.revisions[view]!.prose}</p>
            <button onClick={() => setText(scene.revisions[view]!.prose)}>Load into editor</button>
          </div>
        )}
      </aside>
    </div>
  );
}
