import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppStore } from '../../store';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, run } from '../../../tests/support/ui';

const state = (store: AppStore) => store.getState().current!.state;

afterEach(() => localStorage.clear());

async function atPalette(store: AppStore, count: number) {
  const id = await store.getState().createGame({ title: 'T', ruleset: 'lens' });
  await run(store, {
    type: 'ChangeSettings',
    settings: { ...state(store).settings, paletteRollCount: count },
  });
  await run(store, { type: 'SetBigPicture', text: 'A city rises.' });
  await run(store, {
    type: 'SetBookends',
    start: { title: 'Start', prose: '', tone: 'light' },
    end: { title: 'End', prose: '', tone: 'dark' },
  });
  await renderApp(store, { name: 'setup', gameId: id, start: { kind: 'blank' } });
}

describe('rolled Palette items', () => {
  it('Game settings sets how many are rolled', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await gameInPlay(store, { start: false });
    await renderApp(store, { name: 'game-settings', gameId: id });
    const count = await screen.findByLabelText(/Rolled Palette items at setup/);
    expect(count).toHaveValue(2);
    fireEvent.change(count, { target: { value: '4' } });
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(state(store).settings.paletteRollCount).toBe(4));
  });

  it('setup rolls the configured number', async () => {
    const store = await makeStore();
    await atPalette(store, 3);
    expect(await screen.findByText('Rolled items (0/3)')).toBeInTheDocument();
  });

  it('with none to roll, setup shows no rolled items', async () => {
    const store = await makeStore();
    await atPalette(store, 0);
    expect(await screen.findByLabelText('Add to Yes')).toBeInTheDocument();
    expect(screen.queryByText(/Rolled items/)).not.toBeInTheDocument();
  });

  it('a group game rolls one per player, at least two', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'new' });
    await user.click(await screen.findByRole('button', { name: 'Start blank' }));
    await user.type(screen.getByLabelText('Title'), 'T');
    await user.click(screen.getByText('Options'));
    await user.click(screen.getByLabelText(/^Group/));
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await screen.findByRole('list', { name: 'Setup steps' });
    await waitFor(() => expect(state(store).settings.paletteRollCount).toBe(3));
  });
});
