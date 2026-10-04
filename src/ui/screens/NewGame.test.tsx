import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { linkedActiveTables } from '../../engine';
import type { AppStore } from '../../store';
import startupV2 from '../../../tests/fixtures/packs/startup-v2.json';
import myth from '../../../toolkits/myth-and-iron.json';
import home from '../../../toolkits/close-to-home.json';
import { go, renderApp } from '../../../tests/support/app';
import { makeStore } from '../../../tests/support/ui';
import { LAST_PRESET_KEY } from './NewGameScreen';

type User = ReturnType<typeof userEvent.setup>;
const state = (store: AppStore) => store.getState().current!.state;
const currentStep = () =>
  screen.getByRole('list', { name: 'Setup steps' }).querySelector('[aria-current="step"]');

async function open(store: AppStore) {
  await renderApp(store, { name: 'new' });
  return screen.findByRole('region', { name: 'Choose a start' });
}

async function begin(user: User) {
  await user.click(screen.getByRole('button', { name: 'Begin' }));
  await screen.findByRole('list', { name: 'Setup steps' });
}

afterEach(() => localStorage.clear());

describe('New game: choose a start first', () => {
  it('lists seeds and generators by category, with Start blank up front', async () => {
    const store = await makeStore();
    const choose = await open(store);
    const frontiers = within(choose).getByRole('region', { name: 'Frontiers' });
    expect(within(frontiers).getByRole('button', { name: /The Salt Road/ })).toHaveTextContent(
      'An inland sea is drying up.',
    );
    expect(within(frontiers).getByRole('button', { name: /Roll Crossroads/ })).toBeInTheDocument();
    const buttons = within(choose).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Start blank');
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('a seed suggests the title, fixes the ruleset, and setup opens on its questions', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await open(store);
    await user.click(screen.getByRole('button', { name: /The Salt Road/ }));
    const form = screen.getByRole('region', { name: 'Name your game' });
    expect(form).toHaveTextContent('Starting from The Salt Road');
    expect(within(form).getByLabelText('Title')).toHaveValue('The Salt Road');
    expect(within(form).queryByRole('radio')).not.toBeInTheDocument();
    expect(form).toHaveTextContent('Ruleset: Lens');
    await user.clear(within(form).getByLabelText('Title'));
    expect(screen.getByRole('button', { name: 'Begin' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Title'), 'Salt and Iron');
    await begin(user);
    expect(state(store)).toMatchObject({ title: 'Salt and Iron', ruleset: 'lens' });
    expect(window.location.hash).toMatch(/\/setup\/seed\/salt-road$/);
    expect(currentStep()).toHaveTextContent('1. Start');
    expect(screen.getByRole('region', { name: 'Seed: The Salt Road' })).toBeInTheDocument();
  });

  it('a Chronicle seed makes a Chronicle game', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().importPack(startupV2);
    await open(store);
    await user.click(screen.getByRole('button', { name: /The Keeper's Light/ }));
    expect(screen.getByRole('region', { name: 'Name your game' })).toHaveTextContent(
      'Ruleset: Chronicle',
    );
    await begin(user);
    expect(state(store).ruleset).toBe('chronicle');
    expect(screen.getByRole('region', { name: "Seed: The Keeper's Light" })).toBeInTheDocument();
  });

  it('a seed for either ruleset lets the player choose', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().importPack(myth);
    await open(store);
    await user.click(screen.getByRole('button', { name: /The Last Giant/ }));
    await user.click(screen.getByLabelText(/Chronicle/));
    await begin(user);
    expect(state(store).ruleset).toBe('chronicle');
  });

  it('a generator suggests its name and setup opens on its roll', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await open(store);
    await user.click(screen.getByRole('button', { name: /Roll Crossroads/ }));
    expect(screen.getByLabelText('Title')).toHaveValue('Crossroads');
    await begin(user);
    expect(state(store).ruleset).toBe('lens');
    expect(window.location.hash).toMatch(/\/setup\/generator\/crossroads$/);
    expect(screen.getByRole('region', { name: 'Generator: Crossroads' })).toBeInTheDocument();
  });

  it('Start blank asks for a title and ruleset, and setup skips Start', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await open(store);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    const form = screen.getByRole('region', { name: 'Name your game' });
    expect(form).toHaveTextContent('Starting blank');
    expect(screen.getByRole('button', { name: 'Begin' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Title'), 'Lighthouse');
    await user.click(within(form).getByLabelText(/Chronicle/));
    await begin(user);
    expect(state(store)).toMatchObject({ title: 'Lighthouse', ruleset: 'chronicle' });
    expect(currentStep()).toHaveTextContent('Premise');
  });

  it('Start blank offers installed toolkits and links the ticked ones', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await store.getState().importPack(home);
    await open(store);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    const toolkits = screen.getByRole('group', { name: 'Toolkits' });
    await user.click(within(toolkits).getByRole('checkbox', { name: /Close to Home/ }));
    await user.type(screen.getByLabelText('Title'), 'Kitchen table');
    await begin(user);
    const untagged = Object.values(store.getState().content.tables)
      .filter((t) => t.category !== 'generator' && !t.tags)
      .map((t) => t.id);
    expect(state(store).settings.activeTables).toEqual(
      linkedActiveTables(store.getState().content, untagged, ['close-to-home']),
    );
    expect(currentStep()).toHaveTextContent('Premise');
  });

  it('Change goes back to the choices', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await open(store);
    await user.click(screen.getByRole('button', { name: /The Salt Road/ }));
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('region', { name: 'Choose a start' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Roll Crossroads/ }));
    expect(screen.getByLabelText('Title')).toHaveValue('Crossroads');
  });

  it('options: a preset applies, and the last one used becomes the default', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await open(store);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    await user.type(screen.getByLabelText('Title'), 'Pure');
    await user.click(screen.getByText('Options'));
    expect(screen.getByLabelText('Preset')).toHaveValue('default');
    await user.selectOptions(screen.getByLabelText('Preset'), 'pure-lens');
    await begin(user);
    await waitFor(() => expect(state(store).settings.modes.placement).toBe('off'));
    expect(localStorage.getItem(LAST_PRESET_KEY)).toBe('pure-lens');

    await go({ name: 'new' });
    await user.click(await screen.findByRole('button', { name: /Start blank/ }));
    expect(screen.getByLabelText('Preset')).toHaveValue('pure-lens');
  });

  it('an unknown remembered preset falls back to Default', async () => {
    localStorage.setItem(LAST_PRESET_KEY, 'nonsense');
    const user = userEvent.setup();
    const store = await makeStore();
    await open(store);
    await user.click(screen.getByRole('button', { name: /Start blank/ }));
    expect(screen.getByLabelText('Preset')).toHaveValue('default');
  });

  it('with no startup content installed, it goes straight to naming a blank game', async () => {
    const store = await makeStore();
    await store.getState().setPackEnabled('startup-sample', false);
    await renderApp(store, { name: 'new' });
    const form = await screen.findByRole('region', { name: 'Name your game' });
    expect(form).toHaveTextContent('Starting blank');
    expect(within(form).queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });
});
