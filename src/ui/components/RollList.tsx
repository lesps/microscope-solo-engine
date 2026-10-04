import type { GameEvent } from '../../engine';
import { useReducedMotion } from '../hooks/useReducedMotion';

const LABEL: Record<string, string> = {
  tone: 'Tone',
  entryType: 'Entry type',
  placement: 'Placement',
  cohesion: 'Cohesion',
  focus: 'Focus',
  'focus.source': 'Focus source',
  'legacy.evict': 'Evict',
  'legacy.explore': 'Explore',
  'scene.reversal': 'Reversal',
  'scene.spread': 'Spread',
  oracle: 'Oracle',
  'oracle.qualifier': 'Qualifier',
  palette: 'Palette',
  'prompt.domain': 'Domain',
  'prompt.wordPair': 'Word pair',
  'prompt.wordPair.action': 'Word pair',
  'prompt.card': 'Card',
  'prompt.character': 'Character',
  'prompt.question': 'Question idea',
  'prompt.echo': 'Echo',
  'prompt.person.name': 'Person name',
  'prompt.person.role': 'Person role',
  'prompt.person.want': 'Person want',
  'drift.mood': 'Mood drift',
  'drift.cohesion': 'Cohesion drift',
  'table.pick': 'Table',
};

export function RollList({ events, label }: { events: GameEvent[]; label?: string }) {
  const reduced = useReducedMotion();
  const rolls = events.filter(
    (e) =>
      e.type === 'RollMade' ||
      e.type === 'CardDrawn' ||
      e.type === 'DeckReshuffled' ||
      e.type === 'OverrideUsed',
  );
  if (!rolls.length) return null;
  return (
    <ul className="rolls" aria-label={label ?? 'Rolls'}>
      {rolls.map((e, i) => (
        <li key={e.id} className={!reduced && i === rolls.length - 1 ? 'roll-anim' : undefined}>
          {e.type === 'RollMade' && (
            <>
              <span className="die">
                d{e.payload.sides} → {e.payload.result}
              </span>
              <span>
                <strong>{LABEL[e.payload.purpose] ?? e.payload.purpose}:</strong> {e.payload.text}
              </span>
            </>
          )}
          {e.type === 'CardDrawn' && (
            <>
              <span className="die">🂠 {e.payload.reversed ? 'rev.' : 'card'}</span>
              <span>
                <strong>
                  {LABEL[e.payload.purpose] ?? e.payload.purpose}
                  {e.payload.role ? ` (${e.payload.role})` : ''}:
                </strong>{' '}
                {e.payload.keyword}
              </span>
            </>
          )}
          {e.type === 'DeckReshuffled' && <span>Deck reshuffled</span>}
          {e.type === 'OverrideUsed' && (
            <>
              <span className="die">✎</span>
              <span>Override: {LABEL[e.payload.mechanic] ?? e.payload.mechanic}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
