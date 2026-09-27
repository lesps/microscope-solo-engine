import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AppStore } from '../../store';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, run } from '../../../tests/support/ui';

const state = (store: AppStore) => store.getState().current!.state;

// jsdom has no layout; make every element count as visible for clickFirst.
function fakeLayout() {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get: () => document.body,
  });
}

describe('Table screen', () => {
  it('redirects to setup while setup is unfinished', async () => {
    const store = await makeStore();
    const id = await store.getState().createGame({ title: 'New', ruleset: 'lens' });
    await renderApp(store, { name: 'table', gameId: id });
    await waitFor(() => expect(window.location.hash).toBe(`#/game/${id}/setup`));
  });

  it('shows title, ruleset, rails and links; toggles the narrow-screen drawers', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await gameInPlay(store);
    await renderApp(store, { name: 'table', gameId: id });
    expect(await screen.findByRole('heading', { name: 'River' })).toBeInTheDocument();
    expect(screen.getByText('Lens')).toHaveClass('badge');
    expect(screen.getByRole('complementary', { name: 'Standing context' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Game settings' })).toHaveAttribute(
      'href',
      `#/game/${id}/settings`,
    );
    await user.click(screen.getByRole('button', { name: 'Context' }));
    expect(screen.getByRole('complementary', { name: 'Standing context' })).toHaveClass('open');
    fireEvent.click(document.querySelector('.scrim')!);
    expect(screen.getByRole('complementary', { name: 'Standing context' })).not.toHaveClass('open');
    await user.click(screen.getByRole('button', { name: 'Turn' }));
    expect(screen.getByRole('complementary', { name: 'Turn panel' })).toHaveClass('open');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('complementary', { name: 'Turn panel' })).not.toHaveClass('open');
  });

  it('keyboard: N takes the next step, R rolls, O opens the oracle, E opens the entry, Ctrl+Z undoes', async () => {
    fakeLayout();
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await gameInPlay(store, { focus: 'Tolls' });
    await renderApp(store, { name: 'table', gameId: id });
    await screen.findByRole('heading', { name: 'River' });
    fireEvent.keyDown(window, { key: 'n' });
    await waitFor(() => expect(state(store).turn).toBeDefined());
    await user.selectOptions(screen.getByLabelText('Entry type'), 'event');
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(window, { key: 'r' });
    await waitFor(() => expect(state(store).turn!.rolled.placement).toBeDefined());

    fireEvent.keyDown(window, { key: 'o' });
    expect(await screen.findByRole('dialog', { name: 'Oracle' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Oracle' })).not.toBeInTheDocument(),
    );

    await act(() =>
      run(store, {
        type: 'CreateEntry',
        kind: 'event',
        title: 'Tolls begin',
        placement: state(store).turn!.rolled.placement!.placement,
      }),
    );
    fireEvent.keyDown(window, { key: 'e' });
    expect(await screen.findByRole('dialog', { name: 'Tolls begin' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(state(store).turn!.entryId).toBeUndefined());
  });

  it('opens an entry from the timeline and shows rejections as a dismissible alert', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await gameInPlay(store, { focus: 'Tolls' });
    await renderApp(store, { name: 'table', gameId: id });
    await user.click(await screen.findByRole('button', { name: /period Canals/ }));
    expect(screen.getByRole('dialog', { name: 'Canals' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await act(async () => {
      await store.getState().dispatch({ type: 'CommitTurn' });
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('no open turn');
    await user.click(within(alert).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('backup banner shows on the table once due', async () => {
    const store = await makeStore();
    await store.getState().setBackupThresholds({ rounds: 1, days: 30 });
    const id = await gameInPlay(store, {
      settings: (s) => ({ ...s, modes: { ...s.modes, cohesion: 'off' } }),
      start: false,
    });
    const { playRound } = await import('../../../tests/support/ui');
    await playRound(store);
    await renderApp(store, { name: 'table', gameId: id });
    expect(await screen.findByRole('status', { name: 'Backup reminder' })).toBeInTheDocument();
  });
});
