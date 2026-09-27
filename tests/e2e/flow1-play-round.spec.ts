import { expect, test } from '@playwright/test';
import { eventTurn, newGame, panel } from './helpers';

test('create a game and play one full round with a Scene', async ({ page }) => {
  await newGame(page, 'E2E River', { backupRounds: 1 });
  const p = panel(page);

  // Persistence status is requested and shown.
  await expect(page.getByTestId('persist-status')).toHaveText(/persisted|best-effort|unknown/);

  // Focus: the player holds the Lens in round 1 and writes it.
  await p.getByLabel(/^Focus/).fill('Who controls the crossings');
  await p.getByRole('button', { name: 'Set Focus' }).click();
  await p.getByRole('button', { name: /Start turn/ }).click();

  // A Scene inside the First Pass Event.
  await p.getByLabel('Entry type').selectOption('scene');
  await p.getByRole('button', { name: 'Roll placement' }).click();
  await expect(page.getByRole('note', { name: 'Rolled placement' })).toBeVisible();

  // Reloading mid-turn restores the recorded rolls.
  const placementBefore = await p.getByLabel('Placement').inputValue();
  await page.reload();
  await expect(p.getByLabel('Placement')).toHaveValue(placementBefore);

  await p.getByLabel(/^Title/).fill('The toll at the old bridge');
  await p.getByLabel(/^Question/).fill('Who pays the first toll?');
  await p.getByRole('button', { name: 'Frame Scene' }).click();
  await p.getByRole('button', { name: 'Open Scene editor' }).click();

  const editor = page.getByRole('region', { name: 'Scene editor' });
  await expect(editor.getByLabel('Question', { exact: true })).toHaveText(
    'Who pays the first toll?',
  );
  await editor
    .getByLabel('Scene draft')
    .fill('Rain on the planks. The ferrywoman counts coins while the carters argue.');
  await editor.getByRole('button', { name: 'Draw setup · complication · pressure' }).click();
  await expect(editor.locator('.tarot')).toHaveCount(3);
  await editor.getByRole('button', { name: 'Draw a reversal' }).click();
  await editor.getByRole('button', { name: 'Insert at cursor' }).click();
  await expect(editor.getByText(/^Placed:/)).toBeVisible();
  await expect(editor.getByLabel('Scene draft')).toHaveValue(/\[\[REVERSAL: .+\]\]/);
  await editor.getByLabel('Yes/no question').fill('Does the carter pay?');
  await editor.getByRole('button', { name: 'Ask' }).click();
  await expect(
    editor.getByRole('list', { name: 'Oracle answers' }).getByRole('listitem'),
  ).toHaveCount(1);
  await editor
    .getByLabel('Answer in one sentence')
    .fill('The ferrywoman pays it herself, to shame them.');
  await editor.getByRole('button', { name: 'Resolve Scene and commit turn' }).click();

  // Back at the table; the Scene is locked in the timeline.
  await expect(
    page.getByRole('button', { name: /scene The toll at the old bridge, (light|dark), locked/ }),
  ).toBeVisible();

  // Cohesion may grant extra turns (enforced); take them until the round moves on.
  for (let i = 0; i < 8; i++) {
    const extra = p.getByRole('button', { name: /Take another turn/ });
    if (!(await extra.isVisible())) break;
    await extra.click();
    await eventTurn(page, `Extra turn ${i + 1}`);
  }

  await p.getByLabel(/^Add a Legacy/).fill('The toll-house');
  await p.getByRole('button', { name: /^Add Legacy/ }).click();
  await expect(page.getByRole('region', { name: 'Legacies' })).toContainText('The toll-house');

  await p.getByRole('button', { name: 'Roll a Legacy' }).click();
  await p.getByRole('button', { name: 'Explore' }).click();
  await eventTurn(page, 'The toll-house burns');

  await p.getByRole('button', { name: 'Adjust dials and end round' }).click();
  await expect(p.getByRole('button', { name: 'Start round 2' })).toBeVisible();

  // Backup reminder fires at the (lowered) threshold, and dismissing snoozes it.
  const banner = page.getByRole('status', { name: 'Backup reminder' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Not now' }).click();
  await expect(banner).toBeHidden();

  // Hash deep link under the base path reloads straight into the game.
  const url = page.url();
  expect(url).toMatch(/#\/game\/[0-9A-Z]+$/);
  await page.goto(url);
  await page.reload();
  await expect(p.getByRole('button', { name: 'Start round 2' })).toBeVisible();
});
