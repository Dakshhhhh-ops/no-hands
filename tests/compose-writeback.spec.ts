import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockApi } from './support/mockApi.ts';

// After an applied change, the imported compose file can follow: the app writes the change
// into the user's own file, shows the diff, and the downloaded file passes the drift check.
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'ride-share-compose.yml');

async function importSample(page: Page) {
  await page.goto('/app');
  await page.getByLabel('docker-compose file', { exact: true }).setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible({ timeout: 20000 });
}

async function apply(page: Page) {
  const review = page.getByRole('dialog', { name: 'Review this change' });
  await review.getByRole('button', { name: /Apply change/ }).click();
  await expect(review).toBeHidden();
}

test('an applied change is written into the imported compose file, which then matches the diagram', async ({ page }, testInfo) => {
  test.slow();
  await importSample(page);
  await page.getByLabel('Your instruction').fill('add a red is cache in front of the trips API');
  await page.getByRole('button', { name: /Preview my change/ }).click();
  await apply(page);

  await page.getByRole('button', { name: 'Download updated compose file' }).click();
  const dialog = page.getByRole('dialog', { name: 'Updated compose file' });
  await expect(dialog.getByText('trips-api', { exact: true }).first()).toBeVisible();
  const diff = dialog.getByLabel('Unified diff of ride-share-compose.yml');
  await expect(diff).toContainText('+      REDIS_URL: redis://redis:6379');
  await expect(diff).toContainText('+      redis:');
  await expect(dialog.getByText('Removed from the file')).toHaveCount(0);

  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download ride-share-compose.yml' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('ride-share-compose.yml');
  const saved = testInfo.outputPath('ride-share-compose.yml');
  await download.saveAs(saved);
  const text = await readFile(saved, 'utf8');
  expect(text).toContain('# Example stack for VoiceArchitect');
  expect(text).toContain('REDIS_URL: redis://redis:6379');
  await expect(dialog).toBeHidden();

  // The downloaded file is the code now: the drift check finds nothing to sync.
  await page.getByLabel('docker-compose file to check against').setInputFiles(saved);
  await expect(page.getByText('The diagram matches ride-share-compose.yml.')).toBeVisible();
});

test('services removed from the diagram are listed before the file is offered', async ({ page }) => {
  await mockApi(page, {
    '/api/status': { ai: true, provider: 'groq', model: 'openai/gpt-oss-120b', fallback: null },
    '/api/interpret': {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      interpretation: {
        understood: true,
        summary: 'Remove the pricing worker',
        items: [{ title: 'Remove pricing-worker', detail: 'The pricing worker is retired.' }],
        assumptions: [],
        operations: [{ op: 'remove_component', id: 'pricing-worker' }],
      },
    },
  });
  await importSample(page);
  await page.getByLabel('Your instruction').fill('remove the pricing worker');
  await page.getByRole('button', { name: /Preview my change/ }).click();
  await apply(page);

  await page.getByRole('button', { name: 'Download updated compose file' }).click();
  const dialog = page.getByRole('dialog', { name: 'Updated compose file' });
  const removed = dialog.getByRole('group', { name: 'Removed from the file' });
  await expect(removed).toContainText('pricing-worker');
  await expect(dialog.getByLabel('Unified diff of ride-share-compose.yml')).toContainText('-  pricing-worker:');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
