import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AppStore } from '../../store';
import { renderApp } from '../../../tests/support/app';
import { makeStore } from '../../../tests/support/ui';

const state = (store: AppStore) => store.getState().current!.state;
type User = ReturnType<typeof userEvent.setup>;

async function createViaUi(
  user: User,
  store: AppStore,
  opts: { ruleset?: 'lens' | 'chronicle'; preset?: string } = {},
) {
  await renderApp(store, { name: 'new' });
  await user.type(await screen.findByLabelText('Title'), 'River');
  expect(screen.getByRole('button', { name: 'Create and set up' })).toBeEnabled();
  if (opts.ruleset === 'chronicle') await user.click(screen.getByLabelText(/Chronicle/));
  if (opts.preset) await user.selectOptions(screen.getByLabelText('Preset'), opts.preset);
  await user.click(screen.getByRole('button', { name: 'Create and set up' }));
  await screen.findByRole('list', { name: 'Setup steps' });
  // Lens games open on the Start step (the bundled startup sample has Lens content).
  const blank = screen.queryByRole('button', { name: /Start blank/ });
  if (blank) await user.click(blank);
}

describe('New game screen', () => {
  it('requires a title and applies a preset', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await renderApp(store, { name: 'new' });
    expect(await screen.findByRole('button', { name: 'Create and set up' })).toBeDisabled();
    await user.type(screen.getByLabelText('Title'), 'Pure');
    await user.selectOptions(screen.getByLabelText('Preset'), 'pure-lens');
    await user.click(screen.getByRole('button', { name: 'Create and set up' }));
    await screen.findByRole('list', { name: 'Setup steps' });
    expect(state(store).settings.drift).toBe('preference');
    expect(state(store).settings.modes.placement).toBe('off');
    expect(window.location.hash).toMatch(/\/setup$/);
  });
});

describe('Setup wizard (Lens)', () => {
  it('walks every step to round 1, including rolled Palette items', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await createViaUi(user, store);
    const current = () =>
      screen.getByRole('list', { name: 'Setup steps' }).querySelector('[aria-current="step"]');
    expect(current()).toHaveTextContent('2. Premise');
    expect(screen.getByRole('button', { name: '4. Palette' })).toBeDisabled();

    await user.type(screen.getByLabelText(/^Big Picture/), 'A river city rises and drowns.');
    await user.click(screen.getByRole('button', { name: 'Set Big Picture' }));
    await waitFor(() => expect(current()).toHaveTextContent('3. Bookends'));

    await user.type(screen.getByLabelText('First Period title'), 'Founding');
    await user.type(screen.getByLabelText('First Period description'), 'Mud and reeds.');
    await user.type(screen.getByLabelText('Last Period title'), 'Drowning');
    const lastTone = screen.getByRole('radiogroup', { name: 'Last Period tone' });
    expect(within(lastTone).getByLabelText('● Dark')).toBeChecked();
    await user.click(within(lastTone).getByLabelText('○ Light'));
    await user.click(screen.getByRole('button', { name: 'Set Bookends' }));
    await waitFor(() => expect(current()).toHaveTextContent('4. Palette'));
    expect(state(store).entries).toSatisfy((es: object) =>
      Object.values(es).some((e) => e.title === 'Drowning' && e.tone === 'light'),
    );

    await user.type(screen.getByLabelText('Add to Yes'), 'Bridges{Enter}');
    await user.type(screen.getByLabelText('Add to No'), 'Dragons');
    await user.click(screen.getAllByRole('button', { name: 'Add' })[1]!);
    await waitFor(() => expect(state(store).palette.no).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Remove Dragons' }));
    await waitFor(() => expect(state(store).palette.no).toHaveLength(0));

    await user.click(screen.getByRole('button', { name: 'Roll a Palette item' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    expect(screen.getByRole('button', { name: 'Reroll (used)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Add to No' }));
    await user.click(screen.getByRole('button', { name: 'Roll a Palette item' }));
    await user.click(screen.getByRole('button', { name: 'Add to Yes' }));
    expect(await screen.findByText('All rolled items placed.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Palette rolls' })).getAllByRole('listitem'),
    ).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(current()).toHaveTextContent('5. Seats');
    await user.click(screen.getByRole('button', { name: 'Continue to the First Pass' }));
    expect(current()).toHaveTextContent('6. First Pass');
    expect(screen.getByRole('heading', { name: 'First Pass — You' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Title/), 'Canals');
    await user.click(screen.getByRole('button', { name: 'Add First Pass entry' }));
    expect(
      await screen.findByRole('heading', { name: 'First Pass — The Stranger' }),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText('Event'));
    const placement = screen.getByLabelText('Placement') as HTMLSelectElement;
    await user.selectOptions(placement, placement.options[1]!.value);
    await user.type(screen.getByLabelText(/^Title/), 'First bridge');
    await user.click(screen.getByRole('radio', { name: '● Dark' }));
    await user.click(screen.getByRole('button', { name: 'Add First Pass entry' }));
    await waitFor(() => expect(current()).toHaveTextContent('7. Dials'));

    // Going back to a finished step is allowed.
    await user.click(screen.getByRole('button', { name: '2. Premise' }));
    expect(current()).toHaveTextContent('2. Premise');
    // Start stays revisitable until the Bookends exist, so it is disabled now.
    expect(screen.getByRole('button', { name: '1. Start' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '7. Dials' }));

    expect(screen.queryByText(/^Chaos/)).not.toBeInTheDocument();
    const [mood] = screen.getAllByRole('slider');
    fireEvent.change(mood!, { target: { value: '7' } });
    expect(screen.getByText(/^Mood: 7/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set dials' }));
    await waitFor(() => expect(state(store).dialsSet).toBe(true));
    expect(screen.getByRole('button', { name: 'Update dials' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Begin round 1' }));
    await waitFor(() => expect(state(store).rounds).toHaveLength(1));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/game\/[^/]+$/));
    expect(state(store).dials.mood).toBe(7);
    expect(
      Object.values(state(store).entries)
        .filter((e) => e.firstPass)
        .map((e) => e.title),
    ).toEqual(['Canals', 'First bridge']);
  });

  it('shows rejections and blocks empty submissions', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await createViaUi(user, store);
    expect(screen.getByRole('button', { name: 'Set Big Picture' })).toBeDisabled();
    await user.type(screen.getByLabelText(/^Big Picture/), 'x'.repeat(201));
    await user.click(screen.getByRole('button', { name: 'Set Big Picture' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 200 characters');
  });
});

describe('Setup wizard (Chronicle, High Friction)', () => {
  it('sets a Subject, anchored Bookends, a First Pass Period with a Change, and Chaos', async () => {
    const user = userEvent.setup();
    const store = await makeStore();
    await createViaUi(user, store, { ruleset: 'chronicle', preset: 'high-friction' });
    await user.type(screen.getByLabelText('Name'), 'Saltmark Light');
    await user.type(screen.getByLabelText(/^One-sentence description/), 'A lighthouse.');
    await user.clear(screen.getByLabelText(/^Traits/));
    await user.type(screen.getByLabelText(/^Traits/), 'tall{Enter}lonely{Enter}bright');
    await user.click(screen.getByRole('button', { name: 'Set Subject' }));

    await user.type(await screen.findByLabelText('First Period title'), 'First lamp');
    await user.type(screen.getByLabelText('First Period Anchor'), 'The Light');
    await user.click(screen.getAllByLabelText('immortal')[0]!);
    await user.type(screen.getByLabelText('Last Period title'), 'Last keeper');
    await user.type(screen.getByLabelText('Last Period Anchor'), 'The Keeper');
    await user.click(screen.getByRole('button', { name: 'Set Bookends' }));

    // High Friction enforces the Palette roll: no reroll button.
    await user.click(await screen.findByRole('button', { name: 'Roll a Palette item' }));
    expect(screen.queryByRole('button', { name: /^Reroll/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to Yes' }));
    await user.click(screen.getByRole('button', { name: 'Roll a Palette item' }));
    await user.click(screen.getByRole('button', { name: 'Add to Yes' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue to the First Pass' }));

    await user.type(screen.getByLabelText(/^Title/), 'Wreck years');
    await user.type(screen.getByLabelText('Anchor name'), 'Ada');
    await user.selectOptions(screen.getByLabelText('Change'), 'modify');
    await user.type(screen.getByLabelText('From trait'), 'bright');
    await user.type(screen.getByLabelText('To trait'), 'dim');
    await user.click(screen.getByRole('button', { name: 'Add First Pass entry' }));
    await screen.findByRole('heading', { name: 'First Pass — The Stranger' });
    await user.click(screen.getByLabelText('Event'));
    await user.type(screen.getByLabelText(/^Title/), 'A wreck');
    await user.click(screen.getByRole('button', { name: 'Add First Pass entry' }));

    expect(await screen.findByText(/^Chaos: 5/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Begin round 1' }));
    await waitFor(() => expect(state(store).rounds).toHaveLength(1));
    const g = state(store);
    expect(g.subject?.traits).toEqual(['tall', 'lonely', 'bright']);
    expect(Object.values(g.characters).find((c) => c.name === 'The Light')?.immortal).toBe(true);
    expect(Object.values(g.entries).find((e) => e.title === 'Wreck years')).toMatchObject({
      change: { op: 'modify', from: 'bright', to: 'dim' },
    });
    expect(g.dials.chaos).toBe(5);
  });
});
