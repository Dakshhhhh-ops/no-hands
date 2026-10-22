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
      await expect(page.getByRole('link', { name: 'Start guided demo' })).toBeVisible();

      // The workspace route, its chunk, and the bundled sample all work without the network.
      await page.goto('/app');
      await expect(page.getByRole('heading', { name: 'Commerce Platform' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Say the change' })).toBeVisible();
      await expect(page.getByText(/Offline rules only/)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
