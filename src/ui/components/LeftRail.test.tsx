import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { gameInPlay, makeStore, renderWith, run, withModes } from '../../../tests/support/ui';
import { LeftRail } from './LeftRail';
import { useApp } from '../StoreContext';

function Rail() {
  const g = useApp((s) => s.current!.state);
  return <LeftRail g={g} />;
}

describe('LeftRail', () => {
  it('shows the Big Picture, Palette, six Legacy slots, seats and dials', async () => {
    const store = await makeStore();
    await gameInPlay(store);
    renderWith(store, <Rail />);
    expect(screen.getByRole('region', { name: 'Big Picture' })).toHaveTextContent(
      'A river city rises and drowns.',
    );
    const palette = screen.getByRole('region', { name: 'Palette' });
    expect(palette).toHaveTextContent('Bridges');
    expect(palette).toHaveTextContent('Dragons');
    const legacies = screen.getByRole('region', { name: 'Legacies' });
    expect(within(legacies).getAllByRole('listitem')).toHaveLength(6);
    expect(legacies).toHaveTextContent('Legacies (0/6)');
    const seats = screen.getByRole('region', { name: 'Seats' });
    expect(seats).toHaveTextContent('You');
    expect(seats).toHaveTextContent('The Stranger');
    expect(seats).toHaveTextContent('holds the Lens');
    expect(screen.getByRole('meter', { name: 'Mood' })).toHaveAttribute('aria-valuenow', '5');
    expect(screen.queryByRole('meter', { name: 'Chaos' })).not.toBeInTheDocument();
  });

  it('highlights the Lens seat while the Focus is open, then the turn seat', async () => {
    const store = await makeStore();
    await gameInPlay(store);
    renderWith(store, <Rail />);
    const current = () =>
      screen.getByRole('region', { name: 'Seats' }).querySelector('[aria-current="true"]');
    expect(current()).toHaveTextContent('You');
    await act(() => run(store, { type: 'SetFocus', text: 'Tolls' }));
    await act(() => run(store, { type: 'StartTurn' }));
    expect(current()).toHaveTextContent('You');
  });

  it('adds Palette items between turns and removes them between rounds only', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { start: false });
    renderWith(store, <Rail />);
    await user.selectOptions(screen.getByLabelText('Palette list'), 'no');
    await user.type(screen.getByLabelText('New Palette item'), 'Kings');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(store.getState().current!.state.palette.no.map((i) => i.text)).toEqual([
      'Dragons',
      'Kings',
    ]);
    await waitFor(() => expect(screen.getByLabelText('New Palette item')).toHaveValue(''));
    await user.click(screen.getByRole('button', { name: 'Remove Kings' }));
    expect(store.getState().current!.state.palette.no.map((i) => i.text)).toEqual(['Dragons']);
    await act(() => run(store, { type: 'StartRound' }));
    expect(screen.queryByRole('button', { name: 'Remove Dragons' })).not.toBeInTheDocument();
  });

  it('shows Legacies with seat tags, Chaos when on, and soft Lens checks', async () => {
    const store = await makeStore();
    await gameInPlay(store, {
      settings: withModes({ cohesion: 'off' }, { chaos: true }),
      focus: 'Tolls',
    });
    await run(store, { type: 'StartTurn' });
    await run(store, { type: 'RollPlacement', kind: 'event' });
    const placement = store.getState().current!.state.turn!.rolled.placement!.placement;
    await run(store, { type: 'CreateEntry', kind: 'event', title: 'The 300 years war', placement });
    await run(store, { type: 'CommitTurn' });
    await run(store, { type: 'AddLegacy', text: 'The toll-house' });
    await run(store, {
      type: 'CreateCharacter',
      name: 'Old Mother',
      description: '',
      immortal: true,
    });
    renderWith(store, <Rail />);
    expect(screen.getByRole('region', { name: 'Legacies' })).toHaveTextContent(
      'The toll-house You · R1',
    );
    expect(screen.getByRole('meter', { name: 'Chaos' })).toHaveAttribute('aria-valuenow', '5');
    const checks = screen.getByRole('region', { name: 'Lens checks' });
    expect(checks).toHaveTextContent('concrete date');
    expect(checks).toHaveTextContent('Old Mother is marked immortal');
  });

  it('shows a Chronicle Subject with current traits', async () => {
    const store = await makeStore();
    await gameInPlay(store, { ruleset: 'chronicle' });
    renderWith(store, <Rail />);
    const subject = screen.getByRole('region', { name: 'Subject' });
    expect(subject).toHaveTextContent('Saltmark Light');
    for (const t of ['tall', 'lonely', 'bright', 'haunted'])
      expect(within(subject).getByText(t)).toBeInTheDocument();
  });
});
