import { useState } from 'react';
import { currentRound, currentTraits, softWarnings, type Game } from '../../engine';
import { useDispatch } from '../hooks/useGame';
import { StartupNotes } from './StartupPicker';

function PremiseNotes({ g }: { g: Game }) {
  if (!g.startup) return null;
  return (
    <details style={{ marginTop: '0.4em' }}>
      <summary className="hint">Premise notes</summary>
      <StartupNotes startup={g.startup} />
    </details>
  );
}

function Premise({ g }: { g: Game }) {
  if (g.ruleset === 'chronicle' && g.subject) {
    return (
      <section aria-label="Subject">
        <h3>Subject</h3>
        <p style={{ margin: 0 }}>
          <strong>{g.subject.name}</strong> — {g.subject.description}
        </p>
        <PremiseNotes g={g} />
        <div className="row" style={{ marginTop: '0.3em' }}>
          {currentTraits(g).map((t) => (
            <span key={t} className="badge">
              {t}
            </span>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Big Picture">
      <h3>Big Picture</h3>
      <p style={{ margin: 0, fontFamily: 'var(--font)' }}>{g.bigPicture}</p>
      <PremiseNotes g={g} />
    </section>
  );
}

function Palette({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const [text, setText] = useState('');
  const [list, setList] = useState<'yes' | 'no'>('yes');
  const r = currentRound(g);
  const between = !r || r.ended;
  return (
    <section aria-label="Palette">
      <h3>Palette</h3>
      {(['yes', 'no'] as const).map((k) => (
        <div key={k}>
          <strong style={{ fontSize: '0.85rem' }}>{k === 'yes' ? 'Yes' : 'No'}</strong>
          <ul className="palette-list">
            {g.palette[k].map((i) => (
              <li key={i.id}>
                <span>
                  {i.text} {i.rolled && <span className="badge">rolled</span>}
                </span>
                {between && (
                  <button
                    className="link"
                    aria-label={`Remove ${i.text}`}
                    onClick={() => dispatch({ type: 'RemovePaletteItem', id: i.id })}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
            {!g.palette[k].length && <li className="hint">—</li>}
          </ul>
        </div>
      ))}
      {!g.turn && (
        <form
          className="row"
          style={{ marginTop: '0.4em' }}
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await dispatch({ type: 'AddPaletteItem', list, text })).ok) setText('');
          }}
        >
          <select
            aria-label="Palette list"
            value={list}
            onChange={(e) => setList(e.target.value as 'yes' | 'no')}
            style={{ width: 'auto' }}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <input
            aria-label="New Palette item"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="submit" disabled={!text.trim()}>
            Add
          </button>
        </form>
      )}
    </section>
  );
}

function Legacies({ g }: { g: Game }) {
  const seatName = (id: string) => g.seats.find((s) => s.id === id)?.name ?? '?';
  return (
    <section aria-label="Legacies">
      <h3>Legacies ({g.legacies.length}/6)</h3>
      <ol className="legacy-slots">
        {Array.from({ length: 6 }, (_, i) => {
          const l = g.legacies[i];
          return (
            <li key={l?.id ?? `empty-${i}`} className={l ? 'filled' : undefined}>
              {l ? (
                <>
                  {l.text}{' '}
                  <span className="badge" title={`Added in round ${l.addedInRound}`}>
                    {seatName(l.seatId)} · R{l.addedInRound}
                  </span>
                </>
              ) : (
                <span className="hint">empty</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Seats({ g }: { g: Game }) {
  const r = currentRound(g);
  const activeId = g.turn?.seatId ?? (r && !r.ended && !r.focus ? r.lensSeatId : undefined);
  return (
    <section aria-label="Seats">
      <h3>Seats</h3>
      {g.seats.map((s) => {
        const foci = g.rounds.filter((x) => x.lensSeatId === s.id && x.focus).map((x) => x.focus!);
        const entries = Object.values(g.entries).filter(
          (e) => e.seatId === s.id && !(e.kind === 'period' && e.bookend),
        );
        return (
          <div
            key={s.id}
            className={`seat-card${s.id === activeId ? ' active' : ''}`}
            aria-current={s.id === activeId ? 'true' : undefined}
          >
            <div className="row spread">
              <strong>{s.name}</strong>
              <span className="badge">{s.kind}</span>
            </div>
            <div className="hint">
              bias: {s.placementBias} · tables: {s.tables.length ? s.tables.length : 'all'}
              {r && r.lensSeatId === s.id && !r.ended ? ' · holds the Lens' : ''}
            </div>
            {(foci.length > 0 || entries.length > 0) && (
              <ul>
                {foci.slice(-3).map((f, i) => (
                  <li key={`f${i}`}>Focus: {f}</li>
                ))}
                {entries.slice(-3).map((e) => (
                  <li key={e.id}>
                    {e.kind}: {e.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Dials({ g }: { g: Game }) {
  const rows: [string, number | undefined][] = [
    ['Mood', g.dials.mood],
    ['Cohesion', g.dials.cohesion],
  ];
  if (g.settings.chaos) rows.push(['Chaos', g.dials.chaos]);
  return (
    <section aria-label="Dials">
      <h3>Dials</h3>
      <div className="dials">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <span>{k}</span>
            <div
              className="dial-bar"
              role="meter"
              aria-label={k}
              aria-valuemin={1}
              aria-valuemax={9}
              aria-valuenow={v ?? 0}
            >
              <span style={{ width: `${((v ?? 0) / 9) * 100}%` }} />
            </div>
            <strong>{v ?? '—'}</strong>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        Tone: d10 ≤ Mood is Light. Cohesion: d10 ≤ Cohesion grants another turn.
      </p>
    </section>
  );
}

function Warnings({ g }: { g: Game }) {
  const ws = softWarnings(g);
  if (!ws.length) return null;
  return (
    <section aria-label="Lens checks">
      <h3>Lens checks</h3>
      <ul style={{ paddingLeft: '1.1em', margin: 0 }}>
        {ws.slice(0, 8).map((w, i) => (
          <li key={i} className="hint">
            {w.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LeftRail({ g }: { g: Game }) {
  return (
    <>
      <Premise g={g} />
      <Palette g={g} />
      <Legacies g={g} />
      <Seats g={g} />
      <Dials g={g} />
      <Warnings g={g} />
    </>
  );
}
