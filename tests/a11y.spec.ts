import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Serious and critical WCAG 2.1 A/AA violations fail the build. Scans wait for
// entrance animations to finish, so colors are measured as people see them.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Opens an output view: Diagram and What changed are tabs; the generated docs are in a menu. */
async function openView(page: Page, name: string) {
  if (['API contract', 'Risks', 'Tasks'].includes(name)) {
    await page.getByRole('button', { name: /Generated docs/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  } else {
    await page.getByRole('tab', { name }).click();
  }
}

async function expectNoSeriousViolations(page: Page, label: string) {
  // Measure colors as people see them: wait for every finite animation and transition
  // (entrance fades, the dialog rising in) to finish. A fixed delay was not enough on a
  // loaded machine, and a scan mid-fade reads half-transparent text as low contrast.
  await page.waitForTimeout(100);
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => undefined))));
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${label}: ${v.id} (${v.impact}) at ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(serious, serious.join('\n')).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('landing page, workspace, review dialog, and every core tab', async ({ page }) => {
      // Eight full axe analyses of a large page; give it room under a parallel run.
      test.slow();
      await page.goto('/');
      await expectNoSeriousViolations(page, 'landing');

      await page.getByRole('button', { name: 'Load sample' }).click();
      await page.getByLabel('Your instruction').fill('Move session storage to Redis and add login rate limiting.');
      await page.getByRole('button', { name: /Preview my change/ }).click();
      const review = page.getByRole('dialog', { name: 'Review this change' });
      await expect(review).toBeVisible();
      await expectNoSeriousViolations(page, 'review dialog');
      await review.getByRole('button', { name: /Apply change/ }).click();
      await expect(review).toBeHidden();

      for (const tab of ['Diagram', 'API contract', 'Risks', 'Tasks', 'What changed']) {
        await openView(page, tab);
        await expectNoSeriousViolations(page, `${tab} tab`);
      }

      await page.getByRole('button', { name: /^More$/ }).click();
      await expectNoSeriousViolations(page, 'More menu');
    });
  });
}

test('the voice loop works from the keyboard alone: instruction, preview, follow-up, apply', async ({ page }) => {
  await page.goto('/');
  const box = page.getByLabel('Your instruction');
  await box.focus();
  await page.keyboard.type('catalog service ke aage redis cache laga do');
  await page.keyboard.press('Control+Enter');

  const review = page.getByRole('dialog', { name: 'Review this change' });
  await expect(review).toBeVisible();
  await expect(review.getByLabel('Follow up by voice or text')).toBeFocused();
  await page.keyboard.type('apply');
  await page.keyboard.press('Enter');
  await expect(review).toBeHidden();
  await expect(page.getByText('v2 · updated')).toBeVisible();

  await box.focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('undo');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText('v1 · baseline')).toBeVisible();
});

test('pasted notes become an ordinary proposal through the import dialog, which is accessible', async ({ page }) => {
  // Two full axe analyses; give it room under a parallel run, like the test above.
  test.slow();
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: /Import from Wispr Flow or paste notes/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Import notes' });
  await expect(dialog.getByRole('link', { name: /Connect Wispr Flow/ })).toHaveAttribute('href', '/api/wispr/connect');
  await dialog.getByLabel('Or paste notes').fill('Sync notes.\nMove session storage to Redis and add login rate limiting.');
  await expectNoSeriousViolations(page, 'import dialog');
  await dialog.getByRole('button', { name: 'Propose changes from these notes' }).click();

  const review = page.getByRole('dialog', { name: 'Review this change' });
  await expect(review).toBeVisible();
  await expect(review.getByText(/From pasted notes/)).toBeVisible();
  await expectNoSeriousViolations(page, 'review from notes');
});
