import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Serious and critical WCAG 2.1 A/AA violations fail the build. Scans wait for
// entrance animations to finish, so colors are measured as people see them.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoSeriousViolations(page: Page, label: string) {
  await page.waitForTimeout(700);
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
        await page.getByRole('tab', { name: tab }).click();
        await expectNoSeriousViolations(page, `${tab} tab`);
      }

      await page.getByRole('button', { name: /Advanced/ }).click();
      await expectNoSeriousViolations(page, 'Advanced menu');
    });
  });
}

test('the voice loop works from the keyboard alone: instruction, preview, follow-up, apply', async ({ page }) => {
  await page.goto('/');
  const box = page.getByLabel('Describe an architecture change');
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
