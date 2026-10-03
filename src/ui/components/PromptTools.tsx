import { useState } from 'react';
import {
  activeSeat,
  personPromptParts,
  personText,
  seatTables,
  type Game,
  type PromptKind,
  type Table,
} from '../../engine';
import { useApp } from '../StoreContext';
import { useDispatch } from '../hooks/useGame';

/** Whether the seat holding the turn has an active table of this category. */
export function useHasTables(g: Game, category: Table['category']): boolean {
  const content = useApp((s) => s.content);
  return seatTables(g, content, activeSeat(g), category).length > 0;
}

const latest = (g: Game, kind: PromptKind) => g.turn?.prompts.filter((p) => p.kind === kind).at(-1);

/** "Question idea" beside a Scene's Question field; Use copies the rolled question in. */
export function QuestionIdea({ g, onUse }: { g: Game; onUse: (text: string) => void }) {
  const dispatch = useDispatch();
  const has = useHasTables(g, 'question');
  const rolled = latest(g, 'question');
  if (!has) return null;
  return (
    <div className="row prompt-idea">
      <button type="button" onClick={() => dispatch({ type: 'DrawPrompt', kind: 'question' })}>
        Question idea
      </button>
      {rolled && (
        <>
          <span className="hint">{rolled.text}</span>
          <button
            type="button"
            className="link"
            aria-label="Use this question"
            onClick={() => onUse(rolled.text)}
          >
            Use
          </button>
        </>
      )}
    </div>
  );
}

export interface PersonDraft {
  name: string;
  description: string;
}

/** "Roll a person": name, role and want from person tables; Use fills a new character. */
export function PersonRoll({ g, onUse }: { g: Game; onUse: (p: PersonDraft) => void }) {
  const dispatch = useDispatch();
  const events = useApp((s) => s.current!.events);
  const has = useHasTables(g, 'person');
  const rolled = latest(g, 'person');
  if (!has) return null;
  return (
    <div className="row prompt-idea">
      <button type="button" onClick={() => dispatch({ type: 'DrawPrompt', kind: 'person' })}>
        Roll a person
      </button>
      {rolled && (
        <>
          <span className="hint">{rolled.text}</span>
          <button
            type="button"
            className="link"
            aria-label="Use this person"
            onClick={() => {
              const { name, role, want } = personPromptParts(events, rolled.seq);
              onUse({ name: name ?? '', description: personText({ role, want }) });
            }}
          >
            Use
          </button>
        </>
      )}
    </div>
  );
}

/** Name and description for a new character, with Roll a person beside the deck button. */
export function NewCharacterForm({ g }: { g: Game }) {
  const dispatch = useDispatch();
  const [p, setP] = useState<PersonDraft>({ name: '', description: '' });
  const add = async () => {
    const r = await dispatch({ type: 'CreateCharacter', name: p.name, description: p.description });
    if (r.ok) setP({ name: '', description: '' });
  };
  return (
    <div className="stack">
      <input
        aria-label="New character name"
        placeholder="New character"
        value={p.name}
        onChange={(e) => setP({ ...p, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (p.name.trim()) void add();
        }}
      />
      <input
        aria-label="New character description"
        placeholder="Description (optional)"
        value={p.description}
        maxLength={140}
        onChange={(e) => setP({ ...p, description: e.target.value })}
      />
      <div className="row">
        <button type="button" disabled={!p.name.trim()} onClick={() => void add()}>
          Add character
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'DrawPrompt', kind: 'character' })}
          disabled={!g.deck}
        >
          Draw a character card
        </button>
      </div>
      <PersonRoll g={g} onUse={setP} />
    </div>
  );
}
