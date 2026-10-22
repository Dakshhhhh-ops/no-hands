import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Serious and critical WCAG 2.1 A/AA violations fail the build. Scans wait for
// entrance animations to finish, so colors are measured as people see them.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** The diagram is always on screen at /app; the docs open in the details drawer. */
async function openView(page: Page, name: string) {
  if (name === 'Diagram') return;
  const tab = page.getByRole('tab', { name: new RegExp(`^${name}`) });
  if (!(await tab.isVisible())) await page.getByRole('button', { name: 'Generated docs' }).click();
  await tab.click();
}



async function expectNoSeriousViolations(page: Page, label: string) {
  // Measure colors as people see them: wait for every finite animation and transition
  // (entrance fades, the dialog rising in) to finish. A fixed delay was not enough on a
  // loaded machine, and a scan mid-fade reads half-transparent text as low contrast.
  // Capped at 3 seconds, so a paused or very long animation can never stall a test.
  await page.waitForTimeout(100);
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity && animation.playState !== 'paused')
      .map((animation) => animation.finished.catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]));
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

      await page.goto('/app');
      await expectNoSeriousViolations(page, 'workspace');
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
  await page.goto('/app');
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
  await page.goto('/app');
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

for (const scheme of ['light', 'dark'] as const) {
  test(`the outage simulator with outages on, and its two dialogs, are accessible (${scheme})`, async ({ page }) => {
    // Four full axe analyses; give it room under a parallel run.
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/app');
    await page.getByRole('button', { name: /^More$/ }).click();
    await page.getByRole('button', { name: /Outage simulator and decision records/ }).click();

    // Every simulated outage and latency spike on: the active colors only appear in this state.
    const toggles = page.locator('.chaos-btn[aria-pressed]');
    await expect(toggles.first()).toBeVisible();
    for (const toggle of await toggles.all()) await toggle.click();
    await expect(toggles.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Restore All/ })).toBeVisible();
    await expectNoSeriousViolations(page, 'simulator with outages');

    const dialogs: Array<[trigger: string, name: string]> = [
      ['View Topological Boot and Deployment Order', 'System Boot & Deployment Sequence'],
      ['View Architecture Decision Record & Governance Sign-Off', 'Architecture Decision Record & Sign-Off'],
    ];
    for (const [trigger, name] of dialogs) {
      await page.locator(`[title="${trigger}"]`).click();
      const dialog = page.getByRole('dialog', { name });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^Close/ })).toBeVisible();
      await expectNoSeriousViolations(page, name);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });
}
