import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The diagram is always on screen at /app; the docs open in the details drawer. */
async function openView(page: Page, name: string) {
  if (name === 'Diagram') return;
  const tab = page.getByRole('tab', { name: new RegExp(`^${name}`) });
  if (!(await tab.isVisible())) await page.getByRole('button', { name: 'Generated docs' }).click();
  await tab.click();
}

/** The view is showing: the canvas for the diagram, the selected drawer tab for a document. */
async function expectView(page: Page, name: string) {
  if (name === 'Diagram') await expect(page.locator('.diagram-canvas')).toBeVisible();
  else await expect(page.getByRole('tab', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-selected', 'true');
}

/** The samples are in the workspace's project switcher. */
async function loadSample(page: Page) {
  await page.getByRole('button', { name: /Switch project/ }).click();
  await page.getByRole('button', { name: 'Load sample' }).click();
}

// The core story: import your compose file, say a change, review it, apply it,
// and every view and export follows. Runs on the offline rules unless a test
// mocks the model.
const SAMPLE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'ride-share-compose.yml');

test('import a compose file, say a change, apply it, see every tab follow, and export', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: /Switch project/ }).click();
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

  await openView(page, 'What changed');
  await expect(page.getByRole('heading', { level: 4, name: 'trips-api → redis' })).toBeVisible();
  await openView(page, 'Risks');
  await expect(page.getByRole('heading', { level: 3, name: 'Risks and open questions' })).toBeVisible();
  await openView(page, 'Tasks');
  await expect(page.getByRole('heading', { level: 3, name: 'Engineering tasks' })).toBeVisible();
  await openView(page, 'Diagram');
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

  await page.goto('/app');
  await expect(page.getByText('Interpreted by Groq')).toBeVisible();
  await loadSample(page);
  await page.getByLabel('Your instruction').fill('payment provider ko kafka se connect karo');
  await page.getByRole('button', { name: /Preview my change/ }).click();

  const review = page.getByRole('dialog', { name: 'Review this change' });
  await expect(review.getByText('Connect Payment Provider to Kafka')).toBeVisible();
  expect(sent).toEqual(['payment provider ko Kafka se connect karo']);

  await review.getByLabel('Follow up by voice or text').fill('cancel karo');
  await review.getByLabel('Follow up by voice or text').press('Enter');
  await expect(review).toBeHidden();
  await expect(page.locator('.va-version')).toHaveText('v1');
  await expect(page.locator('.va-version')).toHaveAttribute('data-changed', 'false');

  await page.getByRole('button', { name: /Preview my change/ }).click();
  await review.getByLabel('Follow up by voice or text').fill('haan apply karo');
  await review.getByLabel('Follow up by voice or text').press('Enter');
  await expect(review).toBeHidden();
  await expect(page.locator('.va-version')).toHaveText('v2');
  await expect(page.locator('.va-version')).toHaveAttribute('data-changed', 'true');
});

test('loading the app and opening every view logs no errors', async ({ page, browserName }) => {
  const errors: string[] = [];
  // WebKit logs this for every native <select> under a strict CSP, even on a bare page
  // (its own styling of the control). The message names no element, so it is skipped
  // here; security.spec.ts still fails on any CSP violation that comes from the app.
  const webkitSelectNoise = /^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'/;
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (browserName === 'webkit' && webkitSelectNoise.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  await page.goto('/app');
  for (const tab of ['API contract', 'Risks', 'Tasks', 'What changed', 'Diagram']) {
    await openView(page, tab);
    await expectView(page, tab);
  }
  await page.getByRole('button', { name: /^More$/ }).click();
  await page.getByRole('button', { name: /^Topology/ }).click();
  await expect(page.getByRole('tab', { name: 'Topology' })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('decisions typed in the review dialog are recorded in the model, not only counted', async ({ page }) => {
  await page.goto('/app');
  await page.getByLabel('Your instruction').fill('Move session storage to Redis, keep PostgreSQL as the source of truth, add rate limiting to the authentication endpoint, and make login resilient if Redis becomes unavailable.');
  await page.getByRole('button', { name: /Preview my change/ }).click();
  const review = page.getByRole('dialog', { name: 'Review this change' });
  await review.getByLabel('Authentication rate limit').fill('5 attempts per minute per IP');
  await review.getByLabel('Login behavior if Redis is unavailable').fill('Fall back to PostgreSQL sessions');
  await review.getByRole('button', { name: /Apply change/ }).click();
  await expect(review).toBeHidden();
  await expect(page.getByText(/Change applied with 2 recorded decisions/)).toBeVisible();

  // The applied model carries both answers: no open decision is left, and the risk view quotes them.
  await expect(page.getByText(/\d+ open decisions?/)).toHaveCount(0);
  await openView(page, 'Risks');
  await expect(page.getByText(/5 attempts per minute per IP/).first()).toBeVisible();
  await expect(page.getByText(/Fall back to PostgreSQL sessions/).first()).toBeVisible();
});

test('a component removed on a branch is removed from main when the branch merges', async ({ page }) => {
  // Fork, preview, apply, and merge: a long flow for one 30-second budget on a busy machine.
  test.slow();
  await page.goto('/app');
  const redisNode = page.getByRole('button', { name: /^Redis, / });
  await expect(redisNode).toBeVisible();

  await page.getByRole('button', { name: /^More$/ }).click();
  await page.getByRole('button', { name: /Branches and history/ }).click();
  await page.getByRole('button', { name: /Fork this version/ }).click();

  await page.getByLabel('Your instruction').fill('remove the redis and use the postgres directly');
  await page.getByRole('button', { name: /Preview my change/ }).click();
  const review = page.getByRole('dialog', { name: 'Review this change' });
  await review.getByRole('button', { name: /Apply change/ }).click();
  await expect(review).toBeHidden();
  await openView(page, 'Diagram');
  await expect(redisNode).toHaveCount(0);

  // Merged against the fork point, the branch's deletion reaches main.
  await page.getByRole('button', { name: /Merge to Main/ }).click();
  await expect(page.getByRole('button', { name: /Merge to Main/ })).toHaveCount(0);
  await openView(page, 'Diagram');
  await expect(page.getByRole('button', { name: /^PostgreSQL, / })).toBeVisible();
  await expect(redisNode).toHaveCount(0);
});
