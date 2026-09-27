import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { newGame, panel } from './helpers';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');

test('an invalid pack shows per-entry errors and installs nothing; a valid one installs', async ({
  page,
}, info) => {
  await page.goto('./#/packs');
  const installed = page
    .getByRole('list', { name: 'Installed packs' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('checkbox') });
  await expect(installed).toHaveCount(1);
  await page
    .getByLabel('Import content pack')
    .setInputFiles(path.join(root, 'tests/fixtures/packs/malformed.json'));
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The pack was not installed');
  await expect(alert).toContainText('tables[1].entries[0].text: must not be empty');
  await expect(installed).toHaveCount(1);

  const doc = fs.readFileSync(path.join(root, 'docs/content-packs.md'), 'utf8');
  const example = doc.split('## Worked example')[1]!.match(/```json\n([\s\S]*?)```/)![1]!;
  const file = info.outputPath('harbor.json');
  fs.writeFileSync(file, example);
  await page.getByLabel('Import content pack').setInputFiles(file);
  await expect(page.getByText('Pack installed and enabled.')).toBeVisible();
  await expect(installed).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Installed packs' })).toContainText('Harbor towns');
});

test('seats are named in setup; game settings change a mode mid-round', async ({ page }) => {
  await newGame(page, 'Settings', { phantomName: 'The Cartographer' });
  await page.getByRole('link', { name: 'Game settings' }).click();
  await page.getByLabel(/^Entry type/).selectOption('enforce');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await expect(page.getByText('Seats change between rounds.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to the table' }).click();

  await expect(page.getByRole('region', { name: 'Seats' })).toContainText('The Cartographer');
  const p = panel(page);
  await p.getByLabel(/^Focus/).fill('Maps');
  await p.getByRole('button', { name: 'Set Focus' }).click();
  await p.getByRole('button', { name: /Start turn/ }).click();
  // Entry type is now rolled and enforced.
  await expect(p.getByLabel('Entry type')).toBeDisabled();
  await expect(p.getByRole('list', { name: 'This turn’s rolls' })).toContainText('Entry type');
});
