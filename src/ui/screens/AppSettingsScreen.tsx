import { useState } from 'react';
import { useApp, useAppStore } from '../StoreContext';

const fmt = (n?: number) =>
  n === undefined
    ? '?'
    : n > 1e9
      ? `${(n / 1e9).toFixed(1)} GB`
      : n > 1e6
        ? `${(n / 1e6).toFixed(1)} MB`
        : `${Math.round(n / 1e3)} KB`;

export default function AppSettingsScreen() {
  const store = useAppStore();
  const storage = useApp((s) => s.storage);
  const backup = useApp((s) => s.backup);
  const [rounds, setRounds] = useState(backup.rounds);
  const [days, setDays] = useState(backup.days);
  return (
    <div className="page stack">
      <h1>Storage and backups</h1>
      <section className="card stack">
        <h2>Storage</h2>
        <p>
          Status: <strong data-testid="storage-status">{storage.status}</strong>
          {storage.usage !== undefined && (
            <>
              {' '}
              · using {fmt(storage.usage)} of {fmt(storage.quota)}
            </>
          )}
        </p>
        {storage.status !== 'persisted' && (
          <button onClick={() => store.getState().requestPersistence()}>
            Request durable storage again
          </button>
        )}
        <p className="hint">
          Games live in this browser’s storage. Clearing site data wipes every game. Browsers may
          evict best-effort storage under disk pressure, and Safari can delete script-written
          storage for sites not visited in 7 days unless the app is installed to the home screen.{' '}
          <strong>Installing the app</strong> (Add to Home Screen, or the install button in your
          browser’s address bar) is the recommended setup. Export game files regularly either way.
        </p>
        <p className="hint">
          If this app’s address changes (a new domain or a renamed repository), it starts with empty
          storage. Use Export all in the Library before moving and import the bundle afterwards.
        </p>
      </section>
      <section className="card stack">
        <h2>Backup reminder</h2>
        <p className="hint">
          A banner offers a one-click game file export after this many completed rounds or days
          since the last export, whichever comes first.
        </p>
        <div className="row">
          <label className="inline">
            Rounds{' '}
            <input
              type="number"
              min={1}
              max={100}
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, +e.target.value))}
              style={{ width: '5em' }}
            />
          </label>
          <label className="inline">
            Days{' '}
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, +e.target.value))}
              style={{ width: '5em' }}
            />
          </label>
          <button onClick={() => store.getState().setBackupThresholds({ rounds, days })}>
            Save
          </button>
        </div>
      </section>
      <section className="card stack">
        <h2>Credits</h2>
        <p>
          Microscope and Microscope Explorer are by Ben Robbins (Lame Mage Productions). Lens, the
          one-page solo hack this app implements, is by CodenameAwesome. Solo Microscope is
          unofficial and not affiliated with either. It bundles no rule text from those games; the
          starter tables and keyword deck are original.
        </p>
      </section>
    </div>
  );
}
