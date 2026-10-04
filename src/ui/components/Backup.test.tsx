import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, playRound, renderWith, withModes } from '../../../tests/support/ui';
import { useApp } from '../StoreContext';
import * as download from '../lib/download';
import { lastBackupLabel } from '../lib/backup';
import { TurnPanel } from './TurnPanel';

function Panel() {
  const cur = useApp((s) => s.current!);
  return <TurnPanel g={cur.state} events={cur.events} onOracle={() => {}} />;
}

afterEach(() => vi.restoreAllMocks());

describe('backup at the end of a round', () => {
  it('offers Back up all games between rounds, which saves one dated bundle', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(download, 'downloadText').mockImplementation(async () => {});
    const store = await makeStore();
    const id = await gameInPlay(store, { start: false, settings: withModes({ cohesion: 'off' }) });
    renderWith(store, <Panel />);
    expect(screen.queryByRole('button', { name: 'Back up all games' })).not.toBeInTheDocument();
    await playRound(store);
    await user.click(await screen.findByRole('button', { name: 'Back up all games' }));
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    const [name, text, mime] = spy.mock.calls[0]!;
    expect(name).toMatch(/^solo-microscope-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mime).toBe('application/json');
    expect(JSON.parse(text).games.map((g: { gameId: string }) => g.gameId)).toEqual([id]);
    await waitFor(() =>
      expect(store.getState().games.find((m) => m.id === id)!.lastExportedAt).toBeDefined(),
    );
  });
});

describe('Storage screen', () => {
  it('shows when the last backup was made', async () => {
    const store = await makeStore();
    await gameInPlay(store, { start: false });
    await renderApp(store, { name: 'app-settings' });
    expect(await screen.findByText(/Last backup:/)).toHaveTextContent('Last backup: never');
    await act(() => store.getState().exportAll());
    // The test store's clock starts in January 2026, so only "no longer never" is stable here;
    // lastBackupLabel's wording is covered below.
    expect(screen.getByText(/Last backup:/)).not.toHaveTextContent('never');
  });
});

describe('lastBackupLabel', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const meta = (lastExportedAt?: string) => ({ lastExportedAt }) as never;
  it.each([
    [[], 'never'],
    [[meta()], 'never'],
    [[meta('2026-10-10T08:00:00Z')], 'today'],
    [[meta('2026-10-09T08:00:00Z')], 'yesterday'],
    [[meta('2026-10-01T08:00:00Z'), meta('2026-10-07T08:00:00Z')], '3 days ago'],
  ])('%j → %s', (games, label) => expect(lastBackupLabel(games, now)).toBe(label));
});
