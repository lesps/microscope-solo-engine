import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Mode } from '../../engine';
import type { AppStore } from '../../store';
import { renderApp } from '../../../tests/support/app';
import { makeStore, run } from '../../../tests/support/ui';
import { bookendTitle } from './SetupScreen';

type User = ReturnType<typeof userEvent.setup>;
const state = (store: AppStore) => store.getState().current!.state;

async function newGame(store: AppStore, ruleset: 'lens' | 'chronicle' = 'lens', seedMode?: Mode) {
  const id = await store.getState().createGame({ title: 'Salt', ruleset });
  if (seedMode) {
    const s = state(store).settings;
    await run(store, {
      type: 'ChangeSettings',
      settings: { ...s, modes: { ...s.modes, 'seed.answers': seedMode } },
    });
  }
  await renderApp(store, { name: 'setup', gameId: id });
  return id;
}

async function openSaltRoad(user: User) {
  await user.click(await screen.findByRole('button', { name: /Start from a seed/ }));
  const cats = screen.getByRole('region', { name: 'Seed categories' });
  const frontiers = within(cats).getByRole('button', { name: /Frontiers/ });
  expect(frontiers).toHaveTextContent('1 seed');
  await user.click(frontiers);
  const seeds = screen.getByRole('region', { name: 'Seeds' });
  const salt = within(seeds).getByRole('button', { name: /The Salt Road/ });
  expect(salt).toHaveTextContent('An inland sea is drying up.');
  await user.click(salt);
  return screen.getByRole('region', { name: 'Seed: The Salt Road' });
}

const fieldset = (form: HTMLElement, legend: string) =>
  within(form).getByRole('group', { name: legend });

describe('Start step', () => {
  it('opens a Lens game on Start with three paths; Start blank goes to Premise', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await newGame(store);
    const steps = await screen.findByRole('list', { name: 'Setup steps' });
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('1. Start');
    expect(screen.getByRole('button', { name: /Roll a generator/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('2. Premise');
    expect(screen.getByLabelText(/^Big Picture/)).toHaveValue('');
    expect(screen.queryByLabelText('Startup')).not.toBeInTheDocument();
    expect(state(store).startup).toBeUndefined();
  });

  it('is skipped for Chronicle games while no Chronicle seed is installed', async () => {
    const store = await makeStore();
    await newGame(store, 'chronicle');
    const steps = await screen.findByRole('list', { name: 'Setup steps' });
    expect(within(steps).queryByRole('button', { name: /Start/ })).not.toBeInTheDocument();
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('1. Premise');
  });

  it('is skipped when the startup sample is disabled', async () => {
    const store = await makeStore();
    await store.getState().setPackEnabled('startup-sample', false);
    await newGame(store);
    const steps = await screen.findByRole('list', { name: 'Setup steps' });
    expect(within(steps).queryByRole('button', { name: /Start/ })).not.toBeInTheDocument();
  });
});

describe('seed path', () => {
  it('applies The Salt Road and prefills Premise, Bookends and Palette', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await newGame(store);
    const form = await openSaltRoad(user);
    expect(form).toHaveTextContent('From Startup sample');
    const apply = within(form).getByRole('button', { name: 'Apply seed' });
    expect(apply).toBeDisabled();

    await user.click(
      within(fieldset(form, 'Why is the sea drying up?')).getByLabelText(/dammed or diverted/),
    );
    await user.type(
      within(fieldset(form, 'Who lives on the two shores?')).getByLabelText(/Write your own/),
      'Two guilds of salt-cutters.',
    );
    const salt = fieldset(form, 'What does the salt mean to the people who cross it?');
    await user.click(within(salt).getByLabelText(/Wealth/));
    await user.click(within(salt).getByLabelText(/Memory/));
    await user.click(within(salt).getByLabelText(/Danger/)); // a third pick is ignored
    expect(within(salt).getByLabelText(/Danger/)).not.toBeChecked();
    await user.click(
      within(fieldset(form, 'How does the history begin?')).getByLabelText(/The last ferry/),
    );
    await user.click(
      within(fieldset(form, 'How does the history end?')).getByLabelText(/The long city/),
    );
    expect(form).toHaveTextContent('The road gives every Period a question to answer');
    await user.click(apply);

    await waitFor(() => expect(state(store).startup?.kind).toBe('seed'));
    const steps = screen.getByRole('list', { name: 'Setup steps' });
    expect(
      within(steps).getByRole('button', { name: '1. Start: The Salt Road' }),
    ).toBeInTheDocument();
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('2. Premise');

    // Premise: the seed's draft, with the notes beside it.
    expect(screen.getByLabelText(/^Big Picture/)).toHaveValue(
      'As an inland sea dries to salt, a single road across its bed decides the fate of the peoples on either shore.',
    );
    const notes = screen.getByLabelText('Startup');
    expect(notes).toHaveTextContent('Two guilds of salt-cutters.');
    expect(notes).toHaveTextContent('Wealth: salt is money. · Memory');
    await user.click(screen.getByRole('button', { name: 'Set Big Picture' }));

    // Bookends: titles and prose from the chosen options.
    expect(await screen.findByLabelText('First Period title')).toHaveValue('The last ferry');
    expect(screen.getByLabelText('First Period description')).toHaveValue(
      'The last ferry makes its crossing before the water gets too shallow; its passengers are the first to walk home.',
    );
    expect(screen.getByLabelText('Last Period title')).toHaveValue('The long city');
    expect(screen.getByText(/Drafted from The Salt Road/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set Bookends' }));

    // Palette: suggestions as chips that add themselves.
    const chips = await screen.findByRole('group', { name: 'Suggested Palette items' });
    await user.click(within(chips).getByRole('button', { name: 'Yes: Caravans and waystations' }));
    await waitFor(() =>
      expect(state(store).palette.yes.map((i) => i.text)).toEqual(['Caravans and waystations']),
    );
    expect(within(chips).queryByRole('button', { name: /Caravans/ })).not.toBeInTheDocument();
    await user.click(within(chips).getByRole('button', { name: 'Dismiss all' }));
    expect(
      screen.queryByRole('group', { name: 'Suggested Palette items' }),
    ).not.toBeInTheDocument();
    expect(state(store).palette.no).toEqual([]);
    // Start can no longer be revisited.
    expect(within(steps).getByRole('button', { name: '1. Start: The Salt Road' })).toBeDisabled();
  });

  it('a written Bookend and pick-exactly-two are honored; Back walks up the picker', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await newGame(store);
    const form = await openSaltRoad(user);
    await user.click(within(form).getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('region', { name: 'Seeds' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('region', { name: 'Seed categories' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('region', { name: 'Start' })).toBeInTheDocument();

    const f = await openSaltRoad(user);
    await user.click(
      within(fieldset(f, 'Why is the sea drying up?')).getByLabelText(/No one knows/),
    );
    await user.click(
      within(fieldset(f, 'Who lives on the two shores?')).getByLabelText(/nomadic clans/),
    );
    await user.click(
      within(fieldset(f, 'What does the salt mean to the people who cross it?')).getByLabelText(
        /Holiness/,
      ),
    );
    await user.type(
      within(fieldset(f, 'How does the history begin?')).getByLabelText(/Start Bookend text/),
      'A drought year.',
    );
    await user.type(
      within(fieldset(f, 'How does the history end?')).getByLabelText(/End Bookend title/),
      'Rain',
    );
    await user.type(
      within(fieldset(f, 'How does the history end?')).getByLabelText(/End Bookend text/),
      'It rains for a year.',
    );
    await user.click(within(f).getByRole('button', { name: 'Apply seed' }));
    await waitFor(() => expect(state(store).startup?.kind).toBe('seed'));
    const s = state(store).startup!;
    expect(s.kind === 'seed' && s.bookends).toEqual({
      start: { text: 'A drought year.' },
      end: { title: 'Rain', text: 'It rains for a year.' },
    });
  });

  it('prompt mode: rolls are shown with their die and preselected; picking another is an override', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await newGame(store, 'lens', 'prompt');
    const form = await openSaltRoad(user);
    expect(form).toHaveTextContent('choosing another is logged as an override');
    const cause = fieldset(form, 'Why is the sea drying up?');
    await user.click(within(cause).getByRole('button', { name: 'Roll' }));
    await waitFor(() => expect(within(cause).getByText('rolled')).toBeInTheDocument());
    expect(within(cause).getByLabelText(/^Rolled d4: [1-4]$/)).toBeInTheDocument();
    const rolledId = state(store).pendingSeed!.rolled.cause!;
    const radios = within(cause).getAllByRole('radio') as HTMLInputElement[];
    const ids = ['dam', 'climate', 'below', 'unknown'];
    expect(radios[ids.indexOf(rolledId)]!.checked).toBe(true);
    await user.click(radios[(ids.indexOf(rolledId) + 1) % 4]!);
    expect(within(cause).getByRole('button', { name: 'Roll again' })).toBeInTheDocument();
    await user.click(
      within(fieldset(form, 'Who lives on the two shores?')).getByLabelText(/Two nations/),
    );
    await user.click(
      within(fieldset(form, 'What does the salt mean to the people who cross it?')).getByLabelText(
        /Danger/,
      ),
    );
    await user.click(
      within(fieldset(form, 'How does the history begin?')).getByLabelText(/The first stones/),
    );
    await user.click(
      within(fieldset(form, 'How does the history end?')).getByLabelText(/The sea returns/),
    );
    await user.click(within(form).getByRole('button', { name: 'Apply seed' }));
    await waitFor(() => expect(state(store).startup?.kind).toBe('seed'));
    expect(state(store).stats.overrides).toBe(1);
  });

  it('enforce mode: nothing is pickable until rolled, written answers are hidden, and the roll is locked', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await newGame(store, 'lens', 'enforce');
    const form = await openSaltRoad(user);
    expect(within(form).queryByLabelText(/Write your own/)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/Bookend text/)).not.toBeInTheDocument();
    const salt = fieldset(form, 'What does the salt mean to the people who cross it?');
    for (const box of within(salt).getAllByRole('checkbox')) expect(box).toBeDisabled();
    for (const q of [
      'Why is the sea drying up?',
      'Who lives on the two shores?',
      'What does the salt mean to the people who cross it?',
      'How does the history begin?',
      'How does the history end?',
    ]) {
      await user.click(within(fieldset(form, q)).getByRole('button', { name: 'Roll' }));
    }
    await waitFor(() => expect(Object.keys(state(store).pendingSeed!.rolled)).toHaveLength(5));
    const boxes = within(salt).getAllByRole('checkbox') as HTMLInputElement[];
    const rolled = boxes.find((b) => b.checked)!;
    expect(rolled).toBeDisabled();
    const second = boxes.find((b) => !b.checked)!;
    expect(second).toBeEnabled();
    await user.click(second);
    expect(boxes.filter((b) => b.checked)).toHaveLength(2);
    for (const r of within(fieldset(form, 'Why is the sea drying up?')).getAllByRole('radio'))
      expect(r).toBeDisabled();
    await user.click(within(form).getByRole('button', { name: 'Apply seed' }));
    await waitFor(() => expect(state(store).startup?.kind).toBe('seed'));
    expect(state(store).stats.overrides).toBe(0);
  });
});

describe('generator path', () => {
  it('rolls Crossroads, swaps, rerolls and accepts; the reading shows beside an empty Big Picture', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await newGame(store);
    await user.click(await screen.findByRole('button', { name: /Roll a generator/ }));
    const list = screen.getByRole('region', { name: 'Generators' });
    expect(within(list).getByRole('heading', { name: 'Frontiers' })).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: /Crossroads/ }));
    const panel = screen.getByRole('region', { name: 'Generator: Crossroads' });
    await user.click(within(panel).getByRole('button', { name: 'Roll' }));
    const parts = await within(panel).findByRole('list', { name: 'Rolled parts' });
    expect(
      within(parts)
        .getAllByRole('listitem')
        .map((li) => li.textContent!.split(' ')[0]),
    ).toEqual(['Force', 'Element', 'Effect', 'Element']);
    const texts = state(store).pendingGenerator!.parts.map((p) => p.text);
    const reading = within(panel).getByLabelText('Reading');
    expect(reading).toHaveTextContent(`${texts[0]} ${texts[1]} ${texts[2]} ${texts[3]}`);
    await user.click(within(panel).getByLabelText('Swap'));
    expect(reading).toHaveTextContent(`${texts[0]} ${texts[3]} ${texts[2]} ${texts[1]}`);
    await user.click(within(panel).getByRole('button', { name: 'Reroll' }));
    await waitFor(() => expect(within(panel).getByLabelText('Swap')).not.toBeChecked());
    await user.click(within(panel).getByLabelText('Swap'));
    await user.click(within(panel).getByRole('button', { name: 'Use this reading' }));
    await waitFor(() => expect(state(store).startup?.kind).toBe('generator'));
    const p = state(store).pendingGenerator;
    expect(p).toBeUndefined();
    const s = state(store).startup!;
    expect(s.kind === 'generator' && s.name).toBe('Crossroads');
    expect(screen.getByLabelText(/^Big Picture/)).toHaveValue('');
    expect(screen.getByLabelText('Startup')).toHaveTextContent(
      s.kind === 'generator' ? s.reading : '',
    );
    expect(screen.getByRole('button', { name: '1. Start: Crossroads' })).toBeInTheDocument();
  });

  it('choosing again from Start replaces the startup', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await newGame(store);
    await user.click(await screen.findByRole('button', { name: /Roll a generator/ }));
    await user.click(screen.getByRole('button', { name: /Crossroads/ }));
    await user.click(screen.getByRole('button', { name: 'Roll' }));
    await user.click(await screen.findByRole('button', { name: 'Use this reading' }));
    await user.click(await screen.findByRole('button', { name: '1. Start: Crossroads' }));
    expect(screen.getByText(/Current start:/)).toHaveTextContent('Crossroads');
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    expect(state(store).startup?.kind).toBe('generator');
  });
});

describe('bookendTitle', () => {
  it.each([
    [{ title: 'Given', text: 'x' }, 'Given', false],
    [{ text: 'Short enough.' }, 'Short enough.', false],
    [
      {
        text: 'Harbor towns on both shores empty as the water leaves them, and their people move toward the few fresh wells.',
      },
      'Harbor towns on both shores empty as the water leaves them',
      true,
    ],
    [{ text: 'x'.repeat(80) }, 'x'.repeat(60), true],
  ])('%j → %s', (b, title, cut) => {
    const r = bookendTitle(b);
    expect(r).toEqual({ title, cut });
    expect(r.title.length).toBeLessThanOrEqual(60);
  });
});

describe('startup elsewhere in the app', () => {
  it('the left rail shows the premise notes under the Big Picture', async () => {
    const { LeftRail } = await import('../components/LeftRail');
    const { renderWith } = await import('../../../tests/support/ui');
    const store = await makeStore();
    await store.getState().createGame({ title: 'Salt', ruleset: 'lens' });
    await run(store, {
      type: 'ApplySeed',
      seedId: 'salt-road',
      answers: {
        cause: { optionIds: ['dam'] },
        shores: { optionIds: ['nations'] },
        salt: { optionIds: ['holy'] },
      },
      start: { optionId: 'stones' },
      end: { optionId: 'flood' },
    });
    await run(store, { type: 'SetBigPicture', text: 'Salt and a road.' });
    renderWith(store, <LeftRail g={state(store)} />);
    const bp = screen.getByRole('region', { name: 'Big Picture' });
    await userEvent.setup().click(within(bp).getByText('Premise notes'));
    expect(within(bp).getByLabelText('Startup')).toHaveTextContent(
      'Two nations with different languages and gods.',
    );
  });

  it('the Packs screen counts startup content, lists it, and warns about unused generator tables', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const sample = (await import('../../content')).STARTUP_SAMPLE_PACK;
    const pack = {
      ...sample,
      id: 'mine',
      name: 'Mine',
      tables: [
        ...sample.tables.map((t) => ({ ...t, id: `mine.${t.id}` })),
        { id: 'mine.orphan', name: 'Orphan', category: 'generator', entries: [{ text: 'x' }] },
      ],
      groups: [{ id: 'mine.g', name: 'My group' }],
      seeds: [{ ...sample.seeds[0]!, id: 'mine.seed', group: 'mine.g' }],
      generators: [
        {
          ...sample.generators[0]!,
          id: 'mine.gen',
          group: 'mine.g',
          parts: sample.generators[0]!.parts.map((p) => ({ ...p, tableId: `mine.${p.tableId}` })),
        },
      ],
    };
    expect(await store.getState().importPack(pack)).toEqual({ ok: true });
    await renderApp(store, { name: 'packs' });
    const list = await screen.findByRole('list', { name: 'Installed packs' });
    const items = within(list).getAllByRole('listitem');
    const bundled = items.find((li) => li.textContent!.includes('Startup sample'))!;
    expect(bundled).toHaveTextContent('4 tables · 0 decks · 1 group · 1 seed · 1 generator');
    expect(bundled).toHaveTextContent('built in');
    expect(within(bundled).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    const mine = items.find((li) => li.textContent!.includes('Mine'))!;
    expect(mine).toHaveTextContent(
      'Warning: generator table "mine.orphan" is not used by any generator',
    );
    await user.click(within(mine).getByText('Inspect'));
    await user.click(within(mine).getByText(/Groups \(1\)/));
    expect(within(mine).getByText('My group')).toBeInTheDocument();
    expect(within(mine).getByText(/Seed: The Salt Road/)).toBeInTheDocument();
    expect(within(mine).getByText(/Generator: Crossroads/)).toHaveTextContent(
      '{trend} {a} {impact} {b}',
    );
  });

  it('Game settings shows the seed answers mode and hides generator tables', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    const id = await store.getState().createGame({ title: 'Salt', ruleset: 'lens' });
    await renderApp(store, { name: 'game-settings', gameId: id });
    const mode = await screen.findByLabelText(/^Seed answers/);
    expect(mode).toHaveValue('off');
    expect(screen.queryByLabelText('Crossroads: force')).not.toBeInTheDocument();
    expect(state(store).settings.activeTables.some((t) => t.startsWith('crossroads'))).toBe(false);
    await user.selectOptions(mode, 'enforce');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(state(store).settings.modes['seed.answers']).toBe('enforce'));
  });
});
