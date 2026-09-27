import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import lensFixture from '../../../tests/fixtures/lens-3-rounds.json';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore } from '../../../tests/support/ui';
import * as download from '../lib/download';

const file = (data: unknown, name = 'g.json') =>
  new File([JSON.stringify(data)], name, { type: 'application/json' });

describe('App shell', () => {
  it('shows navigation, storage status and credits; unknown routes offer a way back', async () => {
    const store = await makeStore();
    await renderApp(store);
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const l of ['Library', 'Packs', 'Storage'])
      expect(within(nav).getByRole('link', { name: l })).toBeInTheDocument();
    expect(screen.getByTestId('persist-status')).toHaveTextContent('best-effort');
    expect(screen.getByText(/Ben Robbins/)).toHaveTextContent('not affiliated');
    expect(screen.getByText(/No games yet/)).toBeInTheDocument();
    await act(async () => {
      window.location.hash = '#/nowhere';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByText(/Nothing at “\/nowhere”/)).toBeInTheDocument();
  });

  it.each([
    { name: 'table', gameId: 'missing' },
    { name: 'setup', gameId: 'missing' },
    { name: 'game-settings', gameId: 'missing' },
    { name: 'scene', gameId: 'missing', entryId: 'e' },
  ] as const)('game route $name for a missing game says so', async (route) => {
    const store = await makeStore();
    await renderApp(store, route);
    expect(await screen.findByText(/That game was not found/)).toBeInTheDocument();
  });
});

describe('Library screen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists games with ruleset, rounds and backup state; opens, duplicates, exports and deletes', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
    const store = await makeStore();
    await gameInPlay(store, { start: false });
    await renderApp(store);
    const list = await screen.findByRole('list', { name: 'Games' });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('River');
    expect(item).toHaveTextContent('Lens · 0 rounds');
    expect(item).toHaveTextContent('never backed up');

    await user.click(within(item).getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByRole('status', { name: 'Import result' })).toHaveTextContent('Duplicated');

    await user.click(
      within(list).getAllByRole('listitem')[0]!.querySelector('button:nth-of-type(3)')!,
    );
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        'river.microscope.json',
        expect.any(String),
        'application/json',
      ),
    );
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('backed up'),
    );

    const first = within(list).getAllByRole('listitem')[0]!;
    await user.click(within(first).getByRole('button', { name: 'Delete' }));
    await user.click(within(first).getByRole('button', { name: 'Cancel' }));
    await user.click(within(first).getByRole('button', { name: 'Delete' }));
    await user.click(within(first).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));

    await user.click(within(list).getByRole('button', { name: 'Open' }));
    expect(window.location.hash).toMatch(/^#\/game\//);
  });

  it('imports a game file, offers import-as-copy for a duplicate id, and dismisses', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store);
    const input = await screen.findByLabelText('Import game file or bundle');
    await user.upload(input, file(lensFixture));
    const status = await screen.findByRole('status', { name: 'Import result' });
    await waitFor(() => expect(status).toHaveTextContent('Game imported.'));
    await user.upload(input, file(lensFixture));
    await waitFor(() => expect(status).toHaveTextContent('already exists'));
    await user.click(screen.getByRole('button', { name: 'Import as copy' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Games' })).getAllByRole('listitem'),
      ).toHaveLength(2),
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status', { name: 'Import result' })).not.toBeInTheDocument();
  });

  it('reports unreadable and invalid files', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store);
    const input = await screen.findByLabelText('Import game file or bundle');
    await user.upload(input, new File(['{not json'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText(/Could not read that file/)).toBeInTheDocument();
    await user.upload(input, file({ format: 'solo-microscope/game', events: [] }));
    expect(await screen.findByText(/Import failed/)).toBeInTheDocument();
  });

  it('exports all as a bundle and imports a bundle, copying existing games on request', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
    const store = await makeStore();
    await gameInPlay(store, { start: false });
    await renderApp(store);
    await user.click(await screen.findByRole('button', { name: 'Export all' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [name, text] = spy.mock.calls[0]!;
    expect(name).toMatch(/^solo-microscope-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await user.upload(screen.getByLabelText('Import game file or bundle'), file(JSON.parse(text)));
    const status = await screen.findByRole('status', { name: 'Import result' });
    await waitFor(() => expect(status).toHaveTextContent('Imported 0 game(s). 1 already exist.'));
    await user.click(screen.getByRole('button', { name: 'Import as copy' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Games' })).getAllByRole('listitem'),
      ).toHaveLength(2),
    );
  });

  it('Export all is disabled with no games', async () => {
    const store = await makeStore();
    await renderApp(store);
    expect(await screen.findByRole('button', { name: 'Export all' })).toBeDisabled();
  });
});
