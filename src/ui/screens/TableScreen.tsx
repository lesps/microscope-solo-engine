import { useCallback, useEffect, useMemo, useState } from 'react';
import { nextStep } from '../../engine';
import { useApp, useAppStore } from '../StoreContext';
import { EntryDialog } from '../components/EntryDialog';
import { LeftRail } from '../components/LeftRail';
import { OracleDialog } from '../components/OracleDialog';
import { BackupBanner, ExportMenu } from '../components/Status';
import { Timeline, type Zoom } from '../components/Timeline';
import { TurnPanel } from '../components/TurnPanel';
import { clickFirst, useHotkeys } from '../hooks/useHotkeys';
import { useOpenGame } from '../hooks/useOpenGame';
import { href, navigate } from '../router';

export default function TableScreen({ gameId }: { gameId: string }) {
  const status = useOpenGame(gameId);
  if (status === 'missing')
    return (
      <div className="page">
        That game was not found. <a href="#/">Back to the Library</a>
      </div>
    );
  if (status === 'loading') return <div className="page">Loading…</div>;
  return <Table />;
}

function Table() {
  const store = useAppStore();
  const cur = useApp((s) => s.current)!;
  const meta = useApp((s) => s.games.find((m) => m.id === s.current?.id));
  const g = cur.state;
  const [entryId, setEntryId] = useState<string | undefined>();
  const [oracle, setOracle] = useState(false);
  const [zoom, setZoom] = useState<Zoom>({ level: 'history' });
  const [drawer, setDrawer] = useState<'left' | 'right' | undefined>();
  const step = nextStep(g);

  useEffect(() => {
    if (step === 'setup') navigate({ name: 'setup', gameId: g.id });
  }, [step, g.id]);

  const hotkeys = useMemo(
    () => ({
      n: () => clickFirst('.rail.right [data-primary]'),
      r: () => clickFirst('.rail.right [data-roll]'),
      o: () => setOracle(true),
      e: () => {
        if (!clickFirst('[data-edit]') && g.turn?.entryId) setEntryId(g.turn.entryId);
      },
      escape: () => {
        setEntryId(undefined);
        setOracle(false);
        setDrawer(undefined);
      },
      undo: () => void store.getState().undo(),
    }),
    [g.turn?.entryId, store],
  );
  useHotkeys(hotkeys, !entryId && !oracle);
  const closeEntry = useCallback(() => setEntryId(undefined), []);
  const closeOracle = useCallback(() => setOracle(false), []);
  const entry = entryId ? g.entries[entryId] : undefined;

  return (
    <>
      <BackupBanner meta={meta} />
      <div className="banner" style={{ background: 'var(--surface)' }}>
        <h1 style={{ fontSize: '1.2rem', margin: 0 }}>{g.title}</h1>
        <span className="badge">{g.ruleset === 'chronicle' ? 'Chronicle' : 'Lens'}</span>
        <span style={{ marginLeft: 'auto' }} className="row">
          <a href={href({ name: 'game-settings', gameId: g.id })}>Game settings</a>
          <ExportMenu g={g} events={cur.events} />
        </span>
      </div>
      <div className="drawer-toggles">
        <button onClick={() => setDrawer('left')} aria-controls="left-rail">
          Context
        </button>
        <button onClick={() => setDrawer('right')} aria-controls="turn-panel" className="primary">
          Turn
        </button>
      </div>
      <div className="table-screen">
        {drawer && <div className="scrim" onClick={() => setDrawer(undefined)} />}
        <aside
          id="left-rail"
          className={`rail${drawer === 'left' ? ' open' : ''}`}
          aria-label="Standing context"
        >
          <LeftRail g={g} />
        </aside>
        <main className="center" aria-label="Timeline">
          <Timeline g={g} onOpen={setEntryId} zoom={zoom} setZoom={setZoom} />
        </main>
        <aside
          id="turn-panel"
          className={`rail right${drawer === 'right' ? ' open' : ''}`}
          aria-label="Turn panel"
        >
          <TurnPanel g={g} events={cur.events} onOracle={() => setOracle(true)} />
        </aside>
      </div>
      {cur.rejection && (
        <div className="toast" role="alert">
          <span>{cur.rejection.message}</span>
          <button onClick={() => store.getState().clearRejection()}>OK</button>
        </div>
      )}
      {entry && (
        <EntryDialog key={entry.id + entry.prose} g={g} entry={entry} onClose={closeEntry} />
      )}
      {oracle && <OracleDialog g={g} events={cur.events} onClose={closeOracle} />}
    </>
  );
}
