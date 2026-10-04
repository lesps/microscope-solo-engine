import { expect, test } from '@playwright/test';
import { eventTurn, panel } from './helpers';

test('group play on one device: three players and a phantom set up and play a turn', async ({
  page,
}) => {
  await page.goto('./#/new');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page.getByLabel('Title').fill('Table history');
  await page.getByText('Options').click();
  await page.getByRole('radio', { name: /^Group/ }).check();
  const players = page.getByRole('group', { name: 'Players' });
  await players.getByLabel('Player 1 name').fill('Ana');
  await players.getByLabel('Player 2 name').fill('Ben');
  await players.getByRole('button', { name: 'Add player' }).click();
  await players.getByLabel('Player 3 name').fill('Cy');
  await players.getByLabel('Phantom seats').selectOption('1');
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.getByRole('list', { name: 'Setup steps' })).toBeVisible();

  await page.getByLabel(/^Big Picture/).fill('A river city rises from the delta and drowns.');
  await page.getByRole('button', { name: 'Set Big Picture' }).click();
  await page.getByLabel('First Period title').fill('Fishers settle the delta');
  await page.getByLabel('Last Period title').fill('The sea takes the towers');
  await page.getByRole('button', { name: 'Set Bookends' }).click();
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: 'Add to Yes' }).click();
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: 'Add to No' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add player' })).toBeDisabled();
  await page.getByRole('button', { name: 'Continue to the First Pass' }).click();

  // The First Pass goes round every seat, players first.
  for (const [i, who] of ['Ana', 'Ben', 'Cy', 'The Stranger'].entries()) {
    await expect(page.getByRole('heading', { name: `First Pass — ${who}` })).toBeVisible();
    if (i > 0) await page.getByLabel('Event').check();
    await page.getByLabel(/^Title/).fill(`${who}'s first entry`);
    await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  }
  await page.getByRole('button', { name: 'Begin round 1' }).click();

  const p = panel(page);
  await expect(p.getByText('Lens: Ana')).toBeVisible();
  await p.getByLabel(/^Focus/).fill('Who owns the river');
  await p.getByRole('button', { name: 'Set Focus' }).click();
  await p.getByRole('button', { name: 'Start turn (Ana)' }).click();
  await expect(p.getByText('Ana’s turn')).toBeVisible();
  await eventTurn(page, 'Ana builds a dam');

  // Anyone at the table can ask the Oracle, credited by name.
  await p.getByRole('button', { name: 'Oracle' }).click();
  const oracle = page.getByRole('dialog');
  await oracle.getByLabel('Asked by').selectOption({ label: 'Cy' });
  await oracle.getByLabel('Yes/no question').fill('Does the dam hold?');
  await oracle.getByRole('button', { name: 'Ask' }).click();
  await expect(oracle.getByText('(Cy)')).toBeVisible();
});
