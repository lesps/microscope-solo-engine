import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { panel } from './helpers';

const toolkits = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'toolkits');
const GROUPS = ['Close to Home', 'Far Horizons', 'Myth and Iron'];

async function importToolkits(page: Page) {
  await page.goto('./#/packs');
  for (const file of ['myth-and-iron', 'far-horizons', 'close-to-home']) {
    await page.getByLabel('Import content pack').setInputFiles(path.join(toolkits, `${file}.json`));
    await expect(page.getByText('Pack installed and enabled.')).toBeVisible();
  }
  await expect(
    page.getByRole('list', { name: 'Installed packs' }).getByRole('listitem'),
  ).toHaveCount(5);
}

const gameIdOf = (page: Page) => page.url().match(/#\/game\/([^/]+)\//)![1]!;

/** Game settings shows exactly `linked` (plus every untagged table) active. */
async function expectLinked(page: Page, gameId: string, linked: string) {
  await page.goto(`./#/game/${gameId}/settings`);
  const tables = page.getByRole('region', { name: 'Active tables' });
  await expect(tables.getByRole('checkbox', { name: 'All untagged tables' })).toBeChecked();
  for (const name of GROUPS) {
    const all = tables.getByRole('checkbox', { name: `All ${name} tables` });
    if (name === linked) await expect(all).toBeChecked();
    else await expect(all).not.toBeChecked();
  }
  await page.goBack();
}

test('a Far Horizons seed links only its toolkit; Question idea and Roll a person fill a Scene', async ({
  page,
}) => {
  await importToolkits(page);
  // The seed is chosen before the title, which it suggests.
  await page.goto('./#/new');
  await page
    .getByRole('region', { name: 'Far Horizons' })
    .getByRole('button', { name: /The Long Signal/ })
    .click();
  await expect(page.getByLabel('Title')).toHaveValue('The Long Signal');
  await page.getByLabel('Title').fill('Signal history');
  await page.getByRole('button', { name: 'Begin' }).click();
  const form = page.getByRole('region', { name: 'Seed: The Long Signal' });
  await expect(form).toBeVisible();
  const gameId = gameIdOf(page);
  await form
    .getByRole('group', { name: 'What is in the signal?' })
    .getByLabel(/A warning/)
    .check();
  await form
    .getByRole('group', { name: 'Who controls the reply?' })
    .getByLabel(/A council of every world/)
    .check();
  await form
    .getByRole('group', { name: 'What do people come to believe about the senders?' })
    .getByLabel(/They are long dead/)
    .check();
  await form
    .getByRole('group', { name: 'How does the history begin?' })
    .getByLabel(/An ordinary night shift/)
    .check();
  await form
    .getByRole('group', { name: 'How does the history end?' })
    .getByLabel(/A second signal/)
    .check();
  await form.getByRole('button', { name: 'Apply seed' }).click();
  await expect(page.getByLabel(/^Big Picture/)).toHaveValue(/a reply to a message/);

  await expectLinked(page, gameId, 'Far Horizons');

  await page.getByRole('button', { name: 'Set Big Picture' }).click();
  await page.getByRole('button', { name: 'Set Bookends' }).click();
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: 'Add to Yes' }).click();
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: 'Add to No' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to the First Pass' }).click();
  await page.getByLabel(/^Title/).fill('The reply committee');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  await page.getByLabel('Event').check();
  await page.getByLabel(/^Title/).fill('The first draft is leaked');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  await page.getByRole('button', { name: 'Begin round 1' }).click();

  const p = panel(page);
  await p.getByLabel(/^Focus/).fill('What to say');
  await p.getByRole('button', { name: 'Set Focus' }).click();
  await p.getByRole('button', { name: /Start turn/ }).click();
  await p.getByLabel('Entry type').selectOption('scene');
  await p.getByRole('button', { name: 'Roll placement' }).click();
  await p.getByLabel(/^Title/).fill('The vote');

  await p.getByRole('button', { name: 'Question idea' }).click();
  await p.getByRole('button', { name: 'Use this question' }).click();
  await expect(p.getByLabel(/^Question/)).toHaveValue(/\?$/);

  await p.getByRole('button', { name: 'Roll a person' }).click();
  await p.getByRole('button', { name: 'Use this person' }).click();
  await expect(p.getByLabel('New character name')).not.toHaveValue('');
  await expect(p.getByLabel('New character description')).toHaveValue(/, who wants to /);
  const name = await p.getByLabel('New character name').inputValue();
  await p.getByRole('button', { name: 'Add character' }).click();
  await expect(p.getByLabel(/Required characters/).getByRole('option', { name })).toBeAttached();
  await p.getByRole('button', { name: 'Frame Scene' }).click();
  await expect(p.getByRole('button', { name: 'Open Scene editor' })).toBeVisible();
});

test('a blank start with Close to Home ticked links only that toolkit', async ({ page }) => {
  await importToolkits(page);
  await page.goto('./#/new');
  await page.getByRole('button', { name: /Start blank/ }).click();
  await page
    .getByRole('group', { name: 'Toolkits' })
    .getByRole('checkbox', { name: /Close to Home/ })
    .check();
  await page.getByLabel('Title').fill('Kitchen-table history');
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page.getByLabel(/^Big Picture/)).toBeVisible();
  const gameId = gameIdOf(page);
  await expectLinked(page, gameId, 'Close to Home');
});
