import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  gameInPlay,
  makeStore,
  renderWith,
  run,
  startPeriodId,
  withModes,
} from '../../../tests/support/ui';
import { useApp } from '../StoreContext';
import { Timeline, type Zoom } from './Timeline';

function Harness({ onOpen }: { onOpen: (id: string) => void }) {
  const g = useApp((s) => s.current!.state);
  const [zoom, setZoom] = useState<Zoom>({ level: 'history' });
  return <Timeline g={g} onOpen={onOpen} zoom={zoom} setZoom={setZoom} />;
}

describe('Timeline', () => {
  it('lays Periods out in order with Events nested and Bookends marked', async () => {
    const store = await makeStore();
    await gameInPlay(store);
    renderWith(store, <Harness onOpen={vi.fn()} />);
    const periods = screen.getAllByRole('region', { name: /^Period / });
    expect(periods.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Period Founding',
      'Period Canals',
      'Period Drowning',
    ]);
    expect(within(periods[0]!).getByText('first Bookend')).toBeInTheDocument();
    expect(
      within(periods[0]!).getByRole('button', { name: /event First bridge, dark, locked/ }),
    ).toBeInTheDocument();
  });

  it('opens entries on click', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const store = await makeStore();
    await gameInPlay(store);
    renderWith(store, <Harness onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: /period Canals/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.any(String));
  });

  it('renders the rolled placement as a gap before the entry exists, then highlights the new entry', async () => {
    const store = await makeStore();
    await gameInPlay(store, { settings: withModes({ entryType: 'off' }), focus: 'Tolls' });
    renderWith(store, <Harness onOpen={vi.fn()} />);
    await act(() => run(store, { type: 'StartTurn' }));
    expect(screen.queryByRole('note', { name: 'Rolled placement' })).not.toBeInTheDocument();
    await act(() => run(store, { type: 'RollPlacement', kind: 'period' }));
    expect(screen.getByRole('note', { name: 'Rolled placement' })).toHaveTextContent(
      'New Period here',
    );
    const placement = store.getState().current!.state.turn!.rolled.placement!.placement;
    await act(() =>
      run(store, { type: 'CreateEntry', kind: 'period', title: 'Floods', placement }),
    );
    expect(screen.queryByRole('note', { name: 'Rolled placement' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /period Floods/ })).toHaveClass('new-entry');
  });

  it('shows Event and Scene gaps in place', async () => {
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    renderWith(store, <Harness onOpen={vi.fn()} />);
    await act(() => run(store, { type: 'StartTurn' }));
    await act(() => run(store, { type: 'RollPlacement', kind: 'scene' }));
    const event = screen.getByRole('button', { name: /event First bridge/ }).closest('.event')!;
    expect(within(event as HTMLElement).getByRole('note')).toHaveTextContent('New Scene here');
  });

  it('expands Scenes to their prose and zooms to a Period and an Event', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls', settings: withModes({ placement: 'off' }) });
    const ev = Object.values(store.getState().current!.state.entries).find(
      (e) => e.kind === 'event',
    )!;
    await run(store, { type: 'StartTurn' });
    const tone = store.getState().current!.state.turn!.rolled.tone;
    await run(store, {
      type: 'CreateEntry',
      kind: 'scene',
      title: 'Toll',
      tone,
      placement: { parentId: ev.id, index: 0 },
      scene: { question: 'Who pays?', form: 'played' },
    });
    const sceneId = store.getState().current!.state.turn!.entryId!;
    await run(store, { type: 'EditProse', entryId: sceneId, prose: 'Rain on planks.' });
    await run(store, { type: 'ResolveScene', entryId: sceneId, answer: 'The ferrywoman.' });
    renderWith(store, <Harness onOpen={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Show prose of Toll' }));
    expect(screen.getByText(/Rain on planks\./)).toBeInTheDocument();
    expect(screen.getByText(/A: The ferrywoman\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zoom to Founding' }));
    expect(screen.getAllByRole('region', { name: /^Period / })).toHaveLength(1);
    expect(screen.getByText('Period view: Founding')).toBeInTheDocument();
    expect(screen.getByText('Mud.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zoom to First bridge' }));
    expect(screen.getByText('Event view: First bridge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom to First bridge' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getAllByRole('region', { name: /^Period / })).toHaveLength(3);
    expect(startPeriodId(store)).toBeTruthy();
  });
});
