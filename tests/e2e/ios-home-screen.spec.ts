import { expect, test, type Page } from '@playwright/test';
import { newGame } from './helpers';

// Chromium standing in for an iPad Home Screen app: a touch viewport, iOS's
// navigator.standalone flag and a share sheet.
test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true });

async function asHomeScreenApp(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
    const shared: { name: string; type: string; text: string }[] = [];
    (window as unknown as { shared: typeof shared }).shared = shared;
    navigator.canShare = () => true;
    navigator.share = async (data?: ShareData) => {
      for (const f of data?.files ?? [])
        shared.push({ name: f.name, type: f.type, text: await f.text() });
    };
  });
}

test('index.html is set up for the Home Screen, and every launch image is served', async ({
  page,
  request,
}) => {
  await page.goto('./');
  const meta = (name: string) =>
    page.locator(`meta[name="${name}"]`).first().getAttribute('content');
  expect(await meta('apple-mobile-web-app-capable')).toBe('yes');
  expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
  expect(await meta('viewport')).toContain('viewport-fit=cover');
  const hrefs = await page
    .locator('link[rel="apple-touch-startup-image"]')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
  expect(hrefs).toHaveLength(62);
  for (const href of hrefs) {
    const r = await request.get(href);
    expect(r.status(), href).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
  }
});

test('touch sizing: fields never trigger focus zoom, buttons are 44 px', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'New game' }).click();
  const title = page.getByLabel('Title');
  expect(
    parseFloat(await title.evaluate((e) => getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  const create = page.getByRole('button', { name: 'Create and set up' });
  expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('as a Home Screen app: colored bar under the status bar, resume after relaunch, exports go to the share sheet', async ({
  page,
}) => {
  await asHomeScreenApp(page);
  await newGame(page, 'Pocket history');
  const bar = await page.locator('.topbar').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bar).toBe('rgb(122, 75, 30)');
  // Status badges stay legible on the colored bar.
  const badge = page.getByTestId('persist-status');
  expect(await badge.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await badge.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(246, 243, 238)');

  // iOS evicted the app in the background; tapping its icon opens the start URL.
  const table = page.url();
  await page.goto('./');
  await expect(page).toHaveURL(table);
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'Outline' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { shared: { name: string }[] }).shared))
    .toEqual([expect.objectContaining({ name: 'pocket-history-outline.md' })]);
});
