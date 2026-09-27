import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pwaStub } from '../../../tests/support/pwa-stub';
import type { AppStore } from '../../store';
import { gameInPlay, makeStore, playRound, renderWith } from '../../../tests/support/ui';
import * as download from '../lib/download';
import { useApp } from '../StoreContext';
import { SeatsEditor } from './SeatsEditor';
import { BackupBanner, ExportMenu, PersistIndicator } from './Status';
import { UpdatePrompt } from './UpdatePrompt';

const state = (store: AppStore) => store.getState().current!.state;

function Seats({ locked = false }: { locked?: boolean }) {
  const g = useApp((s) => s.current!.state);
  return <SeatsEditor g={g} rosterLocked={locked} />;
}

describe('SeatsEditor', () => {
  it('edits names, bias, Focus mode, tables and weights, adds and removes phantoms', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    renderWith(store, <Seats />);
    const phantom = () => document.querySelectorAll('fieldset')[1] as HTMLElement;
    const names = screen.getAllByLabelText('Name');
    await user.clear(names[1]!);
    await user.type(names[1]!, 'The Cartographer');
    await user.selectOptions(screen.getAllByLabelText('Placement bias')[1]!, 'late');
    await user.selectOptions(screen.getAllByLabelText('Focus mode')[1]!, 'prompt');
    await user.click(screen.getAllByText(/^Tables/)[1]!);
    await user.click(within(phantom()).getByLabelText(/Spheres of life/));
    await user.click(screen.getAllByText(/^Entry-type weights/)[1]!);
    await user.click(within(phantom()).getByLabelText(/custom weights/));
    const period = within(phantom()).getByLabelText('period');
    await user.clear(period);
    await user.type(period, '0');
    await user.click(screen.getByRole('button', { name: 'Add phantom seat' }));
    await user.click(screen.getByRole('button', { name: 'Add phantom seat' }));
    expect(screen.queryByRole('button', { name: 'Add phantom seat' })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Remove seat' })[2]!);
    await user.click(screen.getByRole('button', { name: 'Save seats' }));
    await screen.findByText('Saved.');
    const seats = state(store).seats;
    expect(seats).toHaveLength(3);
    expect(seats[1]).toMatchObject({
      name: 'The Cartographer',
      placementBias: 'late',
      focusMode: 'prompt',
      tables: ['starter.domains'],
      entryTypeWeights: { period: 0, event: 50, scene: 25 },
    });
  });

  it('a locked roster can still change profiles but not add or remove seats', async () => {
    const store = await makeStore();
    await store.getState().createGame({ title: 'T', ruleset: 'lens' });
    renderWith(store, <Seats locked />);
    expect(screen.queryByRole('button', { name: 'Add phantom seat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove seat' })).not.toBeInTheDocument();
    expect(screen.getByText(/roster is fixed/)).toBeInTheDocument();
  });
});

describe('Status', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PersistIndicator shows storage durability and save state', async () => {
    const store = await makeStore({ persist: 'persisted' });
    renderWith(store, <PersistIndicator />);
    expect(screen.getByTestId('persist-status')).toHaveTextContent('persisted');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    await act(() => store.getState().createGame({ title: 'T', ruleset: 'lens' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() =>
      store.setState({
        current: { ...store.getState().current!, save: 'error', saveError: 'disk full' },
      }),
    );
    expect(screen.getByText('Save failed')).toHaveAttribute('title', 'disk full');
  });

  it('BackupBanner appears when due, exports, and snoozes', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
    const store = await makeStore();
    await store.getState().setBackupThresholds({ rounds: 1, days: 7 });
    const id = await gameInPlay(store, {
      start: false,
      settings: (x) => ({ ...x, modes: { ...x.modes, cohesion: 'off' } }),
    });
    function Banner() {
      const meta = useApp((s) => s.games.find((m) => m.id === id));
      return <BackupBanner meta={meta} />;
    }
    renderWith(store, <Banner />);
    expect(screen.queryByRole('status', { name: 'Backup reminder' })).not.toBeInTheDocument();
    await act(() => playRound(store));
    const banner = await screen.findByRole('status', { name: 'Backup reminder' });
    await user.click(within(banner).getByRole('button', { name: 'Export game file' }));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        'river.microscope.json',
        expect.stringContaining('solo-microscope/game'),
        'application/json',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Backup reminder' })).not.toBeInTheDocument(),
    );
    await act(() => playRound(store));
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Backup reminder' })).not.toBeInTheDocument(),
    );
    expect(store.getState().games[0]!.backupSnoozedAtRound).toBe(2);
  });

  it('ExportMenu downloads each format and closes after a pick or an outside click', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    function Menu() {
      const cur = useApp((s) => s.current!);
      return (
        <>
          <p>outside</p>
          <ExportMenu g={cur.state} events={cur.events} />
        </>
      );
    }
    renderWith(store, <Menu />);
    const open = () => user.click(screen.getByRole('button', { name: 'Export' }));
    await open();
    await user.click(screen.getByRole('menuitem', { name: 'Chronological manuscript' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await open();
    await user.click(screen.getByLabelText('include rolls and draws'));
    await user.click(screen.getByRole('menuitem', { name: 'Play-order manuscript' }));
    await open();
    await user.click(screen.getByRole('menuitem', { name: 'Outline' }));
    await open();
    await user.click(screen.getByRole('menuitem', { name: 'Game file (JSON)' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(4));
    const names = spy.mock.calls.map((c) => c[0]);
    expect(names).toEqual([
      'river-chronological.md',
      'river-play-order.md',
      'river-outline.md',
      'river.microscope.json',
    ]);
    expect(spy.mock.calls[1]![1]).not.toContain('🎲');
    await open();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('UpdatePrompt', () => {
  afterEach(() => Object.assign(pwaStub, { needRefresh: false, offlineReady: false, updated: 0 }));

  it('renders nothing when there is no update', () => {
    const { container } = renderWith({} as AppStore, <UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks before reloading into a new version', async () => {
    const user = userEvent.setup();
    pwaStub.needRefresh = true;
    renderWith({} as AppStore, <UpdatePrompt />);
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(pwaStub.updated).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces offline readiness', async () => {
    const user = userEvent.setup();
    pwaStub.offlineReady = true;
    renderWith({} as AppStore, <UpdatePrompt />);
    expect(screen.getByText('Ready to work offline.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
