import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Opens an output view: Diagram and What changed are tabs; the generated docs are in a menu. */
async function openView(page: Page, name: string) {
  if (['API contract', 'Risks', 'Tasks'].includes(name)) {
    await page.getByRole('button', { name: /Generated docs/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  } else {
    await page.getByRole('tab', { name }).click();
  }
}

// The core story: import your compose file, say a change, review it, apply it,
// and every view and export follows. Runs on the offline rules unless a test
// mocks the model.
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'ride-share-compose.yml');

test('import a compose file, say a change, apply it, see every tab follow, and export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /From code/ }).click();
  await page.getByLabel('docker-compose file', { exact: true }).setInputFiles(SAMPLE);
  await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('8 components', { exact: true })).toBeVisible();

  await page.getByLabel('Your instruction').fill('add a red is cache in front of the trips API');
  await page.getByRole('button', { name: /Preview my change/ }).click();
  const review = page.getByRole('dialog', { name: 'Review this change' });
  await expect(review.getByText('Put redis in front of trips-api')).toBeVisible();
  await expect(review.getByText(/trips-api → redis/).first()).toBeVisible();
  await review.getByRole('button', { name: /Apply change/ }).click();
  await expect(review).toBeHidden();
  await expect(page.getByLabel('Your instruction')).toHaveValue('add a Redis cache in front of the trips API');

  await page.getByRole('tab', { name: 'What changed' }).click();
  await expect(page.getByRole('heading', { level: 4, name: 'trips-api → redis' })).toBeVisible();
  await openView(page, 'Risks');
  await expect(page.getByRole('heading', { level: 3, name: 'Risks and open questions' })).toBeVisible();
  await openView(page, 'Tasks');
  await expect(page.getByRole('heading', { level: 3, name: 'Engineering tasks' })).toBeVisible();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await expect(page.getByRole('button', { name: /^trips-api, SERVICE/ })).toBeVisible();

  await page.getByRole('button', { name: /^Export/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Engineering artifacts/ }).click();
  expect((await download).suggestedFilename()).toBe('ride-share-platform-v2.zip');
});

test('a Hinglish instruction goes to the model as dictated, and only "apply" applies it', async ({ page }) => {
  const sent: string[] = [];
  await page.route('**/api/status', (route) => route.fulfill({ json: { ai: true, provider: 'groq', model: 'openai/gpt-oss-120b', fallback: null } }));
  await page.route('**/api/interpret', async (route) => {
    sent.push(route.request().postDataJSON().text);
    await route.fulfill({
      json: {
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        interpretation: {
          understood: true,
          summary: 'Connect Payment Provider to Kafka',
          items: [{ title: 'Connect Payment Provider to Kafka', detail: 'Payment Provider publishes payment status to Kafka.' }],
          assumptions: [],
          operations: [{ op: 'add_relationship', from: 'payment', to: 'kafka', label: 'payment status', protocol: null }],
        },
      },
    });
  });

  await page.goto('/');
  await expect(page.getByText('Interpreted by Groq')).toBeVisible();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByLabel('Your instruction').fill('payment provider ko kafka se connect karo');
  await page.getByRole('button', { name: /Preview my change/ }).click();

  const review = page.getByRole('dialog', { name: 'Review this change' });
  await expect(review.getByText('Connect Payment Provider to Kafka')).toBeVisible();
  expect(sent).toEqual(['payment provider ko Kafka se connect karo']);

  await review.getByLabel('Follow up by voice or text').fill('cancel karo');
  await review.getByLabel('Follow up by voice or text').press('Enter');
  await expect(review).toBeHidden();
  await expect(page.getByText('v1 · baseline')).toBeVisible();

  await page.getByRole('button', { name: /Preview my change/ }).click();
  await review.getByLabel('Follow up by voice or text').fill('haan apply karo');
  await review.getByLabel('Follow up by voice or text').press('Enter');
  await expect(review).toBeHidden();
  await expect(page.getByText('v2 · updated')).toBeVisible();
});

test('loading the app and opening every view logs no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample' }).click();
  for (const tab of ['API contract', 'Risks', 'Tasks', 'What changed', 'Diagram']) {
    await openView(page, tab);
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
  }
  await page.getByRole('button', { name: /^More$/ }).click();
  await page.getByRole('button', { name: /^Topology/ }).click();
  await expect(page.getByRole('tab', { name: 'Topology' })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});
