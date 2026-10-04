import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../../store';
import { gameInPlay, makeStore, renderWith, run, withModes } from '../../../tests/support/ui';
import { useApp } from '../StoreContext';
import { TurnPanel } from './TurnPanel';

function Panel({ onOracle = vi.fn() }: { onOracle?: () => void }) {
  const cur = useApp((s) => s.current!);
  return <TurnPanel g={cur.state} events={cur.events} onOracle={onOracle} />;
}

const state = (store: AppStore) => store.getState().current!.state;
const types = (store: AppStore) => store.getState().current!.events.map((e) => e.type);

async function eventTurn(store: AppStore, title = 'An event') {
  await run(store, { type: 'StartTurn' });
  await run(store, { type: 'RollPlacement', kind: 'event' });
  await run(store, {
    type: 'CreateEntry',
    kind: 'event',
    title,
    placement: state(store).turn!.rolled.placement!.placement,
  });
  await run(store, { type: 'CommitTurn' });
}

describe('TurnPanel: round start and Focus', () => {
  it('starts a round between rounds', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { start: false });
    renderWith(store, <Panel />);
    expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Round steps' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start round 1' }));
    expect(state(store).rounds).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Round steps' })).toBeInTheDocument();
  });

  it('player writes the Focus when focus.source is off', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store);
    renderWith(store, <Panel />);
    const steps = within(screen.getByRole('list', { name: 'Round steps' })).getAllByRole(
      'listitem',
    );
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('you choose')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Focus' })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Focus/), 'Who controls the crossings');
    await user.click(screen.getByRole('button', { name: 'Set Focus' }));
    expect(state(store).rounds[0]!.focus).toBe('Who controls the crossings');
    expect(screen.getByText('Who controls the crossings')).toBeInTheDocument();
  });

  it('prompt Focus: roll, then accept', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { settings: withModes({ 'focus.source': 'prompt' }) });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: 'Roll the Focus' }));
    const rolled = state(store).pendingRoundRolls.focus!.text;
    expect(screen.getAllByText(rolled).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Accept Focus' }));
    expect(state(store).rounds[0]!.focus).toBe(rolled);
    expect(state(store).stats.overrides).toBe(0);
  });

  it('prompt Focus: writing your own is an override', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { settings: withModes({ 'focus.source': 'prompt' }) });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: 'Roll the Focus' }));
    await user.type(screen.getByLabelText(/Or write your own/), 'Mine');
    await user.click(screen.getByRole('button', { name: 'Set Focus' }));
    expect(state(store).rounds[0]!.focus).toBe('Mine');
    expect(state(store).stats.overrides).toBe(1);
  });

  it('Chronicle offers the Subject and traits as Focus shortcuts', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { ruleset: 'chronicle' });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: 'haunted' }));
    expect(screen.getByLabelText(/^Focus/)).toHaveValue('haunted');
  });
});

describe('TurnPanel: writing an entry', () => {
  it('rolls placement, shows tone and rolls, writes and commits an Event', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: /Start turn \(You\)/ }));
    const tone = state(store).turn!.rolled.tone!;
    expect(
      screen.getByRole('img', { name: tone === 'light' ? 'Light' : 'Dark' }),
    ).toBeInTheDocument();
    expect(screen.getByText('enforced')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Entry type'), 'event');
    await user.click(screen.getByRole('button', { name: 'Roll placement' }));
    expect(screen.getByLabelText('Entry type')).toBeDisabled();
    const rolls = within(screen.getByRole('list', { name: 'This turn’s rolls' }));
    expect(rolls.getByText(/Tone:/)).toBeInTheDocument();
    expect(rolls.getByText(/Placement:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write event' })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Title/), 'Tolls begin');
    await user.type(screen.getByLabelText('Description'), 'Coins change hands.');
    await user.click(screen.getByRole('button', { name: 'Write event' }));
    const entry = state(store).entries[state(store).turn!.entryId!]!;
    expect(entry).toMatchObject({
      title: 'Tolls begin',
      prose: 'Coins change hands.',
      tone,
      focus: 'Tolls',
    });

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Revised before commit.');
    await user.click(screen.getByRole('button', { name: 'Commit turn' }));
    await waitFor(() => expect(state(store).entries[entry.id]!.locked).toBe(true));
    expect(state(store).entries[entry.id]!.prose).toBe('Revised before commit.');
  });

  it('saves the description on blur while the turn is open', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'StartTurn' });
    await run(store, { type: 'RollPlacement', kind: 'event' });
    await run(store, {
      type: 'CreateEntry',
      kind: 'event',
      title: 'x',
      placement: state(store).turn!.rolled.placement!.placement,
    });
    renderWith(store, <Panel />);
    await user.type(screen.getByLabelText('Description'), 'Draft');
    await user.tab();
    await waitFor(() => expect(types(store).at(-1)).toBe('EntryProseEdited'));
  });

  it('prompt placement: choosing another slot is logged', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: /Start turn/ }));
    await user.selectOptions(screen.getByLabelText('Entry type'), 'event');
    await user.click(screen.getByRole('button', { name: 'Roll placement' }));
    const select = screen.getByLabelText('Placement') as HTMLSelectElement;
    expect(select.selectedOptions[0]!.textContent).toMatch(/\(rolled\)$/);
    const other = Array.from(select.options).find(
      (o) => !o.textContent!.endsWith('(rolled)') && o.value,
    )!;
    await user.selectOptions(select, other.value);
    await user.type(screen.getByLabelText(/^Title/), 'Elsewhere');
    await user.click(screen.getByRole('button', { name: 'Write event' }));
    expect(state(store).stats.overrides).toBe(1);
  });

  it('tone and placement off: player chooses both', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, {
      focus: 'Tolls',
      settings: withModes({ tone: 'off', placement: 'off' }),
    });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: /Start turn/ }));
    expect(screen.getAllByText('you choose').length).toBeGreaterThanOrEqual(2);
    await user.selectOptions(screen.getByLabelText('Entry type'), 'period');
    await user.selectOptions(
      screen.getByLabelText('Placement'),
      screen
        .getAllByRole('option')
        .find((o) => o.textContent!.startsWith('between'))!
        .getAttribute('value')!,
    );
    await user.type(screen.getByLabelText(/^Title/), 'A quiet age');
    expect(screen.getByRole('button', { name: 'Write period' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Tone'), 'dark');
    await user.click(screen.getByRole('button', { name: 'Write period' }));
    expect(
      Object.values(state(store).entries).find((e) => e.title === 'A quiet age'),
    ).toMatchObject({ kind: 'period', tone: 'dark' });
  });

  it('entry type enforced: select disabled and set to the roll', async () => {
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls', settings: withModes({ entryType: 'enforce' }) });
    await run(store, { type: 'StartTurn' });
    renderWith(store, <Panel />);
    expect(screen.getByLabelText('Entry type')).toBeDisabled();
    expect(screen.getByLabelText('Entry type')).toHaveValue(state(store).turn!.rolled.entryType);
  });

  it('frames a Scene with characters and budget, then opens the editor', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'CreateCharacter', name: 'Ada', description: '' });
    await run(store, { type: 'CreateCharacter', name: 'Bo', description: '' });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: /Start turn/ }));
    await user.selectOptions(screen.getByLabelText('Entry type'), 'scene');
    await user.click(screen.getByRole('button', { name: 'Roll placement' }));
    await user.type(screen.getByLabelText(/^Title/), 'The toll');
    expect(screen.getByRole('button', { name: 'Frame Scene' })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Question/), 'Who pays?');
    await user.type(screen.getByLabelText('Setting (optional)'), 'The bridge');
    await user.click(screen.getByLabelText('Dictated'));
    const [ada, bo] = Object.keys(state(store).characters);
    await user.selectOptions(screen.getByLabelText('Required characters (up to 2)'), [ada!]);
    await user.selectOptions(screen.getByLabelText('Banned character'), bo!);
    await user.clear(screen.getByLabelText('Minimum words'));
    await user.type(screen.getByLabelText('Minimum words'), '10');
    await user.clear(screen.getByLabelText('Maximum words'));
    await user.type(screen.getByLabelText('Maximum words'), '50');
    await user.click(screen.getByRole('button', { name: 'Frame Scene' }));
    const scene = state(store).entries[state(store).turn!.entryId!]!;
    expect(scene).toMatchObject({
      kind: 'scene',
      question: 'Who pays?',
      setting: 'The bridge',
      form: 'dictated',
      requiredCharacterIds: [ada],
      bannedCharacterIds: [bo],
      budget: { min: 10, max: 50 },
    });
    expect(screen.getByText(/resolving it commits the turn/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Scene editor' }));
    expect(window.location.hash).toBe(`#/game/${state(store).id}/scene/${scene.id}`);
  });

  it('Chronicle Period: new Anchor and an added trait', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, {
      ruleset: 'chronicle',
      focus: 'Light',
      settings: withModes({ placement: 'off' }),
    });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: /Start turn/ }));
    await user.selectOptions(screen.getByLabelText('Entry type'), 'period');
    await user.selectOptions(
      screen.getByLabelText('Placement'),
      screen
        .getAllByRole('option')
        .find((o) => o.textContent!.startsWith('between'))!
        .getAttribute('value')!,
    );
    await user.type(screen.getByLabelText(/^Title/), 'Storm years');
    await user.type(screen.getByLabelText('Anchor name'), 'Inspector');
    await user.click(screen.getByLabelText('immortal'));
    await user.type(screen.getByLabelText('New trait'), 'automatic');
    await user.click(screen.getByRole('button', { name: 'Write period' }));
    const p = Object.values(state(store).entries).find((e) => e.title === 'Storm years');
    expect(p).toMatchObject({ change: { op: 'add', trait: 'automatic' } });
    expect(
      Object.values(state(store).characters).find((c) => c.name === 'Inspector')!.immortal,
    ).toBe(true);
  });

  it.each([
    ['remove', { op: 'remove', trait: 'lonely' }],
    ['modify', { op: 'modify', from: 'bright', to: 'dim' }],
  ] as const)('Chronicle Period: existing Anchor and a %s Change', async (op, change) => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, {
      ruleset: 'chronicle',
      focus: 'Light',
      settings: withModes({ placement: 'off' }),
    });
    await run(store, {
      type: 'CreateCharacter',
      name: 'The Light',
      description: '',
      immortal: true,
    });
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: /Start turn/ }));
    await user.selectOptions(screen.getByLabelText('Entry type'), 'period');
    await user.selectOptions(
      screen.getByLabelText('Placement'),
      screen
        .getAllByRole('option')
        .find((o) => o.textContent!.startsWith('between'))!
        .getAttribute('value')!,
    );
    await user.type(screen.getByLabelText(/^Title/), 'Later');
    const light = Object.values(state(store).characters).find((c) => c.name === 'The Light')!;
    await user.selectOptions(screen.getByLabelText('Anchor'), light.id);
    expect(screen.queryByLabelText('Anchor name')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Change to the subject'), op);
    if (op === 'remove')
      await user.selectOptions(screen.getByLabelText('Trait to remove'), 'lonely');
    else {
      await user.selectOptions(screen.getByLabelText('Trait to modify'), 'bright');
      await user.type(screen.getByLabelText('Modified trait'), 'dim');
    }
    await user.click(screen.getByRole('button', { name: 'Write period' }));
    expect(Object.values(state(store).entries).find((e) => e.title === 'Later')).toMatchObject({
      anchorId: light.id,
      change,
    });
  });

  it('undo reverts the entry but not the roll', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'StartTurn' });
    renderWith(store, <Panel />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await act(() => run(store, { type: 'RollPlacement', kind: 'event' }));
    await act(() =>
      run(store, {
        type: 'CreateEntry',
        kind: 'event',
        title: 'x',
        placement: state(store).turn!.rolled.placement!.placement,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(state(store).turn!.entryId).toBeUndefined());
    expect(state(store).turn!.rolled.placement).toBeDefined();
  });
});

describe('TurnPanel: cohesion, Legacies, dials', () => {
  it('enforced cohesion offers only the rolled outcome', async () => {
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await eventTurn(store);
    renderWith(store, <Panel />);
    const passed = state(store).pendingRoundRolls.cohesion;
    expect(
      screen.getByText(passed ? 'passed: another turn' : 'failed: on to Legacies'),
    ).toBeInTheDocument();
    expect(!!screen.queryByRole('button', { name: /Take another turn/ })).toBe(!!passed);
    expect(!!screen.queryByLabelText(/^Add a Legacy/)).toBe(!passed);
  });

  it('prompt cohesion offers both, labelling the override', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls', settings: withModes({ cohesion: 'prompt' }) });
    await eventTurn(store);
    renderWith(store, <Panel />);
    const passed = state(store).pendingRoundRolls.cohesion;
    expect(screen.getByRole('button', { name: /Take another turn/ })).toBeInTheDocument();
    if (passed) {
      await user.type(screen.getByLabelText(/^Add a Legacy/), 'The toll-house');
      await user.click(screen.getByRole('button', { name: 'Add Legacy (override)' }));
    } else {
      await user.click(
        screen.getByRole('button', { name: /Take another turn \(The Reader\) \(override\)/ }),
      );
    }
    expect(state(store).stats.overrides).toBe(1);
  });

  it('cohesion off: player takes another turn', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls', settings: withModes({ cohesion: 'off' }) });
    await eventTurn(store);
    renderWith(store, <Panel />);
    expect(screen.getByText('is your call', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Take another turn/ }));
    expect(state(store).turn?.seatId).toBe(state(store).seats[1]!.id);
  });

  it('at the cap only a Legacy can be added', async () => {
    const store = await makeStore();
    await gameInPlay(store, {
      focus: 'Tolls',
      settings: withModes({ cohesion: 'off' }, { cohesionCap: 1 }),
    });
    await eventTurn(store);
    renderWith(store, <Panel />);
    expect(screen.getByText(/turn cap \(1\) is reached/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take another turn/ })).not.toBeInTheDocument();
  });

  async function roundsWithLegacies(store: AppStore, n: number) {
    for (let i = 1; i <= n; i++) {
      await eventTurn(store);
      await run(store, { type: 'AddLegacy', text: `L${i}` });
      await run(store, { type: 'ExploreLegacy', legacyId: state(store).legacies[0]!.id });
      await run(store, { type: 'RollPlacement', kind: 'event' });
      await run(store, {
        type: 'CreateEntry',
        kind: 'event',
        title: 'x',
        placement: state(store).turn!.rolled.placement!.placement,
      });
      await run(store, { type: 'CommitTurn' });
      await run(store, { type: 'EndRound', mood: 0, cohesion: 0 });
      await run(store, { type: 'StartRound' });
      if (!state(store).rounds.at(-1)!.focus) await run(store, { type: 'SetFocus', text: 'f' });
    }
    await eventTurn(store);
  }

  it('evicting when six Legacies exist: player chooses (off)', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, {
      focus: 'Tolls',
      settings: withModes({ cohesion: 'off', 'legacy.explore': 'off' }, { drift: 'preference' }),
    });
    await roundsWithLegacies(store, 6);
    renderWith(store, <Panel />);
    expect(screen.getByText(/Six Legacies already/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Add a Legacy/), 'L7');
    expect(screen.getByRole('button', { name: 'Add Legacy' })).toBeDisabled();
    const evict = state(store).legacies[2]!;
    await user.selectOptions(screen.getByLabelText('Legacy to remove'), evict.id);
    await user.click(screen.getByRole('button', { name: 'Add Legacy' }));
    await waitFor(() => expect(state(store).legacies.some((l) => l.id === evict.id)).toBe(false));
  });

  it('evicting by roll (enforce): roll first, then the choice is locked', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, {
      focus: 'Tolls',
      settings: withModes(
        { cohesion: 'off', 'legacy.explore': 'off', 'legacy.evict': 'enforce' },
        { drift: 'preference' },
      ),
    });
    await roundsWithLegacies(store, 6);
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: 'Roll which Legacy leaves' }));
    expect(screen.getByLabelText('Legacy to remove')).toBeDisabled();
    const rolled = state(store).pendingRoundRolls.evict!;
    await user.type(screen.getByLabelText(/^Add a Legacy/), 'L7');
    await user.click(screen.getByRole('button', { name: 'Add Legacy' }));
    await waitFor(() => expect(state(store).legacies.some((l) => l.id === rolled)).toBe(false));
  });

  it('explores a Legacy by roll and by choice', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls', settings: withModes({ cohesion: 'off' }) });
    await eventTurn(store);
    await run(store, { type: 'AddLegacy', text: 'Toll-house' });
    renderWith(store, <Panel />);
    expect(screen.getByText(/The Reader/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Roll a Legacy' }));
    expect(
      (screen.getByLabelText('Legacy to explore') as HTMLSelectElement).selectedOptions[0],
    ).toHaveTextContent('Toll-house (rolled)');
    await user.click(screen.getByRole('button', { name: 'Explore' }));
    expect(state(store).turn).toMatchObject({ kind: 'legacy' });
    expect(screen.getByText(/exploring “Toll-house”/)).toBeInTheDocument();
    const kinds = Array.from(
      (screen.getByLabelText('Entry type') as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(kinds).not.toContain('period');
  });

  it('explore off: choose from the list', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, {
      focus: 'Tolls',
      settings: withModes({ cohesion: 'off', 'legacy.explore': 'off' }),
    });
    await eventTurn(store);
    await run(store, { type: 'AddLegacy', text: 'Toll-house' });
    renderWith(store, <Panel />);
    expect(screen.getByRole('button', { name: 'Explore' })).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('Legacy to explore'),
      state(store).legacies[0]!.id,
    );
    await user.click(screen.getByRole('button', { name: 'Explore' }));
    expect(state(store).turn?.kind).toBe('legacy');
  });

  async function toDials(store: AppStore) {
    await eventTurn(store);
    await run(store, { type: 'AddLegacy', text: 'Toll-house' });
    await run(store, { type: 'RollExplore' });
    await run(store, { type: 'ExploreLegacy' });
    await run(store, { type: 'RollPlacement', kind: 'event' });
    await run(store, {
      type: 'CreateEntry',
      kind: 'event',
      title: 'x',
      placement: state(store).turn!.rolled.placement!.placement,
    });
    await run(store, { type: 'CommitTurn' });
  }

  it('preference drift: player moves the dials', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, {
      focus: 'Tolls',
      settings: withModes({ cohesion: 'off' }, { drift: 'preference' }),
    });
    await toDials(store);
    renderWith(store, <Panel />);
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0]!, '1');
    await user.selectOptions(selects[1]!, '-1');
    await user.click(screen.getByRole('button', { name: 'Adjust dials and end round' }));
    expect(state(store).dials).toMatchObject({ mood: 6, cohesion: 4 });
    expect(screen.getByRole('button', { name: 'Start round 2' })).toBeInTheDocument();
  });

  it('counter-trend drift explains itself and rolls', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls', settings: withModes({ cohesion: 'off' }) });
    await toDials(store);
    renderWith(store, <Panel />);
    expect(screen.getByText(/toward the tone that appeared less/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'This round’s rolls' })).getAllByText(
        /Cohesion|Explore|Focus/,
      ).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Adjust dials and end round' }));
    expect(types(store).slice(-2)).toEqual(['DialsAdjusted', 'RoundEnded']);
  });
});

describe('TurnPanel: prompts', () => {
  it('draws each prompt and opens the oracle', async () => {
    const user = userEvent.setup();
    const onOracle = vi.fn();
    const store = await makeStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'StartTurn' });
    renderWith(store, <Panel onOracle={onOracle} />);
    for (const name of ['Domain', 'Word pair', 'Card', 'Character'])
      await user.click(screen.getByRole('button', { name }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Prompts drawn' })).getAllByRole('listitem'),
      ).toHaveLength(4),
    );
    await user.click(screen.getByRole('button', { name: 'Oracle' }));
    expect(onOracle).toHaveBeenCalled();
  });
});
