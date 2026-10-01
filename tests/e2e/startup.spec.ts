import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { panel } from './helpers';

const fixtures = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'fixtures');

async function create(page: Page, title: string, ruleset: 'Lens' | 'Chronicle' = 'Lens') {
  await page.goto('./');
  await page.getByRole('link', { name: 'New game' }).click();
  await page.getByLabel('Title').fill(title);
  if (ruleset === 'Chronicle') await page.getByLabel(/Chronicle/).check();
  await page.getByRole('button', { name: 'Create and set up' }).click();
}

test('The Salt Road: from a seed to the first round, then one turn', async ({ page }) => {
  await create(page, 'Salt Road history');
  await page.getByRole('button', { name: /Start from a seed/ }).click();
  await page.getByRole('button', { name: /Frontiers/ }).click();
  await page.getByRole('button', { name: /The Salt Road/ }).click();
  const form = page.getByRole('region', { name: 'Seed: The Salt Road' });
  await form
    .getByRole('group', { name: 'Why is the sea drying up?' })
    .getByLabel(/climate is changing/)
    .check();
  await form
    .getByRole('group', { name: 'Who lives on the two shores?' })
    .getByLabel(/settled kingdom/)
    .check();
  const salt = form.getByRole('group', {
    name: 'What does the salt mean to the people who cross it?',
  });
  await salt.getByLabel(/Holiness/).check();
  await salt.getByLabel(/Memory/).check();
  await form
    .getByRole('group', { name: 'How does the history begin?' })
    .getByLabel(/The empty harbors/)
    .check();
  await form
    .getByRole('group', { name: 'How does the history end?' })
    .getByLabel(/The road is the border/)
    .check();
  await form.getByRole('button', { name: 'Apply seed' }).click();

  // Premise prefilled from the seed, notes beside it.
  await expect(page.getByLabel(/^Big Picture/)).toHaveValue(/As an inland sea dries to salt/);
  await expect(page.getByLabel('Startup')).toContainText(
    'The climate is changing, slowly and for good.',
  );
  await page.getByRole('button', { name: 'Set Big Picture' }).click();

  // Bookends prefilled: the start option has a title; the tones are the player's.
  await expect(page.getByLabel('First Period title')).toHaveValue('The empty harbors');
  await expect(page.getByLabel('Last Period title')).toHaveValue('The road is the border');
  await expect(page.getByLabel('Last Period description')).toHaveValue(/walled along its length/);
  await page.getByRole('radiogroup', { name: 'First Period tone' }).getByLabel('● Dark').check();
  await page.getByRole('button', { name: 'Set Bookends' }).click();

  // Palette chips.
  const chips = page.getByRole('group', { name: 'Suggested Palette items' });
  await chips.getByRole('button', { name: 'Yes: Caravans and waystations' }).click();
  await chips.getByRole('button', { name: 'No: Magic that makes water' }).click();
  await expect(chips).toBeHidden();
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: 'Add to Yes' }).click();
  await page.getByRole('button', { name: 'Roll a Palette item' }).click();
  await page.getByRole('button', { name: 'Add to No' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to the First Pass' }).click();
  await page.getByLabel(/^Title/).fill('Caravans find the wells');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  await page.getByLabel('Event').check();
  await page.getByLabel(/^Title/).fill('The first toll');
  await page.getByRole('button', { name: 'Add First Pass entry' }).click();
  await page.getByRole('button', { name: 'Begin round 1' }).click();

  // The table: premise notes in the rail; play one turn.
  const bp = page.getByRole('region', { name: 'Big Picture' });
  await bp.getByText('Premise notes').click();
  await expect(bp.getByLabel('Startup')).toContainText(
    'Holiness: the flats are sacred ground. · Memory',
  );
  const p = panel(page);
  await p.getByLabel(/^Focus/).fill('Who holds the road');
  await p.getByRole('button', { name: 'Set Focus' }).click();
  await p.getByRole('button', { name: /Start turn/ }).click();
  await p.getByLabel('Entry type').selectOption('event');
  await p.getByRole('button', { name: 'Roll placement' }).click();
  await p.getByLabel(/^Title/).fill('Salt priests bless the road');
  await p.getByRole('button', { name: 'Write event' }).click();
  await p.getByRole('button', { name: 'Commit turn' }).click();
  await expect(
    page.getByRole('button', { name: /event Salt priests bless the road, (light|dark), locked/ }),
  ).toBeVisible();
});

test('Crossroads: roll, swap, reroll and accept; the Big Picture stays empty', async ({ page }) => {
  await create(page, 'Crossroads history');
  await page.getByRole('button', { name: /Roll a generator/ }).click();
  await page.getByRole('button', { name: /Crossroads/ }).click();
  const gen = page.getByRole('region', { name: 'Generator: Crossroads' });
  await gen.getByRole('button', { name: 'Roll' }).click();
  const reading = gen.getByLabel('Reading');
  const first = await reading.textContent();
  await gen.getByLabel('Swap').check();
  await expect(reading).not.toHaveText(first!);
  await gen.getByRole('button', { name: 'Reroll' }).click();
  await expect(gen.getByLabel('Swap')).not.toBeChecked();
  await gen.getByLabel('Swap').check();
  const accepted = await reading.textContent();
  await gen.getByRole('button', { name: 'Use this reading' }).click();
  await expect(page.getByLabel(/^Big Picture/)).toHaveValue('');
  await expect(page.getByLabel('Startup')).toContainText(accepted!);
  await expect(page.getByRole('button', { name: '1. Start: Crossroads' })).toBeVisible();
});

test('an imported v2 pack adds a Chronicle seed and a generator', async ({ page }) => {
  await page.goto('./#/packs');
  await page
    .getByLabel('Import content pack')
    .setInputFiles(path.join(fixtures, 'packs', 'startup-v2.json'));
  await expect(page.getByText('Pack installed and enabled.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Installed packs' })).toContainText(
    '2 tables · 0 decks · 1 group · 1 seed · 1 generator',
  );

  await create(page, 'Lighthouse', 'Chronicle');
  await page.getByRole('button', { name: /Start from a seed/ }).click();
  await page.getByRole('button', { name: /Coastlines/ }).click();
  await page.getByRole('button', { name: /The Keeper's Light/ }).click();
  const form = page.getByRole('region', { name: "Seed: The Keeper's Light" });
  await form
    .getByRole('group', { name: 'Why was it built?' })
    .getByLabel('Too many wrecks.')
    .check();
  await form
    .getByRole('group', { name: 'How does it begin?' })
    .getByLabel(/First light/)
    .check();
  await form
    .getByRole('group', { name: 'How does it end?' })
    .getByLabel(/Last light/)
    .check();
  await form.getByRole('button', { name: 'Apply seed' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Grey Point Light');
  await expect(page.getByLabel(/^Traits/)).toHaveValue('tall\nlonely\nbright');
});
