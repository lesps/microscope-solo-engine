import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixture = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'fixtures',
  'lens-3-rounds.json',
);

async function download(page: Page, click: () => Promise<void>) {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const file = await d.path();
  return { name: d.suggestedFilename(), text: fs.readFileSync(file!, 'utf8') };
}

test('import a game file and export all formats', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Import game file or bundle').setInputFiles(fixture);
  await expect(page.getByRole('status', { name: 'Import result' })).toContainText('Game imported.');
  const games = page.getByRole('list', { name: 'Games' });
  await expect(games.getByRole('listitem')).toHaveCount(1);
  await expect(games).toContainText('3 rounds');

  // Importing the same id again is refused unless imported as a copy.
  await page.getByLabel('Import game file or bundle').setInputFiles(fixture);
  await expect(page.getByRole('status', { name: 'Import result' })).toContainText('already exists');
  await page.getByRole('button', { name: 'Import as copy' }).click();
  await expect(games.getByRole('listitem')).toHaveCount(2);

  await games.getByRole('listitem').first().getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('button', { name: 'Start round 4' })).toBeVisible();

  const menu = async (item: string | RegExp) => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    return download(page, () => page.getByRole('menuitem', { name: item }).click());
  };
  const chrono = await menu('Chronological manuscript');
  expect(chrono.name).toMatch(/chronological\.md$/);
  expect(chrono.text).toContain('# Test history');
  expect(chrono.text).toContain('Retcons: 1');

  const play = await menu('Play-order manuscript');
  expect(play.text).toContain('## Round 3');
  expect(play.text).toContain('🎲');

  const out = await menu('Outline');
  expect(out.text).toMatch(/^# Test history\n\n- [○●] /);

  const json = await menu('Game file (JSON)');
  const file = JSON.parse(json.text);
  expect(file.format).toBe('solo-microscope/game');
  expect(file.events.length).toBe(JSON.parse(fs.readFileSync(fixture, 'utf8')).events.length);

  // Export all from the Library as one bundle.
  await page.getByRole('link', { name: 'Library' }).click();
  const bundle = await download(page, () =>
    page.getByRole('button', { name: 'Export all' }).click(),
  );
  expect(JSON.parse(bundle.text).games).toHaveLength(2);
});
