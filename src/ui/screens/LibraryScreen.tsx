import { useRef, useState } from 'react';
import { useApp, useAppStore } from '../StoreContext';
import { exportGameFileTo } from '../components/Status';
import { downloadText, readJsonFile } from '../lib/download';
import { href, navigate } from '../router';

export default function LibraryScreen() {
  const store = useAppStore();
  const games = useApp((s) => s.games);
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [pendingCopy, setPendingCopy] = useState<unknown>();
  const file = useRef<HTMLInputElement>(null);

  const importData = async (data: unknown, asCopy = false) => {
    const fmt = (data as { format?: string })?.format;
    if (fmt === 'solo-microscope/bundle') {
      const r = await store.getState().importBundle(data, { asCopy });
      setPendingCopy(r.existing);
      setMessage(
        `Imported ${r.imported.length} game(s).` +
          (r.existing ? ` ${r.existing.games.length} already exist.` : '') +
          (r.failed.length
            ? ` Failed: ${r.failed.map((f) => `${f.title} (${f.errors[0]})`).join('; ')}`
            : ''),
      );
      return;
    }
    const r = await store.getState().importGameFile(data, { asCopy });
    if (r.ok) {
      setMessage('Game imported.');
      setPendingCopy(undefined);
    } else if (r.exists) {
      setPendingCopy(data);
      setMessage(r.errors[0]);
    } else setMessage(`Import failed: ${r.errors.join('; ')}`);
  };

  return (
    <div className="page stack">
      <div className="row spread">
        <h1>Library</h1>
        <div className="row">
          <a className="btn primary" href={href({ name: 'new' })}>
            New game
          </a>
          <button onClick={() => file.current?.click()}>Import…</button>
          <button
            disabled={!games.length}
            onClick={async () =>
              downloadText(
                `solo-microscope-backup-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(await store.getState().exportAll(), null, 1),
                'application/json',
              )
            }
          >
            Export all
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            aria-label="Import game file or bundle"
            className="visually-hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                await importData(await readJsonFile(f));
              } catch (err) {
                setMessage(`Could not read that file: ${(err as Error).message}`);
              }
            }}
          />
        </div>
      </div>
      {message && (
        <div className="card row spread" role="status" aria-label="Import result">
          <span>{message}</span>
          <span className="row">
            {pendingCopy !== undefined && (
              <button className="primary" onClick={() => importData(pendingCopy, true)}>
                Import as copy
              </button>
            )}
            <button onClick={() => (setMessage(undefined), setPendingCopy(undefined))}>
              Dismiss
            </button>
          </span>
        </div>
      )}
      {games.length === 0 ? (
        <div className="card">
          <p>No games yet. Start one to write a history, one structured turn at a time.</p>
        </div>
      ) : (
        <ul className="game-list" aria-label="Games">
          {games.map((m) => (
            <li key={m.id} className="card">
              <div className="row spread">
                <div>
                  <a
                    href={href({ name: 'table', gameId: m.id })}
                    style={{ fontFamily: 'var(--font)', fontSize: '1.15rem', fontWeight: 700 }}
                  >
                    {m.title}
                  </a>
                  <div className="hint">
                    {m.ruleset === 'chronicle' ? 'Chronicle' : 'Lens'} · {m.roundsEnded} round
                    {m.roundsEnded === 1 ? '' : 's'} · last played{' '}
                    {new Date(m.updatedAt).toLocaleString()}
                    {m.lastExportedAt
                      ? ` · backed up ${new Date(m.lastExportedAt).toLocaleDateString()}`
                      : ' · never backed up'}
                  </div>
                </div>
                <div className="row">
                  <button onClick={() => navigate({ name: 'table', gameId: m.id })}>Open</button>
                  <button
                    onClick={async () =>
                      setMessage(
                        `Duplicated as a new game (${(await store.getState().duplicateGame(m.id)).slice(-6)}).`,
                      )
                    }
                  >
                    Duplicate
                  </button>
                  <button onClick={() => exportGameFileTo(store, m.id, m.title)}>Export</button>
                  {confirmDelete === m.id ? (
                    <>
                      <button
                        className="danger"
                        onClick={() =>
                          store
                            .getState()
                            .removeGame(m.id)
                            .then(() => setConfirmDelete(undefined))
                        }
                      >
                        Delete permanently
                      </button>
                      <button onClick={() => setConfirmDelete(undefined)}>Cancel</button>
                    </>
                  ) : (
                    <button className="danger" onClick={() => setConfirmDelete(m.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <footer className="hint" style={{ marginTop: '3em' }}>
        Microscope and Microscope Explorer are by Ben Robbins (Lame Mage Productions). Lens is by
        CodenameAwesome. Solo Microscope is an unofficial tool and is not affiliated with either.
      </footer>
    </div>
  );
}
