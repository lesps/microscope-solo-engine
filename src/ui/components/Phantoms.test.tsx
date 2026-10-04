import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Inspiration, Seat } from '../../engine';
import type { AppStore } from '../../store';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, renderWith, run } from '../../../tests/support/ui';
import { useApp } from '../StoreContext';
import { SeatsEditor } from './SeatsEditor';
import { TurnPanel } from './TurnPanel';

const state = (store: AppStore) => store.getState().current!.state;

function Panel() {
  const cur = useApp((s) => s.current!);
  return <TurnPanel g={cur.state} events={cur.events} onOracle={() => {}} />;
}

afterEach(() => localStorage.clear());

/** A game whose phantom sits first, so round 1's first turn is the phantom's. */
async function phantomFirst(store: AppStore, inspiration: Inspiration, name: string) {
  // The phantom holds round 1's Lens, so its Focus is rolled (and enforced) rather than written.
  await gameInPlay(store, {
    seats: ([you, phantom]) => [{ ...phantom!, name, inspiration } as Seat, you!],
  });
}

describe('a phantom’s turn opens with its inspiration', () => {
  it.each([
    ['cards', 'The Reader', /^The Reader turns over .+: .+\.$/],
    ['dice', 'The Gambler', /^The Gambler rolls: .+\.$/],
    ['echoes', 'The Archivist', /^The Archivist recalls .+\. What came of it\?$/],
  ] as const)('%s', async (inspiration, name, line) => {
    const user = userEvent.setup();
    const store = await makeStore();
    await phantomFirst(store, inspiration, name);
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: `Start turn (${name})` }));
    expect(await screen.findByRole('note', { name: 'Inspiration' })).toHaveTextContent(line);
  });

  it('a player’s turn has none', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: 'Start turn (You)' }));
    await screen.findByLabelText('Entry type');
    expect(screen.queryByRole('note', { name: 'Inspiration' })).not.toBeInTheDocument();
  });
});

describe('Echo prompt', () => {
  it('recalls something from the history into the turn’s prompts', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'StartTurn' });
    renderWith(store, <Panel />);
    await user.click(
      within(screen.getByRole('region', { name: 'Prompts' })).getByRole('button', { name: 'Echo' }),
    );
    await waitFor(() => expect(state(store).turn!.prompts.map((p) => p.kind)).toContain('echo'));
  });
});

function Seats() {
  const g = useApp((s) => s.current!.state);
  return <SeatsEditor g={g} rosterLocked={false} />;
}

describe('Seats editor', () => {
  it('new phantoms arrive as the Gambler, then the Archivist; inspiration can be changed', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    renderWith(store, <Seats />);
    await user.click(screen.getByRole('button', { name: 'Add phantom seat' }));
    await user.click(screen.getByRole('button', { name: 'Add phantom seat' }));
    const names = screen.getAllByLabelText('Name').map((i) => (i as HTMLInputElement).value);
    expect(names).toEqual(['You', 'The Reader', 'The Gambler', 'The Archivist']);
    const inspirations = screen.getAllByLabelText('Inspiration');
    expect(inspirations.map((s) => (s as HTMLSelectElement).value)).toEqual([
      'cards',
      'dice',
      'echoes',
    ]);
    await user.selectOptions(inspirations[0]!, '');
    await user.click(screen.getByRole('button', { name: 'Save seats' }));
    await waitFor(() =>
      expect(state(store).seats.map((s) => s.inspiration)).toEqual([
        undefined,
        undefined,
        'dice',
        'echoes',
      ]),
    );
  });
});

describe('New game', () => {
  it('group phantoms are the Reader, then the Gambler', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'new' });
    await user.click(await screen.findByRole('button', { name: 'Start blank' }));
    await user.type(screen.getByLabelText('Title'), 'T');
    await user.click(screen.getByText('Options'));
    await user.click(screen.getByLabelText(/^Group/));
    await user.selectOptions(screen.getByLabelText('Phantom seats'), '2');
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await screen.findByRole('list', { name: 'Setup steps' });
    expect(state(store).seats.map((s) => [s.name, s.inspiration])).toEqual([
      ['Player 1', undefined],
      ['Player 2', undefined],
      ['The Reader', 'cards'],
      ['The Gambler', 'dice'],
    ]);
  });
});
