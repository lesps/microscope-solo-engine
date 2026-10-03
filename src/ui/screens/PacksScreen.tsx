import { useRef, useState } from 'react';
import { BUNDLED_PACKS, packWarnings, type Pack, type PackError } from '../../content';
import { useApp, useAppStore } from '../StoreContext';
import { readJsonFile } from '../lib/download';

const bundled = new Set(BUNDLED_PACKS.map((p) => p.id));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function packCounts(pack: Pack): string {
  const parts = [plural(pack.tables.length, 'table')];
  for (const c of ['question', 'person'] as const) {
    const n = pack.tables.filter((t) => t.category === c).length;
    if (n) parts.push(plural(n, `${c} table`));
  }
  parts.push(plural(pack.decks.length, 'deck'));
  if (pack.groups.length) parts.push(plural(pack.groups.length, 'group'));
  if (pack.seeds.length) parts.push(plural(pack.seeds.length, 'seed'));
  if (pack.generators.length) parts.push(plural(pack.generators.length, 'generator'));
  return parts.join(' · ');
}

export default function PacksScreen() {
  const store = useAppStore();
  const packs = useApp((s) => s.packs);
  const [errors, setErrors] = useState<PackError[] | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const file = useRef<HTMLInputElement>(null);
  const groupIds = packs.filter((p) => p.enabled).flatMap((p) => p.pack.groups.map((g) => g.id));
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
                {bundled.has(p.id) && <span className="badge">built in</span>}
                <div className="hint">
                  {packCounts(p.pack)}
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
                {!bundled.has(p.id) && (
                  <button className="danger" onClick={() => store.getState().removePack(p.id)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            {p.pack.description && <p style={{ margin: 0 }}>{p.pack.description}</p>}
            {packWarnings(p.pack, groupIds).map((w) => (
              <p key={w.path + w.message} className="warn" style={{ margin: 0 }}>
                Warning: {w.message}
              </p>
            ))}
            <details>
              <summary>Inspect</summary>
              {p.pack.groups.length > 0 && (
                <details style={{ marginLeft: '1em' }}>
                  <summary>Groups ({p.pack.groups.length})</summary>
                  <ul className="hint">
                    {p.pack.groups.map((grp) => (
                      <li key={grp.id}>
                        {grp.name}
                        {grp.description ? ` — ${grp.description}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {p.pack.seeds.map((seed) => (
                <details key={seed.id} style={{ marginLeft: '1em' }}>
                  <summary>
                    Seed: {seed.title}{' '}
                    <span className="hint">
                      ({seed.ruleset}, {seed.questions.length} questions)
                    </span>
                  </summary>
                  <p className="hint">{seed.pitch}</p>
                </details>
              ))}
              {p.pack.generators.map((gen) => (
                <details key={gen.id} style={{ marginLeft: '1em' }}>
                  <summary>
                    Generator: {gen.name} <span className="hint">({gen.template})</span>
                  </summary>
                  {gen.description && <p className="hint">{gen.description}</p>}
                </details>
              ))}
              {p.pack.tables.map((t) => (
                <details key={t.id} style={{ marginLeft: '1em' }}>
                  <summary>
                    {t.name}{' '}
                    <span className="hint">
                      (
                      {[
                        t.category,
                        t.category !== 'wordPair' && t.slot,
                        t.tags && `tags: ${t.tags.join(', ')}`,
                        t.id,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      )
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
