import { test, expect } from '@playwright/test';

// Browser tests for the demo path. Without ANTHROPIC_API_KEY the app uses the
// offline rules, so these run anywhere; the Claude path is covered in AiFlow.test.tsx.

test.describe('VoiceArchitect demo flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Load sample' }).click();
  });

  test('preview and apply a change, then see it in the diagram and history', async ({ page }) => {
    await page.getByLabel('Your instruction').fill('Split payments into a separate service');
    await page.getByRole('button', { name: /Preview my change/ }).click();

    const review = page.getByRole('dialog', { name: 'Review this change' });
    await expect(review).toBeVisible();
    await expect(review.getByText('Separate payment processing into a service')).toBeVisible();

    await review.getByRole('button', { name: /Apply change/ }).click();
    await expect(review).toBeHidden();
    await expect(page.getByText(/Change applied/).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Diagram' }).click();
    await expect(page.getByRole('button', { name: /^Payment Service, SERVICE/ })).toBeVisible();

    for (const tab of ['API contract', 'Risks', 'Tasks', 'What changed']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }

    await page.reload();
    await expect(page.getByLabel('Your instruction')).toHaveValue('Split payments into a separate service');
  });

  test('import the example docker-compose stack and reset back to it', async ({ page }) => {
    await page.getByRole('button', { name: 'Try example stack' }).click();
    await expect(page.getByText(/Imported 8 services and 9 connections/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pricing-worker, SERVICE/ })).toBeVisible();

    await page.getByRole('button', { name: /Reset sample/ }).click();
    await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();

    await page.getByRole('button', { name: 'Load sample' }).click();
    await expect(page.getByRole('heading', { name: 'Commerce Platform' })).toBeVisible();
  });

  test('diagram nodes are keyboard selectable', async ({ page }) => {
    const node = page.getByRole('button', { name: /^API Gateway, GATEWAY/ });
    await node.focus();
    await expect(node).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('aria-pressed', 'false');
  });

  test('export menu is keyboard accessible', async ({ page }) => {
    const exportButton = page.getByRole('button', { name: /^Export/ });
    await exportButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
  });
});
