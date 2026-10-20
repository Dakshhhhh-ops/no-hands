import { test, expect } from '@playwright/test';

test.describe('PWA Offline Capability', () => {
  test('works offline after first visit', async ({ page, context }) => {
    // First visit - caches assets
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Load sample")');
    await expect(page.locator('h2:has-text("Commerce Platform")')).toBeVisible();

    // Go offline
    await context.setOffline(true);

    // Reload - should work from cache
    await page.reload();
    await expect(page.locator('text=VoiceArchitect')).toBeVisible();
    await expect(page.locator('button:has-text("Start guided demo")')).toBeVisible();

    // Sample still loads from cached data
    await page.click('button:has-text("Load sample")');
    await expect(page.locator('text=What should change?')).toBeVisible();
  });
});