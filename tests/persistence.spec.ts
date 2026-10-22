import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The workspace is saved in the browser after every change, so a reload, or a return
// from Wispr Flow's sign-in, lands on the same stack with its undo history.
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'ride-share-compose.yml');

async function importSample(page: Page) {
  await page.goto('/app');
  await page.getByLabel('docker-compose file', { exact: true }).setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible({ timeout: 20000 });
}

async function openWhatChanged(page: Page) {
  const tab = page.getByRole('tab', { name: /^What changed/ });
  if (!(await tab.isVisible())) await page.getByRole('button', { name: 'Generated docs' }).click();
  await tab.click();
}

test('an imported stack, an applied change, and undo survive a reload', async ({ page }) => {
  test.slow();
  await importSample(page);
  await page.getByLabel('Your instruction').fill('add a red is cache in front of the trips API');
  await page.getByRole('button', { name: /Preview my change/ }).click();
  const review = page.getByRole('dialog', { name: 'Review this change' });
  await review.getByRole('button', { name: /Apply change/ }).click();
  await expect(review).toBeHidden();
  await expect(page.locator('.va-version')).toHaveText(/^v2\b/);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();
  await expect(page.getByText('8 components', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^trips-api, SERVICE/ })).toBeVisible();
  await expect(page.locator('.va-version')).toHaveText(/^v2\b/);
  await openWhatChanged(page);
  await expect(page.getByRole('heading', { level: 4, name: 'trips-api → redis' })).toBeVisible();

  // Undo still works after the reload, and the undo itself is saved too.
  await page.getByRole('button', { name: /^More$/ }).click();
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(page.locator('.va-version')).toHaveText(/^v1\b/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();
  await expect(page.locator('.va-version')).toHaveText(/^v1\b/);
  await page.getByRole('button', { name: /^More$/ }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled();
});

test('a damaged saved workspace is ignored and the default sample loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem('va-workspace', JSON.stringify({ schemaVersion: 1, currentBranchId: 'main', branches: { main: { id: 'main' } } }));
  });
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Commerce Platform' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('returning from the Wispr Flow sign-in lands on the same stack', async ({ page }) => {
  await page.route('**/api/wispr/status*', (route) => route.fulfill({ json: { connected: true } }));
  await page.route('**/api/wispr/items', (route) => route.fulfill({ json: { items: [] } }));
  await importSample(page);

  // Where the server's callback sends the browser after a successful sign-in.
  await page.goto('/app?wispr=connected');
  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Import notes' });
  await expect(dialog.getByText('Connected to Wispr Flow.')).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);

  // An older link to "/?wispr=..." is forwarded to the workspace with its result.
  await page.goto('/?wispr=connected');
  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Import notes' }).getByText('Connected to Wispr Flow.')).toBeVisible();
});
