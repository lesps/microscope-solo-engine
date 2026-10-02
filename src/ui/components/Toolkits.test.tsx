import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { linkedActiveTables, personPromptParts, type Settings } from '../../engine';
import type { AppStore } from '../../store';
import myth from '../../../toolkits/myth-and-iron.json';
import far from '../../../toolkits/far-horizons.json';
import home from '../../../toolkits/close-to-home.json';
import { renderApp } from '../../../tests/support/app';
import { gameInPlay, makeStore, renderWith, run, withModes } from '../../../tests/support/ui';
import { useApp } from '../StoreContext';
import { TurnPanel } from './TurnPanel';

function Panel() {
  const cur = useApp((s) => s.current!);
  return <TurnPanel g={cur.state} events={cur.events} onOracle={() => {}} />;
}

const state = (store: AppStore) => store.getState().current!.state;
const prompts = (store: AppStore) => state(store).turn!.prompts;

async function toolkitStore() {
  const store = await makeStore();
  for (const p of [myth, far, home]) {
    const r = await store.getState().importPack(p);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
  }
  return store;
}

const linkTo =
  (store: AppStore, group: string, also: (s: Settings) => Settings = (s) => s) =>
  (s: Settings): Settings =>
    also({
      ...s,
      activeTables: linkedActiveTables(store.getState().content, s.activeTables, [group]),
    });

describe('turn panel prompts', () => {
  it('hides Question and Person when no such table is active', async () => {
    const store = await toolkitStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await run(store, { type: 'StartTurn' });
    renderWith(store, <Panel />);
    const row = screen.getByRole('region', { name: 'Prompts' });
    expect(within(row).getByRole('button', { name: 'Domain' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Question' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Person' })).not.toBeInTheDocument();
  });

  it('draws a Question and a Person from a linked toolkit', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    await gameInPlay(store, { focus: 'Tolls', settings: linkTo(store, 'far-horizons') });
    await run(store, { type: 'StartTurn' });
    renderWith(store, <Panel />);
    const row = screen.getByRole('region', { name: 'Prompts' });
    await user.click(within(row).getByRole('button', { name: 'Question' }));
    await user.click(within(row).getByRole('button', { name: 'Person' }));
    await waitFor(() => expect(prompts(store).map((p) => p.kind)).toEqual(['question', 'person']));
    const list = within(row).getByRole('list', { name: 'Prompts drawn' });
    expect(list).toHaveTextContent(prompts(store)[0]!.text);
    expect(list).toHaveTextContent(prompts(store)[1]!.text);
    expect(prompts(store)[1]!.text).toMatch(/, who wants to /);
    const rolls = screen.getByRole('list', { name: 'This turn’s rolls' });
    for (const label of ['Question idea:', 'Person name:', 'Person role:', 'Person want:'])
      expect(rolls).toHaveTextContent(label);
  });
});

describe('Scene frame', () => {
  async function frame(user: ReturnType<typeof userEvent.setup>, store: AppStore) {
    renderWith(store, <Panel />);
    await user.click(screen.getByRole('button', { name: /Start turn/ }));
    await user.selectOptions(screen.getByLabelText('Entry type'), 'scene');
    await user.click(screen.getByRole('button', { name: 'Roll placement' }));
  }

  it('Question idea rolls a question; Use copies it into the Question field', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    await gameInPlay(store, { focus: 'Tolls', settings: linkTo(store, 'myth-and-iron') });
    await frame(user, store);
    await user.click(screen.getByRole('button', { name: 'Question idea' }));
    const text = await waitFor(() => {
      const p = prompts(store).find((x) => x.kind === 'question');
      expect(p).toBeDefined();
      return p!.text;
    });
    expect(text).toMatch(/\?$/);
    await user.type(screen.getByLabelText(/^Question/), 'mine');
    await user.click(screen.getByRole('button', { name: 'Use this question' }));
    expect(screen.getByLabelText(/^Question/)).toHaveValue(text);
  });

  it('Question idea is hidden when no question table is active', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    await gameInPlay(store, { focus: 'Tolls' });
    await frame(user, store);
    expect(screen.getByLabelText(/^Question/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Question idea' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Roll a person' })).not.toBeInTheDocument();
  });

  it('Roll a person fills a new character, which can then be required', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    await gameInPlay(store, { focus: 'Tolls', settings: linkTo(store, 'close-to-home') });
    await frame(user, store);
    await user.click(screen.getByRole('button', { name: 'Roll a person' }));
    const parts = await waitFor(() => {
      const p = prompts(store).find((x) => x.kind === 'person');
      expect(p).toBeDefined();
      return personPromptParts(store.getState().current!.events, p!.seq);
    });
    await user.click(screen.getByRole('button', { name: 'Use this person' }));
    expect(screen.getByLabelText('New character name')).toHaveValue(parts.name);
    expect(screen.getByLabelText('New character description')).toHaveValue(
      `${parts.role}, who wants ${parts.want}`,
    );
    await user.click(screen.getByRole('button', { name: 'Add character' }));
    await waitFor(() =>
      expect(Object.values(state(store).characters).map((c) => c.name)).toContain(parts.name),
    );
    const c = Object.values(state(store).characters).find((x) => x.name === parts.name)!;
    expect(c.description).toBe(`${parts.role}, who wants ${parts.want}`);
    await waitFor(() => expect(screen.getByLabelText('New character name')).toHaveValue(''));
    expect(
      within(screen.getByLabelText(/Required characters/)).getByRole('option', {
        name: parts.name,
      }),
    ).toBeInTheDocument();
  });
});

describe('Chronicle Anchor', () => {
  it('Roll a person fills the new Anchor’s name and description', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    await gameInPlay(store, {
      ruleset: 'chronicle',
      focus: 'Light',
      settings: linkTo(store, 'close-to-home', withModes({ placement: 'off' })),
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
    const anchor = screen.getByRole('group', { name: 'Anchor and Change' });
    await user.click(within(anchor).getByRole('button', { name: 'Roll a person' }));
    const parts = await waitFor(() => {
      const p = prompts(store).find((x) => x.kind === 'person');
      expect(p).toBeDefined();
      return personPromptParts(store.getState().current!.events, p!.seq);
    });
    await user.click(within(anchor).getByRole('button', { name: 'Use this person' }));
    expect(screen.getByLabelText('Anchor name')).toHaveValue(parts.name);
    expect(screen.getByLabelText('Anchor description')).toHaveValue(
      `${parts.role}, who wants ${parts.want}`,
    );
    await user.type(screen.getByLabelText('New trait'), 'crowded');
    await user.click(screen.getByRole('button', { name: 'Write period' }));
    await waitFor(() =>
      expect(
        Object.values(state(store).characters).find((c) => c.name === parts.name),
      ).toMatchObject({ description: `${parts.role}, who wants ${parts.want}` }),
    );
  });
});

describe('Scene editor characters', () => {
  it('Roll a person sits beside the deck button and fills the new character', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    const gameId = await gameInPlay(store, {
      focus: 'Tolls',
      settings: linkTo(store, 'far-horizons'),
    });
    await run(store, { type: 'StartTurn' });
    await run(store, { type: 'RollPlacement', kind: 'scene' });
    await run(store, {
      type: 'CreateEntry',
      kind: 'scene',
      title: 'The dock',
      placement: state(store).turn!.rolled.placement!.placement,
      scene: { question: 'Who leaves?', form: 'played', budget: { min: 1, max: 900 } },
    });
    await renderApp(store, { name: 'scene', gameId, entryId: state(store).turn!.entryId! });
    const tools = await screen.findByRole('complementary', { name: 'Scene tools' });
    expect(
      within(tools).getByRole('button', { name: 'Draw a character card' }),
    ).toBeInTheDocument();
    await user.click(within(tools).getByRole('button', { name: 'Roll a person' }));
    const parts = await waitFor(() => {
      const p = prompts(store).find((x) => x.kind === 'person');
      expect(p).toBeDefined();
      return personPromptParts(store.getState().current!.events, p!.seq);
    });
    await user.click(within(tools).getByRole('button', { name: 'Use this person' }));
    expect(within(tools).getByLabelText('New character name')).toHaveValue(parts.name);
    await user.click(within(tools).getByRole('button', { name: 'Add character' }));
    await waitFor(() =>
      expect(Object.values(state(store).characters).map((c) => c.name)).toContain(parts.name),
    );
    await user.type(within(tools).getByLabelText('New character name'), 'Zed{Enter}');
    await waitFor(() =>
      expect(Object.values(state(store).characters).map((c) => c.name)).toContain('Zed'),
    );
  });
});

describe('Start step: Toolkits checklist', () => {
  it('a blank start lists installed toolkits; ticking one links it like its seeds do', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    const id = await store.getState().createGame({ title: 'Home', ruleset: 'lens' });
    const before = state(store).settings.activeTables;
    expect(before.some((t) => t.startsWith('toolkit.'))).toBe(false);
    await renderApp(store, { name: 'setup', gameId: id });
    await user.click(await screen.findByRole('button', { name: /Start blank/ }));
    const list = screen.getByRole('region', { name: 'Toolkits' });
    for (const name of ['Myth and Iron', 'Far Horizons', 'Close to Home'])
      expect(within(list).getByRole('checkbox', { name: new RegExp(name) })).not.toBeChecked();
    expect(
      within(list)
        .getByText(/Close to Home/)
        .closest('label'),
    ).toHaveTextContent('9 tables');
    await user.click(within(list).getByRole('checkbox', { name: /Close to Home/ }));
    await user.click(within(list).getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(state(store).settings.activeTables).toEqual(
        linkedActiveTables(store.getState().content, before, ['close-to-home']),
      ),
    );
    const steps = screen.getByRole('list', { name: 'Setup steps' });
    await waitFor(() =>
      expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('2. Premise'),
    );
  });

  it('continuing with nothing ticked changes no settings', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    const id = await store.getState().createGame({ title: 'Home', ruleset: 'lens' });
    await renderApp(store, { name: 'setup', gameId: id });
    await user.click(await screen.findByRole('button', { name: /Start blank/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText(/^Big Picture/)).toBeInTheDocument();
    expect(store.getState().current!.events.map((e) => e.type)).not.toContain('SettingsChanged');
  });
});

describe('Game settings: active tables by toolkit', () => {
  it('groups tables under their tags, Untagged first, with a toggle per group', async () => {
    const user = userEvent.setup();
    const store = await toolkitStore();
    const id = await gameInPlay(store, { start: false });
    await renderApp(store, { name: 'game-settings', gameId: id });
    const section = await screen.findByRole('region', { name: 'Active tables' });
    const groups = within(section).getAllByRole('group');
    expect(groups.map((g) => g.querySelector('legend')!.textContent)).toEqual([
      'Untagged',
      'Close to Home',
      'Far Horizons',
      'Myth and Iron',
    ]);
    const farGroup = within(section).getByRole('group', { name: 'Far Horizons' });
    const all = within(farGroup).getByRole('checkbox', { name: 'All Far Horizons tables' });
    expect(all).not.toBeChecked();
    await user.click(all);
    expect(within(farGroup).getByRole('checkbox', { name: /Far Horizons: Names/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(state(store).settings.activeTables).toEqual(
        expect.arrayContaining(far.tables.filter((t) => t.tags).map((t) => t.id)),
      ),
    );
    await user.click(within(farGroup).getByRole('checkbox', { name: /Far Horizons: Names/ }));
    expect(all).not.toBeChecked();
  });
});

describe('Packs screen', () => {
  it('shows question and person counts, tags, and unmatched tags as warnings', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().importPack(far);
    await store.getState().importPack({
      schemaVersion: 3,
      id: 'stray',
      name: 'Stray',
      version: '1',
      tables: [
        {
          id: 'stray.q',
          name: 'Stray questions',
          category: 'question',
          tags: ['nowhere'],
          entries: [{ text: 'Why?' }],
        },
      ],
    });
    await renderApp(store, { name: 'packs' });
    const packs = await screen.findByRole('list', { name: 'Installed packs' });
    const farItem = within(packs).getByText('Far Horizons').closest('li')!;
    expect(farItem).toHaveTextContent('1 question table · 3 person tables');
    await user.click(within(farItem).getByText('Inspect'));
    expect(
      within(farItem)
        .getByText(/Far Horizons: Names/)
        .closest('summary'),
    ).toHaveTextContent('person · name · tags: far-horizons');
    const stray = within(packs).getByText('Stray').closest('li')!;
    expect(stray).toHaveTextContent('Warning: tag "nowhere" matches no installed group');
    expect(farItem).not.toHaveTextContent('Warning');
  });
});
