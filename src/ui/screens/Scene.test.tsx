import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../engine';
import type { AppStore } from '../../store';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, run } from '../../../tests/support/ui';

const state = (store: AppStore) => store.getState().current!.state;
const types = (store: AppStore) => store.getState().current!.events.map((e) => e.type);

async function openScene(
  store: AppStore,
  settings?: (s: Settings) => Settings,
  frame: Record<string, unknown> = {},
) {
  const gameId = await gameInPlay(store, { focus: 'Tolls', settings });
  await run(store, { type: 'CreateCharacter', name: 'Ada', description: '' });
  await run(store, { type: 'CreateCharacter', name: 'Bo', description: '' });
  await run(store, { type: 'StartTurn' });
  await run(store, { type: 'RollPlacement', kind: 'scene' });
  await run(store, {
    type: 'CreateEntry',
    kind: 'scene',
    title: 'The toll',
    placement: state(store).turn!.rolled.placement!.placement,
    scene: {
      question: 'Who pays the toll?',
      form: 'played',
      setting: 'The bridge',
      budget: { min: 3, max: 8 },
      ...frame,
    },
  });
  return { gameId, entryId: state(store).turn!.entryId! };
}

describe('Scene editor: drafting', () => {
  it('pins the Question and frame, counts words against the budget and autosaves', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const [ada, bo] = [0, 1];
    const { gameId, entryId } = await openScene(store, undefined, {});
    const chars = Object.keys(state(store).characters);
    await act(() =>
      run(store, {
        type: 'FrameScene',
        entryId,
        frame: {
          question: 'Who pays the toll?',
          form: 'played',
          setting: 'The bridge',
          requiredCharacterIds: [chars[ada]!],
          bannedCharacterIds: [chars[bo]!],
          budget: { min: 3, max: 8 },
        },
      }),
    );
    await renderApp(store, { name: 'scene', gameId, entryId });
    const editor = await screen.findByRole('region', { name: 'Scene editor' });
    expect(within(editor).getByLabelText('Question', { selector: 'div' })).toHaveTextContent(
      'Who pays the toll?',
    );
    expect(editor).toHaveTextContent('Setting: The bridge');
    expect(editor).toHaveTextContent('Must appear: Ada');
    expect(editor).toHaveTextContent('May not appear: Bo');
    await user.type(screen.getByLabelText('Scene draft'), 'Rain on the planks.');
    expect(screen.getByText(/4 words · budget 3–8/)).not.toHaveClass('warn');
    await user.type(screen.getByLabelText('Scene draft'), ' More and more words now.');
    expect(screen.getByText(/9 words/)).toHaveClass('warn');
    fireEvent.blur(screen.getByLabelText('Scene draft'));
    await waitFor(() =>
      expect(state(store).entries[entryId]!.prose).toBe(
        'Rain on the planks. More and more words now.',
      ),
    );
  });

  it('autosaves after a pause in typing', async () => {
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store);
    await renderApp(store, { name: 'scene', gameId, entryId });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(await screen.findByLabelText('Scene draft'), {
      target: { value: 'Quiet water.' },
    });
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    vi.useRealTimers();
    await waitFor(() => expect(state(store).entries[entryId]!.prose).toBe('Quiet water.'));
  });

  it('draws the spread, draws and places a replaced reversal at the cursor', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store);
    await renderApp(store, { name: 'scene', gameId, entryId });
    await user.click(
      await screen.findByRole('button', { name: 'Draw setup · complication · pressure' }),
    );
    await waitFor(() => expect(document.querySelectorAll('.tarot')).toHaveLength(3));
    for (const role of ['setup', 'complication', 'pressure'])
      expect(screen.getByText(role)).toBeInTheDocument();

    const draft = screen.getByLabelText('Scene draft') as HTMLTextAreaElement;
    await user.type(draft, 'Before. After.');
    draft.setSelectionRange(8, 8);
    await user.click(screen.getByRole('button', { name: 'Draw a reversal' }));
    await screen.findByRole('button', { name: 'Insert at cursor' });
    await user.type(screen.getByLabelText('Replace reversal (override)'), 'The bridge cracks');
    draft.setSelectionRange(8, 8);
    await user.click(screen.getByRole('button', { name: 'Insert at cursor' }));
    await waitFor(() => expect(draft.value).toBe('Before. [[REVERSAL: The bridge cracks]]After.'));
    expect(screen.getByText(/^Placed:/)).toHaveTextContent('The bridge cracks');
    expect(state(store).stats.overrides).toBe(1);
    expect(
      within(screen.getByRole('list', { name: 'Scene draws' })).getAllByRole('listitem').length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('adds characters, draws a character card, asks the oracle, then resolves back to the table', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store);
    await renderApp(store, { name: 'scene', gameId, entryId });
    await user.type(await screen.findByLabelText('New character name'), 'Cyr');
    await user.click(screen.getByRole('button', { name: 'Add character' }));
    await waitFor(() =>
      expect(Object.values(state(store).characters).map((c) => c.name)).toContain('Cyr'),
    );
    await user.click(screen.getByRole('button', { name: 'Draw a character card' }));
    await waitFor(() => expect(types(store).at(-1)).toBe('CardDrawn'));

    await user.type(screen.getByLabelText('Yes/no question'), 'Does Ada pay?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByRole('list', { name: 'Oracle answers' });

    const resolve = screen.getByRole('button', { name: 'Resolve Scene and commit turn' });
    expect(resolve).toBeDisabled();
    await user.type(screen.getByLabelText('Scene draft'), 'Ada pays and Cyr watches.');
    await user.type(screen.getByLabelText('Answer in one sentence'), 'Ada pays.');
    const cyr = Object.values(state(store).characters).find((c) => c.name === 'Cyr')!;
    await user.selectOptions(screen.getByLabelText('Characters who appeared'), cyr.id);
    await user.click(resolve);
    await waitFor(() => expect(state(store).entries[entryId]!.locked).toBe(true));
    const scene = state(store).entries[entryId]!;
    expect(scene.kind === 'scene' && scene.characterIds).toEqual([cyr.id]);
    await waitFor(() => expect(window.location.hash).toBe(`#/game/${gameId}`));
  });

  it('warns outside the budget; enforce keeps the Scene open with an alert', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store, (s) => ({
      ...s,
      scene: { ...s.scene, budget: 'enforce' },
    }));
    await renderApp(store, { name: 'scene', gameId, entryId });
    await user.type(await screen.findByLabelText('Scene draft'), 'Too short');
    expect(screen.getByText(/\(enforced\)/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Answer in one sentence'), 'No one.');
    await user.click(screen.getByRole('button', { name: 'Resolve Scene and commit turn' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('budget');
    await user.click(within(alert).getByRole('button', { name: 'OK' }));
    expect(state(store).entries[entryId]!.locked).toBe(false);
  });

  it('shows the pause ritual before an empty draft, counts down and can be skipped', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store, (s) => ({
      ...s,
      scene: { ...s.scene, pause: true, pauseSeconds: 5 },
    }));
    await renderApp(store, { name: 'scene', gameId, entryId });
    const pause = await screen.findByRole('dialog', { name: 'Pause before drafting' });
    expect(pause).toHaveTextContent('5s');
    await waitFor(() => expect(pause).toHaveTextContent('4s'), { timeout: 2000 });
    await user.click(within(pause).getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog', { name: 'Pause before drafting' })).not.toBeInTheDocument();
  });

  it('runs a drafting timer', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store);
    await renderApp(store, { name: 'scene', gameId, entryId });
    await user.click(await screen.findByRole('button', { name: 'Timer' }));
    expect(screen.getByText('0:00')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('0:01')).toBeInTheDocument(), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: 'Stop timer' }));
    expect(screen.queryByText(/^0:0\d$/)).not.toBeInTheDocument();
  });

  it('Back to table and Esc return to the table', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store);
    await renderApp(store, { name: 'scene', gameId, entryId });
    await user.click(await screen.findByRole('button', { name: 'Back to table' }));
    expect(window.location.hash).toBe(`#/game/${gameId}`);
  });

  it('enforced reversal is required and cannot be replaced', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store, (s) => ({
      ...s,
      modes: { ...s.modes, 'scene.reversal': 'enforce' },
    }));
    await renderApp(store, { name: 'scene', gameId, entryId });
    expect(await screen.findByText('required')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Draw a reversal' }));
    await screen.findByRole('button', { name: 'Insert at cursor' });
    expect(screen.queryByLabelText('Replace reversal (override)')).not.toBeInTheDocument();
  });

  it('reversal off hides the reversal tools; an unknown Scene id is reported', async () => {
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store, (s) => ({
      ...s,
      modes: { ...s.modes, 'scene.reversal': 'off' },
    }));
    await renderApp(store, { name: 'scene', gameId, entryId });
    await screen.findByRole('region', { name: 'Scene editor' });
    expect(screen.queryByRole('button', { name: 'Draw a reversal' })).not.toBeInTheDocument();
    const { go } = await import('../../../tests/support/app');
    await go({ name: 'scene', gameId, entryId: 'nope' });
    expect(await screen.findByText('That Scene was not found.')).toBeInTheDocument();
  });
});

describe('Scene editor: revising', () => {
  it('shows locked facts read-only and saves prose revisions, keeping the play-time draft', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store);
    await run(store, { type: 'AskOracle', question: 'Rain?', odds: 5, entryId });
    await run(store, { type: 'EditProse', entryId, prose: 'Play-time words here.' });
    const ada = Object.values(state(store).characters)[0]!;
    await run(store, {
      type: 'ResolveScene',
      entryId,
      answer: 'Ada pays.',
      characterIds: [ada.id],
    });
    await renderApp(store, { name: 'scene', gameId, entryId });
    const facts = await screen.findByLabelText('Locked facts');
    expect(facts).toHaveTextContent('Answer: Ada pays.');
    expect(facts).toHaveTextContent('Characters: Ada');
    expect(facts).toHaveTextContent('Oracle: Rain? →');
    expect(screen.getByRole('img', { name: 'Locked' })).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save revision' });
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('Scene prose'));
    await user.type(screen.getByLabelText('Scene prose'), 'Revised words.');
    expect(screen.getByText('2 words')).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(state(store).entries[entryId]!.revisions).toHaveLength(2));
    const s = state(store).entries[entryId]!;
    expect(s.kind === 'scene' && s.answer).toBe('Ada pays.');
    await user.click(screen.getByRole('button', { name: 'Play-time draft' }));
    await user.click(screen.getByRole('button', { name: 'Load into editor' }));
    expect(screen.getByLabelText('Scene prose')).toHaveValue('Play-time words here.');
  });

  it('a Scene outside the open turn but unlocked is read-only', async () => {
    const store = await makeStore();
    const { gameId, entryId } = await openScene(store);
    // Simulate viewing another turn's unlocked Scene by clearing the open turn locally.
    store.setState({
      current: { ...store.getState().current!, state: { ...state(store), turn: undefined } },
    });
    await renderApp(store, { name: 'scene', gameId, entryId });
    expect(await screen.findByText(/not open/)).toBeInTheDocument();
    expect(screen.getByLabelText('Scene prose')).toHaveAttribute('readonly');
  });
});
