import { useState } from 'react';
import { PRESETS, type PresetId, type Ruleset } from '../../engine';
import { useApp, useAppStore } from '../StoreContext';
import { navigate } from '../router';

export default function NewGameScreen() {
  const store = useAppStore();
  const deckMap = useApp((s) => s.content.decks);
  const decks = Object.values(deckMap);
  const [title, setTitle] = useState('');
  const [ruleset, setRuleset] = useState<Ruleset>('lens');
  const [preset, setPreset] = useState<PresetId>('default');
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="page">
      <h1>New game</h1>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const id = await store
            .getState()
            .createGame({ title, ruleset, deckId: deckId || undefined });
          if (preset !== 'default') {
            const s = store.getState().current!.state.settings;
            await store
              .getState()
              .dispatch({ type: 'ChangeSettings', settings: PRESETS[preset].apply(s) });
          }
          navigate({ name: 'setup', gameId: id });
        }}
      >
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            autoFocus
          />
        </label>
        <fieldset>
          <legend>Ruleset</legend>
          <label className="inline">
            <input
              type="radio"
              name="ruleset"
              checked={ruleset === 'lens'}
              onChange={() => setRuleset('lens')}
            />{' '}
            Lens — a history from a Big Picture
          </label>
          <label className="inline">
            <input
              type="radio"
              name="ruleset"
              checked={ruleset === 'chronicle'}
              onChange={() => setRuleset('chronicle')}
            />{' '}
            Chronicle — the history of one subject, with an Anchor per Period
          </label>
        </fieldset>
        <label>
          Preset
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
            {(Object.keys(PRESETS) as PresetId[]).map((p) => (
              <option key={p} value={p}>
                {PRESETS[p].name}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Pure Lens keeps Lens’s original behavior: tone and cohesion rolled, dials drift by
          preference, every extension off. Default adds rolled placement, phantom Focus and friction
          you can override. High Friction enforces every roll. Everything can be changed later in
          Game settings.
        </p>
        {decks.length > 1 && (
          <label>
            Deck
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="primary" disabled={!title.trim() || busy}>
          Create and set up
        </button>
      </form>
    </div>
  );
}
