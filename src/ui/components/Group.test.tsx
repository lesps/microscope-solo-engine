import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Seat } from '../../engine';
import type { AppStore } from '../../store';
import { go, renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, renderWith, run } from '../../../tests/support/ui';
import { useApp } from '../StoreContext';
import { OracleForm } from './OracleDialog';
import { SeatsEditor } from './SeatsEditor';

const state = (store: AppStore) => store.getState().current!.state;
const seat = (id: string, name: string, kind: Seat['kind'] = 'player'): Seat => ({
  id,
  name,
  kind,
  tables: [],
  placementBias: 'uniform',
});

afterEach(() => localStorage.clear());

describe('New game: Players option', () => {
  it('is Solo by default', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'new' });
    await user.click(await screen.findByRole('button', { name: 'Start blank' }));
    await user.click(screen.getByText('Options'));
    expect(screen.getByLabelText(/^Solo/)).toBeChecked();
    expect(screen.queryByLabelText('Player 1 name')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Title'), 'Alone');
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await screen.findByRole('list', { name: 'Setup steps' });
    expect(state(store).seats.map((s) => [s.name, s.kind])).toEqual([
      ['You', 'player'],
      ['The Stranger', 'phantom'],
    ]);
  });

  it('Group takes 2–4 named players and phantoms up to four seats', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'new' });
    await user.click(await screen.findByRole('button', { name: 'Start blank' }));
    await user.type(screen.getByLabelText('Title'), 'Table talk');
    await user.click(screen.getByText('Options'));
    await user.click(screen.getByLabelText(/^Group/));
    const group = screen.getByRole('group', { name: 'Players' });
    await user.clear(within(group).getByLabelText('Player 1 name'));
    await user.type(within(group).getByLabelText('Player 1 name'), 'Ana');
    await user.clear(within(group).getByLabelText('Player 2 name'));
    await user.type(within(group).getByLabelText('Player 2 name'), 'Ben');
    expect(within(group).getByLabelText('Phantom seats')).toHaveValue('0');
    await user.click(within(group).getByRole('button', { name: 'Add player' }));
    await user.clear(within(group).getByLabelText('Player 3 name'));
    await user.type(within(group).getByLabelText('Player 3 name'), 'Cy');
    const phantomOptions = within(within(group).getByLabelText('Phantom seats')).getAllByRole(
      'option',
    );
    expect(phantomOptions.map((o) => o.textContent)).toEqual(['0', '1']);
    await user.selectOptions(within(group).getByLabelText('Phantom seats'), '1');
    await user.click(within(group).getByRole('button', { name: 'Add player' }));
    expect(within(group).getByLabelText('Phantom seats')).toHaveValue('0');
    expect(within(group).getByRole('button', { name: 'Add player' })).toBeDisabled();
    await user.click(within(group).getByRole('button', { name: 'Remove Player 4' }));
    await user.selectOptions(within(group).getByLabelText('Phantom seats'), '1');
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await screen.findByRole('list', { name: 'Setup steps' });
    expect(state(store).seats.map((s) => [s.name, s.kind])).toEqual([
      ['Ana', 'player'],
      ['Ben', 'player'],
      ['Cy', 'player'],
      ['The Stranger', 'phantom'],
    ]);
  });

  it('blank player names fall back to Player N', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'new' });
    await user.click(await screen.findByRole('button', { name: 'Start blank' }));
    await user.type(screen.getByLabelText('Title'), 'T');
    await user.click(screen.getByText('Options'));
    await user.click(screen.getByLabelText(/^Group/));
    await user.clear(screen.getByLabelText('Player 2 name'));
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await screen.findByRole('list', { name: 'Setup steps' });
    expect(state(store).seats.map((s) => s.name)).toEqual(['Player 1', 'Player 2']);
  });
});

const seatLegends = () =>
  [...document.querySelectorAll('legend')]
    .map((l) => l.textContent)
    .filter((t) => / seat \d$/.test(t ?? ''));

function Seats() {
  const g = useApp((s) => s.current!.state);
  return <SeatsEditor g={g} rosterLocked={false} />;
}

describe('Seats editor in setup', () => {
  it('adds and removes players within four seats; players stay ahead of phantoms', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    renderWith(store, <Seats />);
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    expect(screen.getByRole('button', { name: 'Add player' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add phantom seat' })).toBeDisabled();
    expect(seatLegends()).toEqual([
      'Player seat 1',
      'Player seat 2',
      'Player seat 3',
      'Phantom seat 4',
    ]);
    await user.click(screen.getAllByRole('button', { name: 'Remove seat' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Save seats' }));
    await waitFor(() =>
      expect(state(store).seats.map((s) => s.kind)).toEqual(['player', 'player', 'phantom']),
    );
  });

  it('a solo game keeps “Your seat”, and the last player cannot be removed', async () => {
    const store = await makeStore();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    renderWith(store, <Seats />);
    expect(seatLegends()[0]).toBe('Your seat 1');
    expect(screen.getAllByRole('button', { name: 'Remove seat' })).toHaveLength(1);
  });
});

function Oracle() {
  const g = useApp((s) => s.current!.state);
  return <OracleForm g={g} />;
}

describe('Oracle in a group game', () => {
  it('asks who is asking, defaulting to the turn holder, and logs it', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    await run(store, {
      type: 'ConfigureSeats',
      seats: [seat('a', 'Ana'), seat('b', 'Ben'), seat('s', 'The Stranger', 'phantom')],
    });
    renderWith(store, <Oracle />);
    const askedBy = screen.getByLabelText('Asked by');
    expect(
      within(askedBy)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Ana', 'Ben']);
    expect(askedBy).toHaveValue('a');
    await user.selectOptions(askedBy, 'b');
    await user.type(screen.getByLabelText('Yes/no question'), 'Does it hold?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => {
      const ev = store.getState().current!.events.find((e) => e.type === 'OracleAsked');
      expect(ev?.type === 'OracleAsked' && ev.payload.call.askedBy).toBe('b');
    });
  });

  it('a solo game has no Asked by', async () => {
    const store = await makeStore();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    renderWith(store, <Oracle />);
    expect(screen.queryByLabelText('Asked by')).not.toBeInTheDocument();
  });
});

describe('Scene editor in a group game', () => {
  it('names whose Scene it is, and who asked each Oracle question once it is resolved', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const gameId = await gameInPlay(store, {
      focus: 'Tolls',
      seats: () => [seat('a', 'Ana'), seat('b', 'Ben')],
    });
    await run(store, { type: 'StartTurn' });
    await run(store, { type: 'RollPlacement', kind: 'scene' });
    await run(store, {
      type: 'CreateEntry',
      kind: 'scene',
      title: 'The vote',
      placement: state(store).turn!.rolled.placement!.placement,
      scene: { question: 'Who votes no?', form: 'played', budget: { min: 1, max: 900 } },
    });
    const entryId = state(store).turn!.entryId!;
    await run(store, {
      type: 'AskOracle',
      question: 'Is Ben bluffing?',
      odds: 5,
      entryId,
      askedBy: 'b',
    });
    await renderApp(store, { name: 'scene', gameId, entryId });
    const editor = await screen.findByRole('region', { name: 'Scene editor' });
    expect(editor).toHaveTextContent('Ana’s Scene');
    expect(within(editor).getByRole('list', { name: 'Oracle answers' })).toHaveTextContent('(Ben)');
    await user.type(screen.getByLabelText('Scene draft'), 'Ben folds.');
    await user.type(screen.getByLabelText('Answer in one sentence'), 'Nobody.');
    await user.click(screen.getByRole('button', { name: 'Resolve Scene and commit turn' }));
    await waitFor(() => expect(state(store).entries[entryId]!.locked).toBe(true));
    await go({ name: 'scene', gameId, entryId });
    expect(await screen.findByLabelText('Locked facts')).toHaveTextContent('Is Ben bluffing? → ');
    expect(screen.getByLabelText('Locked facts')).toHaveTextContent('(Ben)');
  });
});
