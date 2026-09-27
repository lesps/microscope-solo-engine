import { useState } from 'react';
import { eventsOf, periods, scenesOf, type Entry, type Game, type Placement } from '../../engine';
import { Lock, ToneMark } from './common';

export type Zoom =
  { level: 'history' } | { level: 'period'; id: string } | { level: 'event'; id: string };

function Gap({ label }: { label: string }) {
  return (
    <div className="slot-gap" role="note" aria-label="Rolled placement">
      {label}
    </div>
  );
}

function EntryButton({
  e,
  onOpen,
  isNew,
}: {
  e: Entry;
  onOpen: (id: string) => void;
  isNew: boolean;
}) {
  return (
    <button
      className={`entry-title${isNew ? ' new-entry' : ''}`}
      onClick={() => onOpen(e.id)}
      aria-label={`${e.kind} ${e.title}, ${e.tone}${e.locked ? ', locked' : ''}`}
    >
      <ToneMark tone={e.tone} />
      <span style={{ flex: 1 }}>{e.title}</span>
      {e.locked && <Lock />}
    </button>
  );
}

export function Timeline({
  g,
  onOpen,
  zoom,
  setZoom,
}: {
  g: Game;
  onOpen: (id: string) => void;
  zoom: Zoom;
  setZoom: (z: Zoom) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const slot: Placement | undefined =
    g.turn && !g.turn.entryId ? g.turn.rolled.placement?.placement : undefined;
  const slotKind = g.turn?.rolled.placement?.kind;
  const openId = g.turn?.entryId;
  const gapAt = (kind: string, parentId: string | null, index: number) =>
    slot && slotKind === kind && slot.parentId === parentId && slot.index === index;

  const ps = periods(g);
  let shown = ps;
  let eventFilter: string | undefined;
  if (zoom.level === 'period') shown = ps.filter((p) => p.id === zoom.id);
  if (zoom.level === 'event') {
    const ev = g.entries[zoom.id];
    if (ev?.kind === 'event') {
      shown = ps.filter((p) => p.id === ev.periodId);
      eventFilter = ev.id;
    }
  }

  const renderScenes = (eventId: string) => {
    const ss = scenesOf(g, eventId);
    const out = [];
    for (let i = 0; i <= ss.length; i++) {
      if (gapAt('scene', eventId, i)) out.push(<Gap key={`gap${i}`} label="New Scene here" />);
      const s = ss[i];
      if (!s) continue;
      out.push(
        <div key={s.id} className="scene-row">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <EntryButton e={s} onOpen={onOpen} isNew={s.id === openId} />
            <button
              className="link"
              aria-expanded={!!expanded[s.id]}
              aria-label={`Show prose of ${s.title}`}
              onClick={() => setExpanded((x) => ({ ...x, [s.id]: !x[s.id] }))}
            >
              {expanded[s.id] ? '▾' : '▸'}
            </button>
          </div>
          {expanded[s.id] && (
            <div className="prose-preview">
              <strong>Q:</strong> {s.question}
              {'\n'}
              {s.prose || '(no prose yet)'}
              {s.answer && `\nA: ${s.answer}`}
            </div>
          )}
        </div>,
      );
    }
    return out;
  };

  const renderEvents = (periodId: string) => {
    const es = eventsOf(g, periodId).filter((e) => !eventFilter || e.id === eventFilter);
    const out = [];
    for (let i = 0; i <= es.length; i++) {
      if (!eventFilter && gapAt('event', periodId, i))
        out.push(<Gap key={`gap${i}`} label="New Event here" />);
      const e = es[i];
      if (!e) continue;
      out.push(
        <div key={e.id} className="event">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <EntryButton e={e} onOpen={onOpen} isNew={e.id === openId} />
            {zoom.level !== 'event' && (
              <button
                className="link"
                aria-label={`Zoom to ${e.title}`}
                title="Zoom to Event"
                onClick={() => setZoom({ level: 'event', id: e.id })}
              >
                ⤢
              </button>
            )}
          </div>
          {zoom.level !== 'history' && e.prose && <p className="prose-preview">{e.prose}</p>}
          {renderScenes(e.id)}
        </div>,
      );
    }
    return out;
  };

  const cols = [];
  for (let i = 0; i < shown.length; i++) {
    const p = shown[i]!;
    const absIndex = ps.indexOf(p);
    if (zoom.level === 'history' && gapAt('period', null, absIndex))
      cols.push(<Gap key={`pgap${absIndex}`} label="New Period here" />);
    cols.push(
      <section
        key={p.id}
        className={`period${p.bookend ? ' bookend' : ''}`}
        aria-label={`Period ${p.title}`}
      >
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <EntryButton e={p} onOpen={onOpen} isNew={p.id === openId} />
          {zoom.level === 'history' && (
            <button
              className="link"
              aria-label={`Zoom to ${p.title}`}
              title="Zoom to Period"
              onClick={() => setZoom({ level: 'period', id: p.id })}
            >
              ⤢
            </button>
          )}
        </div>
        {p.bookend && (
          <span className="badge">{p.bookend === 'start' ? 'first' : 'last'} Bookend</span>
        )}
        {zoom.level !== 'history' && p.prose && <p className="prose-preview">{p.prose}</p>}
        {renderEvents(p.id)}
      </section>,
    );
  }

  return (
    <div>
      <div className="row" role="toolbar" aria-label="Zoom" style={{ marginBottom: '0.6em' }}>
        <button
          aria-pressed={zoom.level === 'history'}
          onClick={() => setZoom({ level: 'history' })}
        >
          History
        </button>
        {zoom.level !== 'history' && (
          <span className="hint">
            {zoom.level === 'period' ? 'Period' : 'Event'} view: {g.entries[zoom.id]?.title}
          </span>
        )}
      </div>
      <div className={`timeline${zoom.level !== 'history' ? ' zoomed' : ''}`}>{cols}</div>
    </div>
  );
}
