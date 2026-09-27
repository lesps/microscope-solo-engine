import { useState } from 'react';
import {
  PRESETS,
  type Mode,
  type ModedMechanic,
  type PresetId,
  type Settings,
  type Table,
} from '../../engine';
import { useApp } from '../StoreContext';
import { SeatsEditor } from '../components/SeatsEditor';
import { useDispatch } from '../hooks/useGame';
import { useOpenGame } from '../hooks/useOpenGame';
import { href } from '../router';

export default function GameSettingsScreen({ gameId }: { gameId: string }) {
  const status = useOpenGame(gameId);
  if (status === 'missing') return <div className="page">That game was not found.</div>;
  if (status === 'loading') return <div className="page">Loading…</div>;
  return <SettingsForm />;
}

const MECHANICS: { key: ModedMechanic; label: string; help: string }[] = [
  { key: 'tone', label: 'Tone', help: 'Light/Dark per entry: d10 ≤ Mood is Light.' },
  {
    key: 'cohesion',
    label: 'Cohesion',
    help: 'Extra turns per round: d10 ≤ Cohesion grants another turn.',
  },
  { key: 'focus.source', label: 'Focus (your seat)', help: 'When you hold the Lens.' },
  {
    key: 'focus.sourcePhantom',
    label: 'Focus (phantom seats)',
    help: 'When a phantom holds the Lens.',
  },
  { key: 'entryType', label: 'Entry type', help: 'Period / Event / Scene by weight.' },
  {
    key: 'placement',
    label: 'Placement',
    help: 'The slot on the timeline, weighted by the seat’s bias.',
  },
  {
    key: 'palette.roll',
    label: 'Rolled Palette items',
    help: 'Two items drawn at setup; one reroll each in prompt mode.',
  },
  {
    key: 'legacy.evict',
    label: 'Legacy eviction',
    help: 'Which Legacy leaves when all six slots are full.',
  },
  {
    key: 'legacy.explore',
    label: 'Legacy exploration',
    help: 'Which Legacy is explored; a seat’s own Legacies weigh double.',
  },
  {
    key: 'scene.reversal',
    label: 'Scene reversal',
    help: 'One mid-Scene complication; enforced means it must be placed.',
  },
  {
    key: 'seed.answers',
    label: 'Seed answers',
    help: 'When starting from a seed, the dice pick the answers instead of you.',
  },
];

const MODE_LABEL: Record<Mode, string> = {
  off: 'off — you choose',
  prompt: 'prompt — rolled, override logged',
  enforce: 'enforce — rolled, no override',
};

function SettingsForm() {
  const dispatch = useDispatch();
  const cur = useApp((s) => s.current)!;
  const content = useApp((s) => s.content);
  const g = cur.state;
  const [s, setS] = useState<Settings>(g.settings);
  const [saved, setSaved] = useState(false);
  const up = (p: Partial<Settings>) => {
    setSaved(false);
    setS((x) => ({ ...x, ...p }));
  };
  const turnOpen = !!g.turn;
  const r = g.rounds[g.rounds.length - 1];
  const betweenRounds = !r || r.ended;
  const tables = Object.values(content.tables);
  const byCat = (c: Table['category']) => tables.filter((t) => t.category === c);
  const num = (v: number, set: (n: number) => void, min = 0, max = 1000) => (
    <input
      type="number"
      min={min}
      max={max}
      value={v}
      onChange={(e) => set(Math.max(min, Math.min(max, +e.target.value)))}
      style={{ width: '6em' }}
    />
  );

  return (
    <div className="page stack">
      <div className="row spread">
        <h1>Game settings</h1>
        <a href={href({ name: 'table', gameId: g.id })}>Back to the table</a>
      </div>
      {turnOpen && <p className="warn">A turn is open: settings change between turns.</p>}
      <section className="card stack">
        <h2>Presets</h2>
        <div className="row">
          {(Object.keys(PRESETS) as PresetId[]).map((p) => (
            <button key={p} onClick={() => up(PRESETS[p].apply(s))}>
              {PRESETS[p].name}
            </button>
          ))}
        </div>
        <p className="hint">A preset fills the form; nothing changes until you save.</p>
      </section>
      <section className="card stack">
        <h2>Mechanic modes</h2>
        <p className="hint">
          The structure is the product; randomness is a dial. Every mechanic can be turned fully
          off.
        </p>
        {MECHANICS.map((m) => (
          <label key={m.key}>
            {m.label} <span className="hint">— {m.help}</span>
            <select
              value={s.modes[m.key]}
              onChange={(e) => up({ modes: { ...s.modes, [m.key]: e.target.value as Mode } })}
            >
              {(['off', 'prompt', 'enforce'] as const).map((x) => (
                <option key={x} value={x}>
                  {MODE_LABEL[x]}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Dial drift
          <select
            value={s.drift}
            onChange={(e) => up({ drift: e.target.value as Settings['drift'] })}
          >
            <option value="preference">preference — you move each dial ±1 (Lens)</option>
            <option value="random">random — d6 per dial</option>
            <option value="counter-trend">counter-trend — Mood leans toward the rarer tone</option>
          </select>
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={s.chaos}
            onChange={(e) => up({ chaos: e.target.checked })}
          />{' '}
          Chaos dial (skews the oracle; drifts with the round’s tone)
        </label>
        <label className="inline">
          Turn cap per round {num(s.cohesionCap, (n) => up({ cohesionCap: n }), 1, 50)}
        </label>
      </section>
      <section className="card stack">
        <h2>Weights</h2>
        <div className="row">
          Entry type:
          {(['period', 'event', 'scene'] as const).map((k) => (
            <label key={k} className="inline">
              {k}{' '}
              {num(s.entryTypeWeights[k], (n) =>
                up({ entryTypeWeights: { ...s.entryTypeWeights, [k]: n } }),
              )}
            </label>
          ))}
        </div>
        <div className="row">
          Focus source:
          {(['legacy', 'domain', 'deck'] as const).map((k) => (
            <label key={k} className="inline">
              {k}{' '}
              {num(s.focusSourceWeights[k], (n) =>
                up({ focusSourceWeights: { ...s.focusSourceWeights, [k]: n } }),
              )}
            </label>
          ))}
        </div>
      </section>
      <section className="card stack">
        <h2>Active tables</h2>
        {(['domain', 'focus', 'wordPair', 'palette', 'reversal'] as const).map((c) => (
          <div key={c}>
            <strong>{c}</strong>
            <div>
              {byCat(c).map((t) => (
                <label key={t.id} className="inline">
                  <input
                    type="checkbox"
                    checked={s.activeTables.includes(t.id)}
                    onChange={(e) =>
                      up({
                        activeTables: e.target.checked
                          ? [...s.activeTables, t.id]
                          : s.activeTables.filter((x) => x !== t.id),
                      })
                    }
                  />
                  {t.name}
                </label>
              ))}
              {!byCat(c).length && <span className="hint">none installed</span>}
            </div>
          </div>
        ))}
        <p className="hint">
          Add or ban tables for this game. More tables arrive as <a href="#/packs">content packs</a>
          .
        </p>
      </section>
      <section className="card stack">
        <h2>Deck and oracle</h2>
        <label className="inline">
          <input
            type="checkbox"
            checked={s.deck.reversals}
            onChange={(e) => up({ deck: { ...s.deck, reversals: e.target.checked } })}
          />{' '}
          Reversed cards (50% per draw)
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={s.deck.toneFromPip}
            onChange={(e) => up({ deck: { ...s.deck, toneFromPip: e.target.checked } })}
          />{' '}
          Tone from pip cards
        </label>
        <p className="hint">
          With tone from pips, a drawn pip (1–10) is compared to Mood instead of a d10. The deck is
          drawn without replacement, so as it thins the odds of Light and Dark skew until the next
          reshuffle. Majors and courts fall back to a d10.
        </p>
        <label className="inline">
          <input
            type="checkbox"
            checked={s.oracle.qualifiers}
            onChange={(e) => up({ oracle: { qualifiers: e.target.checked } })}
          />{' '}
          Oracle qualifiers (d6: 1 “but”, 6 “and”)
        </label>
      </section>
      <section className="card stack">
        <h2>Scenes</h2>
        <label>
          Word budget
          <select
            value={s.scene.budget}
            onChange={(e) =>
              up({ scene: { ...s.scene, budget: e.target.value as 'warn' | 'enforce' } })
            }
          >
            <option value="warn">warn</option>
            <option value="enforce">enforce (blocks resolving)</option>
          </select>
        </label>
        <div className="row">
          Default budget{' '}
          {num(
            s.scene.defaultBudget.min,
            (n) =>
              up({ scene: { ...s.scene, defaultBudget: { ...s.scene.defaultBudget, min: n } } }),
            0,
            100000,
          )}{' '}
          –
          {num(
            s.scene.defaultBudget.max,
            (n) =>
              up({ scene: { ...s.scene, defaultBudget: { ...s.scene.defaultBudget, max: n } } }),
            0,
            100000,
          )}{' '}
          words
        </div>
        <label className="inline">
          <input
            type="checkbox"
            checked={s.scene.pause}
            onChange={(e) => up({ scene: { ...s.scene, pause: e.target.checked } })}
          />{' '}
          Pause before drafting
        </label>
        <label className="inline">
          Pause length (seconds){' '}
          {num(s.scene.pauseSeconds, (n) => up({ scene: { ...s.scene, pauseSeconds: n } }), 5, 600)}
        </label>
      </section>
      <div className="row">
        <button
          className="primary"
          disabled={turnOpen}
          onClick={async () => {
            if ((await dispatch({ type: 'ChangeSettings', settings: s })).ok) setSaved(true);
          }}
        >
          Save settings
        </button>
        {saved && <span className="hint">Saved.</span>}
        {cur.rejection && <span className="warn">{cur.rejection.message}</span>}
      </div>
      <section className="card stack">
        <h2>Seats</h2>
        {betweenRounds || !g.rounds.length ? (
          <SeatsEditor
            g={g}
            rosterLocked={!g.rounds.length && Object.values(g.entries).some((e) => e.firstPass)}
          />
        ) : (
          <p className="hint">Seats change between rounds.</p>
        )}
      </section>
    </div>
  );
}
