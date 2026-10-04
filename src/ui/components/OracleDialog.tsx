import { useState } from 'react';
import {
  activeSeat,
  describeOracle,
  isGroupGame,
  effectiveOdds,
  type Game,
  type GameEvent,
  type OracleCall,
} from '../../engine';
import { useDispatch } from '../hooks/useGame';
import { Modal } from './common';

export function OracleForm({ g, entryId }: { g: Game; entryId?: string }) {
  const dispatch = useDispatch();
  const [q, setQ] = useState('');
  const [odds, setOdds] = useState(5);
  const chaos = g.settings.chaos ? g.dials.chaos : undefined;
  const group = isGroupGame(g);
  const players = g.seats.filter((s) => s.kind === 'player');
  const holder = activeSeat(g);
  const [askedBy, setAskedBy] = useState(
    holder?.kind === 'player' ? holder.id : (players[0]?.id ?? ''),
  );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await dispatch({
          type: 'AskOracle',
          question: q,
          odds,
          entryId,
          ...(group ? { askedBy } : {}),
        });
        if (r.ok) setQ('');
      }}
    >
      {group && (
        <label>
          Asked by
          <select value={askedBy} onChange={(e) => setAskedBy(e.target.value)}>
            {players.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Yes/no question
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <label>
        Odds of yes: {odds} in 10
        {chaos !== undefined && (
          <span className="hint">
            {' '}
            (Chaos {chaos} → {effectiveOdds(odds, chaos)})
          </span>
        )}
        <input
          type="range"
          min={1}
          max={9}
          value={odds}
          onChange={(e) => setOdds(+e.target.value)}
        />
      </label>
      <button type="submit" className="primary" disabled={!q.trim()}>
        Ask
      </button>
      <OracleLog
        g={g}
        calls={
          entryId && g.entries[entryId]?.kind === 'scene'
            ? (g.entries[entryId] as { oracleCalls: OracleCall[] }).oracleCalls
            : []
        }
      />
    </form>
  );
}

function Asker({ g, call }: { g: Game; call: OracleCall }) {
  const name = call.askedBy && g.seats.find((s) => s.id === call.askedBy)?.name;
  return name ? <span className="hint"> ({name})</span> : null;
}

function OracleLog({ g, calls }: { g: Game; calls: OracleCall[] }) {
  if (!calls.length) return null;
  return (
    <ul className="rolls" aria-label="Oracle answers">
      {calls.map((c) => (
        <li key={c.seq}>
          <span className="die">
            d10 {c.roll}/{c.effectiveOdds}
            {c.qualifierRoll !== undefined ? ` · d6 ${c.qualifierRoll}` : ''}
          </span>
          <span>
            {c.question} — <strong>{describeOracle(c)}</strong>
            <Asker g={g} call={c} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OracleDialog({
  g,
  events,
  onClose,
}: {
  g: Game;
  events: GameEvent[];
  onClose: () => void;
}) {
  const entryId =
    g.turn?.entryId && g.entries[g.turn.entryId]?.kind === 'scene' ? g.turn.entryId : undefined;
  const recent = events
    .filter((e) => e.type === 'OracleAsked')
    .slice(-5)
    .reverse();
  return (
    <Modal title="Oracle" onClose={onClose}>
      <OracleForm g={g} entryId={entryId} />
      {!entryId && recent.length > 0 && (
        <ul className="rolls" aria-label="Recent oracle answers">
          {recent.map((e) =>
            e.type === 'OracleAsked' ? (
              <li key={e.id}>
                <span className="die">
                  d10 {e.payload.call.roll}/{e.payload.call.effectiveOdds}
                </span>
                {e.payload.call.question} — <strong>{describeOracle(e.payload.call)}</strong>
                <Asker g={g} call={e.payload.call} />
              </li>
            ) : null,
          )}
        </ul>
      )}
    </Modal>
  );
}
