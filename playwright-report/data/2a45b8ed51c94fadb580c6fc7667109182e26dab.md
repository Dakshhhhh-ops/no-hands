# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa.spec.ts >> PWA Offline Capability >> works offline after first visit
- Location: tests\pwa.spec.ts:4:3

# Error details

```
Error: page.reload: net::ERR_INTERNET_DISCONNECTED
Call log:
  - waiting for navigation until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('PWA Offline Capability', () => {
  4  |   test('works offline after first visit', async ({ page, context }) => {
  5  |     // First visit - caches assets
  6  |     await page.goto('/');
  7  |     await page.waitForLoadState('networkidle');
  8  |     await page.click('button:has-text("Load sample")');
  9  |     await expect(page.locator('h2:has-text("Commerce Platform")')).toBeVisible();
  10 | 
  11 |     // Go offline
  12 |     await context.setOffline(true);
  13 | 
  14 |     // Reload - should work from cache
> 15 |     await page.reload();
     |                ^ Error: page.reload: net::ERR_INTERNET_DISCONNECTED
  16 |     await expect(page.locator('text=VoiceArchitect')).toBeVisible();
  17 |     await expect(page.locator('button:has-text("Start guided demo")')).toBeVisible();
  18 | 
  19 |     // Sample still loads from cached data
  20 |     await page.click('button:has-text("Load sample")');
  21 |     await expect(page.locator('text=What should change?')).toBeVisible();
  22 |   });
  23 | });
```