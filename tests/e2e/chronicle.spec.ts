import { expect, test } from '@playwright/test';
import { panel } from './helpers';

test('Chronicle: Subject, Anchors, and a Period with a Change', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'New game' }).click();
  await page.getByLabel('Title').fill('The Lighthouse');
  await page.getByLabel(/Chronicle/).check();
  await page.getByLabel('Preset').selectOption('pure-lens');
  await page.getByRole('button', { name: 'Create and set up' }).click();

  await page.getByLabel('Name').fill('Saltmark Light');
  await page.getByLabel(/^One-sentence description/).fill('A lighthouse on a cold coast.');
  await page.getByLabel(/^Traits/).fill('tall\nlonely\nbright');
  await page.getByRole('button', { name: 'Set Subject' }).click();

  await page.getByLabel('First Period title').fill('The first lamp');
  await page.getByLabel('First Period Anchor').fill('The Builder');
  await page.getByLabel('Last Period title').fill('The last keeper leaves');
  await page.getByLabel('Last Period Anchor').fill('The Last Keeper');
  await page.getByRole('button', { name: 'Set Bookends' }).click();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to the First Pass' }).click();
  await page.getByLabel(/^Title/).fill('The wreck years');
  await page.getByLabel('Anchor name').fill('Ada Vell');
  await page.getByLabel('Trait', { exact: true }).fill('haunted');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  await page.getByLabel('Event').check();
  await page.getByLabel(/^Title/).fill('A ship strikes the reef');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  await page.getByRole('button', { name: 'Begin round 1' }).click();

  const p = panel(page);
  await expect(page.getByRole('region', { name: 'Subject' })).toContainText('haunted');
  await p.getByRole('button', { name: 'haunted' }).click();
  await p.getByRole('button', { name: 'Set Focus' }).click();
  await p.getByRole('button', { name: /Start turn/ }).click();
  await p.getByLabel('Entry type').selectOption('period');
  await p.getByLabel('Placement').selectOption({ index: 1 });
  await p.getByLabel(/^Title/).fill('The automation');
  await p.getByLabel('Anchor name').fill('The Inspector');
  await p.getByLabel('Change to the subject').selectOption('modify');
  await p.getByLabel('Trait to modify').selectOption('bright');
  await p.getByLabel('Modified trait').fill('automatic');
  await p.getByRole('button', { name: 'Write period' }).click();
  await p.getByRole('button', { name: 'Commit turn' }).click();

  await page.getByRole('button', { name: /period The automation/ }).click();
  const dialog = page.getByRole('dialog', { name: 'The automation' });
  await expect(dialog).toContainText('Anchor: The Inspector');
  await expect(dialog).toContainText('bright → automatic');
});
