import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../../store';
import { gameInPlay, makeStore, renderWith, run } from '../../../tests/support/ui';
import { useApp } from '../StoreContext';
import { EntryDialog } from './EntryDialog';
import { OracleDialog } from './OracleDialog';

const state = (store: AppStore) => store.getState().current!.state;

function Entry({ id, onClose = vi.fn() }: { id: string; onClose?: () => void }) {
  const g = useApp((s) => s.current!.state);
  return <EntryDialog g={g} entry={g.entries[id]!} onClose={onClose} />;
}

async function committedEvent(store: AppStore) {
  await gameInPlay(store, { focus: 'Tolls' });
  await run(store, { type: 'StartTurn' });
  await run(store, { type: 'RollPlacement', kind: 'event' });
  await run(store, {
    type: 'CreateEntry',
    kind: 'event',
    title: 'Tolls begin',
    prose: 'First draft.',
    placement: state(store).turn!.rolled.placement!.placement,
  });
  const id = state(store).turn!.entryId!;
  await run(store, { type: 'CommitTurn' });
  return id;
}

describe('EntryDialog', () => {
  it('shows facts, lock and context for a committed Event', async () => {
    const store = await makeStore();
    const id = await committedEvent(store);
    renderWith(store, <Entry id={id} />);
    const facts = screen.getByLabelText('Facts');
    expect(within(facts).getByRole('img', { name: 'Locked' })).toBeInTheDocument();
    expect(facts).toHaveTextContent('Round 1 · You · Focus: Tolls');
  });

  it('saves a revision and recovers the play-time draft', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await committedEvent(store);
    renderWith(store, <Entry id={id} />);
    expect(screen.getByRole('button', { name: 'Save revision' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Prose (revisable)'));
    await user.type(screen.getByLabelText('Prose (revisable)'), 'Second draft.');
    await user.click(screen.getByRole('button', { name: 'Save revision' }));
    await waitFor(() => expect(state(store).entries[id]!.prose).toBe('Second draft.'));
    expect(state(store).entries[id]!.title).toBe('Tolls begin');
    await user.click(screen.getByText(/Revisions \(2\)/));
    await user.click(screen.getByRole('button', { name: /Play-time draft/ }));
    await user.click(screen.getByRole('button', { name: 'Load into editor' }));
    expect(screen.getByLabelText('Prose (revisable)')).toHaveValue('First draft.');
  });

  it('retcons a fact only with a reason', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await committedEvent(store);
    renderWith(store, <Entry id={id} />);
    await user.click(screen.getByRole('button', { name: 'Retcon a fact…' }));
    const form = screen.getByRole('form', { name: 'Retcon' });
    expect(within(form).getByLabelText('New value')).toHaveValue('Tolls begin');
    await user.selectOptions(within(form).getByLabelText('Field'), 'tone');
    const tone = state(store).entries[id]!.tone;
    await user.selectOptions(
      within(form).getByLabelText('New value'),
      tone === 'light' ? 'dark' : 'light',
    );
    expect(within(form).getByRole('button', { name: 'Retcon' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Reason (required)'), 'Darker than remembered');
    await user.click(within(form).getByRole('button', { name: 'Retcon' }));
    await waitFor(() => expect(state(store).stats.retcons).toBe(1));
    expect(state(store).entries[id]!.tone).not.toBe(tone);
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Retcon' })).not.toBeInTheDocument(),
    );
  });

  it('shows Chronicle Anchor, Change and the Subject then', async () => {
    const store = await makeStore();
    await gameInPlay(store, { ruleset: 'chronicle' });
    const p = Object.values(state(store).entries).find((e) => e.title === 'Wreck years')!;
    renderWith(store, <Entry id={p.id} />);
    const facts = screen.getByLabelText('Facts');
    expect(facts).toHaveTextContent('Anchor: Ada · Change: + haunted');
    expect(facts).toHaveTextContent('Subject then: tall, lonely, bright, haunted');
  });

  it('links a Scene to the editor; an open entry has no retcon', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'StartTurn' });
    await run(store, { type: 'RollPlacement', kind: 'scene' });
    await run(store, {
      type: 'CreateEntry',
      kind: 'scene',
      title: 'Toll',
      placement: state(store).turn!.rolled.placement!.placement,
      scene: { question: 'Who pays?', form: 'played' },
    });
    const id = state(store).turn!.entryId!;
    renderWith(store, <Entry id={id} />);
    expect(screen.getByText('Who pays?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retcon a fact…' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Scene editor' }));
    expect(window.location.hash).toContain(`/scene/${id}`);
  });
});

function Oracle({ onClose = vi.fn() }: { onClose?: () => void }) {
  const cur = useApp((s) => s.current!);
  return <OracleDialog g={cur.state} events={cur.events} onClose={onClose} />;
}

describe('OracleDialog', () => {
  it('asks outside a Scene and lists recent answers', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    renderWith(store, <Oracle />);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await user.type(screen.getByLabelText('Yes/no question'), 'Is the river rising?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const list = await screen.findByRole('list', { name: 'Recent oracle answers' });
    expect(list).toHaveTextContent('Is the river rising?');
    expect(list).toHaveTextContent(/Yes|No/);
    await waitFor(() => expect(screen.getByLabelText('Yes/no question')).toHaveValue(''));
  });

  it('attaches to the open Scene and shows Chaos-adjusted odds', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls', settings: (s) => ({ ...s, chaos: true }) });
    await run(store, { type: 'ChangeSettings', settings: state(store).settings });
    await run(store, { type: 'StartTurn' });
    await run(store, { type: 'RollPlacement', kind: 'scene' });
    await run(store, {
      type: 'CreateEntry',
      kind: 'scene',
      title: 'Toll',
      placement: state(store).turn!.rolled.placement!.placement,
      scene: { question: 'Who pays?', form: 'played' },
    });
    renderWith(store, <Oracle />);
    expect(screen.getByText(/Chaos 5 → 5/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Yes/no question'), 'Does Ada pay?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const answers = await screen.findByRole('list', { name: 'Oracle answers' });
    expect(answers).toHaveTextContent('Does Ada pay?');
    const scene = state(store).entries[state(store).turn!.entryId!]!;
    expect(scene.kind === 'scene' && scene.oracleCalls).toHaveLength(1);
  });
});
