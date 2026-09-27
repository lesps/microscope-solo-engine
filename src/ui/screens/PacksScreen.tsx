import { useRef, useState } from 'react';
import type { PackError } from '../../content';
import { useApp, useAppStore } from '../StoreContext';
import { readJsonFile } from '../lib/download';

export default function PacksScreen() {
  const store = useAppStore();
  const packs = useApp((s) => s.packs);
  const [errors, setErrors] = useState<PackError[] | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="page stack">
      <div className="row spread">
        <h1>Content packs</h1>
        <button className="primary" onClick={() => file.current?.click()}>
          Import pack…
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          aria-label="Import content pack"
          className="visually-hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setErrors(undefined);
            setMessage(undefined);
            try {
              const r = await store.getState().importPack(await readJsonFile(f));
              if (r.ok)
                setMessage(
                  'Pack installed and enabled. Enable its tables per game in Game settings.',
                );
              else setErrors(r.errors);
            } catch (err) {
              setErrors([{ path: '(file)', message: (err as Error).message }]);
            }
          }}
        />
      </div>
      <p className="hint">
        Packs add tables and decks as JSON. Nothing is installed when a pack has errors. See
        docs/content-packs.md in the repository for the schema.
      </p>
      {message && (
        <p role="status" className="card">
          {message}
        </p>
      )}
      {errors && (
        <div className="card" role="alert">
          <strong>
            The pack was not installed ({errors.length} problem{errors.length === 1 ? '' : 's'}):
          </strong>
          <ul className="errors">
            {errors.map((e, i) => (
              <li key={i}>
                {e.path}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="game-list" aria-label="Installed packs">
        {packs.map((p) => (
          <li key={p.id} className="card stack">
            <div className="row spread">
              <div>
                <strong>{p.pack.name}</strong> <span className="badge">v{p.pack.version}</span>{' '}
                {p.id === 'starter' && <span className="badge">built in</span>}
                <div className="hint">
                  {p.pack.tables.length} tables · {p.pack.decks.length} deck
                  {p.pack.decks.length === 1 ? '' : 's'}
                  {p.pack.license ? ` · ${p.pack.license}` : ''}
                </div>
              </div>
              <div className="row">
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) => store.getState().setPackEnabled(p.id, e.target.checked)}
                  />{' '}
                  enabled
                </label>
                {p.id !== 'starter' && (
                  <button className="danger" onClick={() => store.getState().removePack(p.id)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            {p.pack.description && <p style={{ margin: 0 }}>{p.pack.description}</p>}
            <details>
              <summary>Inspect</summary>
              {p.pack.tables.map((t) => (
                <details key={t.id} style={{ marginLeft: '1em' }}>
                  <summary>
                    {t.name}{' '}
                    <span className="hint">
                      ({t.category}, {t.id})
                    </span>
                  </summary>
                  <ol className="hint">
                    {(t.category === 'wordPair' ? [...t.action, ...t.subject] : t.entries).map(
                      (e, i) => (
                        <li key={i}>
                          {e.text}
                          {e.weight ? ` ×${e.weight}` : ''}
                          {e.range ? ` [${e.range[0]}–${e.range[1]}]` : ''}
                        </li>
                      ),
                    )}
                  </ol>
                </details>
              ))}
              {p.pack.decks.map((d) => (
                <details key={d.id} style={{ marginLeft: '1em' }}>
                  <summary>
                    {d.name} <span className="hint">({d.cards.length} cards)</span>
                  </summary>
                  <div>
                    {d.cards.map((c) => (
                      <span key={c.id} className="tarot">
                        <span className="hint">{c.name}</span>
                        <strong>{c.upright}</strong>
                        <span className="hint">rev. {c.reversed}</span>
                      </span>
                    ))}
                  </div>
                </details>
              ))}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
