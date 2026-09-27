import { expect, test } from '@playwright/test';
import { newGame, panel } from './helpers';

test('works offline after the first load', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await page.getByRole('link', { name: 'Packs' }).click();
  await expect(page.getByRole('heading', { name: 'Content packs' })).toBeVisible();
  await context.setOffline(false);
});

test('keyboard: N advances, O opens the oracle, Esc closes, Ctrl+Z undoes', async ({ page }) => {
  await newGame(page, 'Keys');
  const p = panel(page);
  await p.getByLabel(/^Focus/).fill('Salt');
  await p.getByLabel(/^Focus/).press('Enter');
  await page.getByRole('main', { name: 'Timeline' }).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(p.getByLabel('Entry type')).toBeVisible();

  await page.keyboard.press('o');
  await expect(page.getByRole('dialog', { name: 'Oracle' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Oracle' })).toBeHidden();

  await p.getByLabel('Entry type').selectOption('event');
  await page.getByRole('main', { name: 'Timeline' }).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('r');
  await expect(page.getByRole('note', { name: 'Rolled placement' })).toBeVisible();
  await p.getByLabel(/^Title/).fill('Salt pans');
  await p.getByRole('button', { name: 'Write event' }).click();
  await expect(p.getByRole('button', { name: 'Commit turn' })).toBeVisible();
  await page.getByRole('main', { name: 'Timeline' }).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(p.getByRole('button', { name: 'Write event' })).toBeVisible();
  // The rolled placement survives undo.
  await expect(page.getByRole('note', { name: 'Rolled placement' })).toBeVisible();
});

test('reduced motion skips roll animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await newGame(page, 'Still');
  const p = panel(page);
  await p.getByLabel(/^Focus/).fill('Salt');
  await p.getByRole('button', { name: 'Set Focus' }).click();
  await p.getByRole('button', { name: /Start turn/ }).click();
  await expect(p.getByRole('list', { name: 'This turn’s rolls' })).toBeVisible();
  await expect(p.locator('.roll-anim')).toHaveCount(0);
});
