import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import malformed from '../../../tests/fixtures/packs/malformed.json';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, playRound, run } from '../../../tests/support/ui';
import type { AppStore } from '../../store';

const state = (store: AppStore) => store.getState().current!.state;
const json = (data: unknown, name = 'p.json') =>
  new File([typeof data === 'string' ? data : JSON.stringify(data)], name, {
    type: 'application/json',
  });

const harbor = {
  schemaVersion: 1,
  id: 'harbor',
  name: 'Harbor towns',
  version: '1.0.0',
  license: 'CC0',
  description: 'Ships.',
  tables: [
    {
      id: 'harbor.domains',
      name: 'Harbor life',
      category: 'domain',
      die: 2,
      entries: [
        { text: 'Fishing', range: [1, 1] },
        { text: 'Storms', range: [2, 2], weight: 2 },
      ],
    },
    {
      id: 'harbor.pairs',
      name: 'Harbor pairs',
      category: 'wordPair',
      action: [{ text: 'Salvage' }],
      subject: [{ text: 'a hull' }],
    },
  ],
  decks: [
    {
      id: 'harbor.deck',
      name: 'Tiny deck',
      cards: [
        {
          id: 'm0',
          arcana: 'major',
          rank: 0,
          name: 'The Tide',
          upright: 'Flow',
          reversed: 'Ebb',
          tier: 'grand',
        },
      ],
    },
  ],
};

describe('Game settings screen', () => {
  it('edits every section and saves; presets only fill the form', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await gameInPlay(store, { focus: 'Tolls' });
    await renderApp(store, { name: 'game-settings', gameId: id });
    await screen.findByRole('heading', { name: 'Game settings' });

    await user.click(screen.getByRole('button', { name: 'High Friction' }));
    expect(state(store).settings.modes.placement).toBe('prompt');
    await user.click(screen.getByRole('button', { name: 'Default' }));

    await user.selectOptions(screen.getByLabelText(/^Placement/), 'enforce');
    await user.selectOptions(screen.getByLabelText(/^Dial drift/), 'random');
    await user.click(screen.getByLabelText(/Chaos dial/));
    const cap = screen.getByLabelText(/Turn cap per round/);
    fireEvent.change(cap, { target: { value: '99' } });
    expect(cap).toHaveValue(50);
    fireEvent.change(cap, { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('scene'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('deck'), { target: { value: '0' } });
    await user.click(screen.getByLabelText('Spheres of life'));
    await user.click(screen.getByLabelText(/Reversed cards/));
    await user.click(screen.getByLabelText('Tone from pip cards'));
    await user.click(screen.getByLabelText(/Oracle qualifiers/));
    await user.selectOptions(screen.getByLabelText('Word budget'), 'enforce');
    const budget = screen.getByText(/^Default budget/);
    const [min, max] = within(budget).getAllByRole('spinbutton');
    fireEvent.change(min!, { target: { value: '100' } });
    fireEvent.change(max!, { target: { value: '400' } });
    await user.click(screen.getByLabelText('Pause before drafting'));
    fireEvent.change(screen.getByLabelText(/Pause length/), { target: { value: '30' } });
    expect(screen.getByText(/as it thins the odds/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Saved.');
    const s = state(store).settings;
    expect(s.modes.placement).toBe('enforce');
    expect(s).toMatchObject({
      drift: 'random',
      chaos: true,
      cohesionCap: 3,
      entryTypeWeights: { scene: 40 },
      focusSourceWeights: { deck: 0 },
      deck: { reversals: false, toneFromPip: true },
      oracle: { qualifiers: false },
      scene: {
        budget: 'enforce',
        pause: true,
        pauseSeconds: 30,
        defaultBudget: { min: 100, max: 400 },
      },
    });
    expect(s.activeTables).not.toContain('starter.domains');
    expect(state(store).dials.chaos).toBe(5);
    expect(screen.getByText('Seats change between rounds.')).toBeInTheDocument();
  });

  it('cannot save while a turn is open', async () => {
    const store = await makeStore();
    const id = await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'StartTurn' });
    await renderApp(store, { name: 'game-settings', gameId: id });
    expect(await screen.findByText(/A turn is open/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });

  it('edits seats between rounds', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await gameInPlay(store, {
      start: false,
      settings: (s) => ({ ...s, modes: { ...s.modes, cohesion: 'off' } }),
    });
    await playRound(store);
    await renderApp(store, { name: 'game-settings', gameId: id });
    const names = await screen.findAllByLabelText('Name');
    await user.clear(names[1]!);
    await user.type(names[1]!, 'The Surveyor');
    await user.click(screen.getByRole('button', { name: 'Save seats' }));
    await waitFor(() => expect(state(store).seats[1]!.name).toBe('The Surveyor'));
    expect(screen.getByRole('button', { name: 'Add phantom seat' })).toBeInTheDocument();
  });
});

describe('Content packs screen', () => {
  it('lists the built-in pack and inspects its tables and deck', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'packs' });
    const list = await screen.findByRole('list', { name: 'Installed packs' });
    const starter = within(list)
      .getAllByRole('listitem')
      .find((li) => li.textContent!.includes('Starter pack'))!;
    expect(starter).toHaveTextContent('built in');
    expect(within(starter).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    await user.click(within(starter).getByText('Inspect'));
    await user.click(within(starter).getByText('Keyword deck'));
    expect(within(starter).getByText('Leap')).toBeInTheDocument();
  });

  it('refuses an invalid pack with per-entry errors; installs, toggles and removes a valid one', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'packs' });
    const input = await screen.findByLabelText('Import content pack');
    await user.upload(input, json(malformed));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/The pack was not installed \(\d+ problems\)/);
    expect(
      within(alert).getByText(/tables\[1\]\.entries\[0\]\.text: must not be empty/),
    ).toBeInTheDocument();
    expect(store.getState().packs).toHaveLength(2);

    await user.upload(input, json('{nope'));
    expect(await screen.findByText(/^\(file\):/)).toBeInTheDocument();

    await user.upload(input, json(harbor));
    expect(await screen.findByRole('status')).toHaveTextContent('Pack installed and enabled');
    const item = within(screen.getByRole('list', { name: 'Installed packs' }))
      .getAllByRole('listitem')
      .find((li) => li.textContent!.includes('Harbor towns'))!;
    expect(item).toHaveTextContent('2 tables · 1 deck · CC0');
    expect(item).toHaveTextContent('Ships.');
    await user.click(within(item).getByText('Inspect'));
    await user.click(within(item).getByText('Harbor life'));
    expect(within(item).getByText(/Storms ×2 \[2–2\]/)).toBeInTheDocument();
    expect(store.getState().content.tables['harbor.domains']).toBeDefined();
    await user.click(within(item).getByLabelText('enabled'));
    await waitFor(() => expect(store.getState().content.tables['harbor.domains']).toBeUndefined());
    await user.click(within(item).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(store.getState().packs).toHaveLength(2));
  });
});

describe('Storage screen', () => {
  it('shows durability and usage, re-requests persistence, saves backup thresholds and credits', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'app-settings' });
    expect(await screen.findByTestId('storage-status')).toHaveTextContent('best-effort');
    expect(screen.getByTestId('storage-status').parentElement).toHaveTextContent(
      /using 2\.5 MB of 1\.0 GB/,
    );
    expect(screen.getByText(/Installing the app/)).toBeInTheDocument();
    expect(screen.getByText(/Use Export all in the Library before moving/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request durable storage again' }));
    fireEvent.change(screen.getByLabelText('Rounds'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Days'), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(store.getState().backup).toEqual({ rounds: 5, days: 1 }));
    expect(screen.getByText(/CodenameAwesome/)).toBeInTheDocument();
  });

  it('hides the re-request button once persisted', async () => {
    const store = await makeStore({ persist: 'persisted' });
    await renderApp(store, { name: 'app-settings' });
    expect(await screen.findByTestId('storage-status')).toHaveTextContent('persisted');
    expect(
      screen.queryByRole('button', { name: 'Request durable storage again' }),
    ).not.toBeInTheDocument();
  });
});
