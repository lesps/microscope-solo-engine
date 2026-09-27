import { useEffect, useState } from 'react';
import { chronologicalManuscript, outline, playOrderManuscript } from '../../export';
import type { Game, GameEvent } from '../../engine';
import type { GameMeta } from '../../store';
import { useApp, useAppStore } from '../StoreContext';
import { downloadText, slug } from '../lib/download';

export function PersistIndicator() {
  const save = useApp((s) => s.current?.save);
  const saveError = useApp((s) => s.current?.saveError);
  const storage = useApp((s) => s.storage.status);
  const label = save === 'error' ? 'Save failed' : save === 'saving' ? 'Saving…' : 'Saved';
  return (
    <span className="row" style={{ gap: '0.4em' }} aria-live="polite">
      {save && (
        <span
          className="badge"
          title={saveError}
          style={save === 'error' ? { color: 'var(--danger)' } : undefined}
        >
          {label}
        </span>
      )}
      <a
        href="#/settings"
        className="badge"
        title="Browser storage durability"
        data-testid="persist-status"
      >
        {storage === 'persisted'
          ? 'persisted'
          : storage === 'best-effort'
            ? 'best-effort'
            : 'storage: unknown'}
      </a>
    </span>
  );
}

export async function exportGameFileTo(
  store: ReturnType<typeof useAppStore>,
  id: string,
  title: string,
) {
  const file = await store.getState().exportGameFile(id);
  downloadText(`${slug(title)}.microscope.json`, JSON.stringify(file, null, 1), 'application/json');
}

export function BackupBanner({ meta }: { meta: GameMeta | undefined }) {
  const store = useAppStore();
  const due = useApp((s) => (meta ? s.isBackupDue(meta) : false));
  if (!meta || !due) return null;
  return (
    <div className="banner" role="status" aria-label="Backup reminder">
      <span>
        Browser storage can be cleared or evicted. Back up <strong>{meta.title}</strong> as a game
        file.
      </span>
      <button className="primary" onClick={() => exportGameFileTo(store, meta.id, meta.title)}>
        Export game file
      </button>
      <button onClick={() => store.getState().snoozeBackup(meta.id)}>Not now</button>
    </div>
  );
}

export function ExportMenu({ g, events }: { g: Game; events: GameEvent[] }) {
  const store = useAppStore();
  const [rolls, setRolls] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) =>
      !(e.target as HTMLElement).closest('.export-menu') && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const name = slug(g.title);
  return (
    <div className="export-menu" style={{ position: 'relative' }}>
      <button aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        Export
      </button>
      {open && (
        <div
          role="menu"
          className="card stack"
          style={{ position: 'absolute', right: 0, top: '2.4em', zIndex: 20, width: 260 }}
          onClick={(e) =>
            (e.target as HTMLElement).getAttribute('role') === 'menuitem' && setOpen(false)
          }
        >
          <button
            role="menuitem"
            onClick={() =>
              downloadText(`${name}-chronological.md`, chronologicalManuscript(g), 'text/markdown')
            }
          >
            Chronological manuscript
          </button>
          <button
            role="menuitem"
            onClick={() =>
              downloadText(
                `${name}-play-order.md`,
                playOrderManuscript(events, { rolls }),
                'text/markdown',
              )
            }
          >
            Play-order manuscript
          </button>
          <label className="inline">
            <input type="checkbox" checked={rolls} onChange={(e) => setRolls(e.target.checked)} />{' '}
            include rolls and draws
          </label>
          <button
            role="menuitem"
            onClick={() => downloadText(`${name}-outline.md`, outline(g), 'text/markdown')}
          >
            Outline
          </button>
          <button role="menuitem" onClick={() => exportGameFileTo(store, g.id, g.title)}>
            Game file (JSON)
          </button>
        </div>
      )}
    </div>
  );
}
