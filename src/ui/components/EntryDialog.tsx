import { useState } from 'react';
import { describeChange, subjectAt, type Entry, type Game } from '../../engine';
import { useDispatch } from '../hooks/useGame';
import { navigate } from '../router';
import { Lock, Modal, ToneMark } from './common';

const RETCON_FIELDS: Record<Entry['kind'], string[]> = {
  period: ['title', 'tone'],
  event: ['title', 'tone'],
  scene: ['title', 'tone', 'question', 'answer', 'setting'],
};

export function RetconForm({
  targetId,
  fields,
  current,
  onDone,
}: {
  targetId: string;
  fields: string[];
  current: (f: string) => unknown;
  onDone: () => void;
}) {
  const dispatch = useDispatch();
  const [field, setField] = useState(fields[0]!);
  const [after, setAfter] = useState(String(current(fields[0]!) ?? ''));
  const [reason, setReason] = useState('');
  return (
    <form
      className="stack"
      aria-label="Retcon"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await dispatch({ type: 'Retcon', targetId, field, after, reason })).ok) onDone();
      }}
    >
      <label>
        Field
        <select
          value={field}
          onChange={(e) => {
            setField(e.target.value);
            setAfter(String(current(e.target.value) ?? ''));
          }}
        >
          {fields.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label>
        New value
        {field === 'tone' ? (
          <select value={after} onChange={(e) => setAfter(e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        ) : (
          <input value={after} onChange={(e) => setAfter(e.target.value)} />
        )}
      </label>
      <label>
        Reason (required)
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="submit" className="primary" disabled={!reason.trim()}>
        Retcon
      </button>
    </form>
  );
}

export function EntryDialog({ g, entry, onClose }: { g: Game; entry: Entry; onClose: () => void }) {
  const dispatch = useDispatch();
  const [prose, setProse] = useState(entry.prose);
  const [retcon, setRetcon] = useState(false);
  const [viewRev, setViewRev] = useState<number | undefined>();
  const legacy = entry.legacyId ? g.legacies.find((l) => l.id === entry.legacyId) : undefined;
  const seat = g.seats.find((s) => s.id === entry.seatId);
  return (
    <Modal title={entry.title} onClose={onClose}>
      <div className="facts stack" aria-label="Facts">
        <div className="row">
          <ToneMark tone={entry.tone} /> {entry.tone === 'light' ? 'Light' : 'Dark'}{' '}
          <span className="badge">{entry.kind}</span>
          {entry.locked && <Lock />}
          {entry.kind === 'period' && entry.bookend && <span className="badge">Bookend</span>}
        </div>
        <div className="hint">
          {entry.createdInRound ? `Round ${entry.createdInRound}` : 'Setup'} · {seat?.name}
          {entry.focus ? ` · Focus: ${entry.focus}` : ''}
          {legacy ? ` · Legacy: ${legacy.text}` : ''}
        </div>
        {entry.kind === 'period' && entry.anchorId && (
          <div>
            Anchor: {g.characters[entry.anchorId]?.name}
            {entry.change ? ` · Change: ${describeChange(entry.change)}` : ''}
            <div className="hint">Subject then: {subjectAt(g, entry.id)?.traits.join(', ')}</div>
          </div>
        )}
        {entry.kind === 'scene' && (
          <>
            <div>
              <strong>Q:</strong> {entry.question}
            </div>
            {entry.answer && (
              <div>
                <strong>A:</strong> {entry.answer}
              </div>
            )}
          </>
        )}
      </div>
      {entry.kind === 'scene' ? (
        <div className="stack" style={{ marginTop: '1em' }}>
          <p className="prose-preview">{entry.prose || '(no prose yet)'}</p>
          <button
            className="primary"
            data-edit
            onClick={() => navigate({ name: 'scene', gameId: g.id, entryId: entry.id })}
          >
            {entry.locked ? 'Revise in Scene editor' : 'Open Scene editor'}
          </button>
        </div>
      ) : entry.locked ? (
        <div className="stack" style={{ marginTop: '1em' }}>
          <label>
            Prose (revisable)
            <textarea value={prose} onChange={(e) => setProse(e.target.value)} rows={6} />
          </label>
          <button
            disabled={prose === entry.prose}
            onClick={() => dispatch({ type: 'ReviseProse', entryId: entry.id, prose })}
          >
            Save revision
          </button>
          {entry.revisions.length > 1 && (
            <details>
              <summary>Revisions ({entry.revisions.length})</summary>
              <ul>
                {entry.revisions.map((r, i) => (
                  <li key={r.seq}>
                    <button className="link" onClick={() => setViewRev(i)}>
                      {i === 0 ? 'Play-time draft' : `Revision ${i}`} ·{' '}
                      {new Date(r.at).toLocaleString()}
                    </button>
                  </li>
                ))}
              </ul>
              {viewRev !== undefined && (
                <div className="stack">
                  <p className="prose-preview">{entry.revisions[viewRev]!.prose || '(empty)'}</p>
                  <button onClick={() => setProse(entry.revisions[viewRev]!.prose)}>
                    Load into editor
                  </button>
                </div>
              )}
            </details>
          )}
        </div>
      ) : (
        <p className="prose-preview">{entry.prose || '(no prose yet)'}</p>
      )}
      {entry.locked && (
        <div style={{ marginTop: '1em' }}>
          {!retcon ? (
            <button onClick={() => setRetcon(true)}>Retcon a fact…</button>
          ) : (
            <RetconForm
              targetId={entry.id}
              fields={RETCON_FIELDS[entry.kind]}
              current={(f) => (entry as unknown as Record<string, unknown>)[f]}
              onDone={() => setRetcon(false)}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
