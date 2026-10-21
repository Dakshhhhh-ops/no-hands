import { test, expect } from '@playwright/test';

// Runs in the "pwa" project against `vite preview` of a production build, the only
// build that registers the service worker.
test.describe('PWA offline capability', () => {
  test('works offline after first visit', async ({ page, context }) => {
    await page.goto('/');

    // The worker precaches during install, so once it is active and controlling
    // this page, every asset is available offline.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
      await page.reload();
    }
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('button', { name: 'Start guided demo' })).toBeVisible();

      // The sample model is bundled, so it loads without the network.
      await page.getByRole('button', { name: 'Load sample' }).click();
      await expect(page.getByRole('heading', { name: 'Commerce Platform' })).toBeVisible();
      await expect(page.getByText('What should change?')).toBeVisible();
      await expect(page.getByText(/Offline rules only/)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
