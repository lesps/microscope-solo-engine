import { expect, type Page } from '@playwright/test';

export async function newGame(
  page: Page,
  title: string,
  opts: { backupRounds?: number; phantomName?: string } = {},
) {
  await page.goto('./');
  if (opts.backupRounds) {
    await page.getByRole('link', { name: 'Storage', exact: true }).click();
    await page.getByLabel('Rounds').fill(String(opts.backupRounds));
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('link', { name: 'Library' }).click();
  }
  await page.getByRole('link', { name: 'New game' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create and set up' }).click();
  // Setup opens on Start when startup content is installed; a blank start is the classic flow.
  await page.getByRole('button', { name: /Start blank/ }).click();

  await page.getByLabel(/^Big Picture/).fill('A river city rises from the delta and drowns.');
  await page.getByRole('button', { name: 'Set Big Picture' }).click();

  await page.getByLabel('First Period title').fill('Fishers settle the delta');
  await page.getByLabel('Last Period title').fill('The sea takes the towers');
  await page.getByRole('button', { name: 'Set Bookends' }).click();

  await page.getByLabel('Add to Yes').fill('Bridges');
  await page.getByLabel('Add to Yes').press('Enter');
  await page.getByLabel('Add to No').fill('Dragons');
  await page.getByLabel('Add to No').press('Enter');
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: 'Add to Yes' }).click();
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: /^Reroll/ }).click();
  await page.getByRole('button', { name: 'Add to No' }).click();
  await expect(page.getByText('All rolled items placed.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  if (opts.phantomName) {
    await page.getByLabel('Name').nth(1).fill(opts.phantomName);
    await page.getByRole('button', { name: 'Save seats' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Continue to the First Pass' }).click();

  await page.getByLabel(/^Title/).fill('The canal years');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  await expect(
    page.getByRole('heading', { name: `First Pass — ${opts.phantomName ?? 'The Stranger'}` }),
  ).toBeVisible();
  await page.getByLabel('Event').check();
  await page.getByLabel(/^Title/).fill('The first bridge is built');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();

  await page.getByRole('button', { name: 'Begin round 1' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
}

export const panel = (page: Page) => page.getByRole('complementary', { name: 'Turn panel' });

/** Write a plain Event through the turn panel and commit it. */
export async function eventTurn(page: Page, title: string) {
  const p = panel(page);
  await p.getByLabel('Entry type').selectOption('event');
  await p.getByRole('button', { name: 'Roll placement' }).click();
  await p.getByLabel(/^Title/).fill(title);
  await p.getByLabel('Description').fill(`What happened: ${title}.`);
  await p.getByRole('button', { name: 'Write event' }).click();
  await p.getByRole('button', { name: 'Commit turn' }).click();
}
