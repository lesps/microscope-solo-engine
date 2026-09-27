import { useState } from 'react';
import {
  describeOracle,
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
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await dispatch({ type: 'AskOracle', question: q, odds, entryId })).ok) setQ('');
      }}
    >
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
        calls={
          entryId && g.entries[entryId]?.kind === 'scene'
            ? (g.entries[entryId] as { oracleCalls: OracleCall[] }).oracleCalls
            : []
        }
      />
    </form>
  );
}

function OracleLog({ calls }: { calls: OracleCall[] }) {
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
              </li>
            ) : null,
          )}
        </ul>
      )}
    </Modal>
  );
}
