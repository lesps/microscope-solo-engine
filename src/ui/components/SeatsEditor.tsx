import { useState } from 'react';
import type { Game, Mode, PlacementBias, Seat, Table } from '../../engine';
import { useApp } from '../StoreContext';
import { useDispatch } from '../hooks/useGame';

export function SeatsEditor({ g, rosterLocked }: { g: Game; rosterLocked: boolean }) {
  const dispatch = useDispatch();
  const all = useApp((s) => s.content.tables);
  const tables = g.settings.activeTables.map((id) => all[id]).filter((t): t is Table => !!t);
  const [seats, setSeats] = useState<Seat[]>(g.seats);
  const [saved, setSaved] = useState(false);
  const up = (i: number, p: Partial<Seat>) => {
    setSaved(false);
    setSeats((xs) => xs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  };
  const phantoms = seats.filter((s) => s.kind === 'phantom').length;
  return (
    <div className="stack">
      {seats.map((s, i) => (
        <fieldset key={s.id}>
          <legend>
            {s.kind === 'player' ? 'Your seat' : 'Phantom seat'} {i + 1}
          </legend>
          <div className="row">
            <label style={{ flex: 1 }}>
              Name
              <input value={s.name} onChange={(e) => up(i, { name: e.target.value })} />
            </label>
            <label>
              Placement bias
              <select
                value={s.placementBias}
                onChange={(e) => up(i, { placementBias: e.target.value as PlacementBias })}
              >
                <option value="uniform">uniform</option>
                <option value="early">early</option>
                <option value="late">late</option>
                <option value="sparse">sparse (thin areas)</option>
              </select>
            </label>
            <label>
              Focus mode
              <select
                value={s.focusMode ?? ''}
                onChange={(e) =>
                  up(i, { focusMode: (e.target.value || undefined) as Mode | undefined })
                }
              >
                <option value="">game default</option>
                <option value="off">off (write it)</option>
                <option value="prompt">prompt</option>
                <option value="enforce">enforce</option>
              </select>
            </label>
          </div>
          <details>
            <summary>Tables ({s.tables.length ? s.tables.length : 'all active'})</summary>
            <div className="table-list">
              {tables.map((t) => (
                <label key={t.id} className="inline">
                  <input
                    type="checkbox"
                    checked={s.tables.includes(t.id)}
                    onChange={(e) =>
                      up(i, {
                        tables: e.target.checked
                          ? [...s.tables, t.id]
                          : s.tables.filter((x) => x !== t.id),
                      })
                    }
                  />
                  {t.name} <span className="hint">({t.category})</span>
                </label>
              ))}
            </div>
            <p className="hint">None checked means the seat draws from every active table.</p>
          </details>
          <details>
            <summary>
              Entry-type weights {s.entryTypeWeights ? '(custom)' : '(game default)'}
            </summary>
            <label className="inline">
              <input
                type="checkbox"
                checked={!!s.entryTypeWeights}
                onChange={(e) =>
                  up(i, {
                    entryTypeWeights: e.target.checked
                      ? { ...g.settings.entryTypeWeights }
                      : undefined,
                  })
                }
              />
              custom weights (used when entry type is rolled)
            </label>
            {s.entryTypeWeights && (
              <div className="row">
                {(['period', 'event', 'scene'] as const).map((k) => (
                  <label key={k} className="inline">
                    {k}
                    <input
                      type="number"
                      min={0}
                      value={s.entryTypeWeights![k]}
                      onChange={(e) =>
                        up(i, {
                          entryTypeWeights: {
                            ...s.entryTypeWeights!,
                            [k]: Math.max(0, +e.target.value),
                          },
                        })
                      }
                      style={{ width: '5em' }}
                    />
                  </label>
                ))}
              </div>
            )}
          </details>
          {s.kind === 'phantom' && !rosterLocked && (
            <button
              className="danger"
              onClick={() => (setSaved(false), setSeats((xs) => xs.filter((x) => x.id !== s.id)))}
            >
              Remove seat
            </button>
          )}
        </fieldset>
      ))}
      <div className="row">
        {!rosterLocked && phantoms < 3 && (
          <button
            onClick={() => {
              setSaved(false);
              setSeats((xs) => [
                ...xs,
                {
                  id: `seat-${Date.now().toString(36)}`,
                  name: `Phantom ${phantoms + 1}`,
                  kind: 'phantom',
                  tables: [],
                  placementBias: 'sparse',
                },
              ]);
            }}
          >
            Add phantom seat
          </button>
        )}
        <button
          className="primary"
          onClick={async () => {
            if ((await dispatch({ type: 'ConfigureSeats', seats })).ok) setSaved(true);
          }}
        >
          Save seats
        </button>
        {saved && <span className="hint">Saved.</span>}
      </div>
      {rosterLocked && (
        <p className="hint">
          The roster is fixed once the First Pass starts; profiles can still change between rounds.
        </p>
      )}
    </div>
  );
}
