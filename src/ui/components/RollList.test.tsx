import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../engine';
import { RollList } from './RollList';

const base = { gameId: 'g', batch: 1, at: '2026-01-01T00:00:00Z' };
const events = [
  {
    ...base,
    id: 'a',
    seq: 1,
    type: 'RollMade',
    payload: { purpose: 'tone', sides: 10, result: 3, text: 'Light', rng: [0, 0, 0, 0] },
  },
  {
    ...base,
    id: 'b',
    seq: 2,
    type: 'CardDrawn',
    payload: {
      purpose: 'scene.spread',
      role: 'setup',
      deckId: 'd',
      cardId: 'c',
      reversed: true,
      keyword: 'Rift',
      rng: [0, 0, 0, 0],
    },
  },
  { ...base, id: 'c', seq: 3, type: 'DeckReshuffled', payload: { deckId: 'd', rng: [0, 0, 0, 0] } },
  {
    ...base,
    id: 'd',
    seq: 4,
    type: 'OverrideUsed',
    payload: { mechanic: 'placement', rolled: 1, chosen: 2 },
  },
  {
    ...base,
    id: 'e',
    seq: 5,
    type: 'RollMade',
    payload: { purpose: 'custom.thing', sides: 6, result: 6, rng: [0, 0, 0, 0] },
  },
  { ...base, id: 'f', seq: 6, type: 'FocusSet', payload: { text: 'x', source: 'player' } },
] as GameEvent[];

describe('RollList', () => {
  it('renders nothing without roll-like events', () => {
    const { container } = render(<RollList events={[events[5]!]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows die, result and table line for each roll, draw, reshuffle and override', () => {
    render(<RollList events={events} label="Rolls here" />);
    const items = within(screen.getByRole('list', { name: 'Rolls here' })).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('d10 → 3');
    expect(items[0]).toHaveTextContent('Tone: Light');
    expect(items[1]).toHaveTextContent('rev.');
    expect(items[1]).toHaveTextContent('Spread (setup): Rift');
    expect(items[2]).toHaveTextContent('Deck reshuffled');
    expect(items[3]).toHaveTextContent('Override: Placement');
    expect(items[4]).toHaveTextContent('custom.thing');
  });

  it('animates the newest roll unless reduced motion is requested', () => {
    const { container, unmount } = render(<RollList events={events} />);
    expect(container.querySelectorAll('.roll-anim')).toHaveLength(1);
    unmount();
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    const r = render(<RollList events={events} />);
    expect(r.container.querySelectorAll('.roll-anim')).toHaveLength(0);
    spy.mockRestore();
  });
});
