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
    await page.getByRole('button', { name: /From code/ }).click();
    await page.getByRole('button', { name: 'Try example stack' }).click();
    // The importer is lazy-loaded; on a cold dev server under parallel load the first
    // load can be slow. Assert on what stays on screen, not the transient toast.
    await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('8 components', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pricing-worker, SERVICE/ })).toBeVisible();

    await page.getByRole('button', { name: /Reset sample/ }).click();
    await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();

    await page.getByRole('button', { name: 'Load sample' }).click();
    await expect(page.getByRole('heading', { name: 'Commerce Platform' })).toBeVisible();
  });

  test('check the diagram against a newer docker-compose file and sync it', async ({ page }) => {
    // The longest flow in the suite (import, drift review, apply, recheck); give it room under parallel load.
    test.slow();
    await page.getByRole('button', { name: /From code/ }).click();
    await page.getByRole('button', { name: 'Try example stack' }).click();
    await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /From code/ }).click();
    await page.getByRole('button', { name: 'Try example update' }).click();
    const review = page.getByRole('dialog', { name: 'Review this change' });
    await expect(review).toBeVisible({ timeout: 20000 });
    await expect(review.getByText('Add 2 services found in ride-share-compose.v2.yml')).toBeVisible();
    await expect(review.getByText('Remove 1 service deleted from code')).toBeVisible();
    await expect(review.getByText(/postgres: postgres:16 → postgres:17/)).toBeVisible();

    await review.getByRole('button', { name: /Apply change/ }).click();
    await expect(review).toBeHidden();
    await page.getByRole('tab', { name: 'Diagram' }).click();
    await expect(page.getByRole('button', { name: /^search, DATABASE/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^pricing-worker, SERVICE/ })).toHaveCount(0);

    await page.getByRole('button', { name: /From code/ }).click();
    await page.getByRole('button', { name: 'Try example update' }).click();
    await expect(page.getByText('The diagram matches ride-share-compose.v2.yml.')).toBeVisible();
  });

  test('resolve every open risk from the Risks tab through one review', async ({ page }) => {
    await page.getByLabel('Your instruction').fill('Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.');
    await page.getByRole('button', { name: /Preview my change/ }).click();
    await page.getByRole('dialog', { name: 'Review this change' }).getByRole('button', { name: /Apply change/ }).click();

    await page.getByRole('tab', { name: 'Risks' }).click();
    await expect(page.getByText('3 open findings can be resolved here')).toBeVisible();
    await page.getByRole('button', { name: 'Fall back to PostgreSQL' }).click();
    await page.getByLabel(/What limit should sign-in use\? Your own answer/).fill('5 attempts per minute per IP');
    await page.getByRole('button', { name: 'Choose suggested fixes' }).click();
    await page.getByRole('button', { name: /Review 3 fixes/ }).click();

    const review = page.getByRole('dialog', { name: 'Review this change' });
    await expect(review.getByText('Add a standby replica for PostgreSQL')).toBeVisible();
    await review.getByRole('button', { name: /Apply change/ }).click();
    await expect(review).toBeHidden();

    await page.getByRole('tab', { name: 'Risks' }).click();
    await expect(page.getByText('Nothing open')).toBeVisible();
    await expect(page.getByText('Rate limit recorded: 5 attempts per minute per IP')).toBeVisible();
    await expect(page.getByRole('button', { name: /open decision/ })).toHaveCount(0);
  });

  test('keyboard dialogs open, survive odd input, and close with Escape', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog').filter({ has: page.getByLabel('Command palette search') });
    await expect(palette).toBeVisible();
    await page.keyboard.type('(zip');
    await expect(palette.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();

    await page.keyboard.press('?');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await expect(shortcuts).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.getByLabel('Command palette search')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();

    await expect(page.getByRole('heading', { level: 2, name: 'Commerce Platform' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('every export menu item downloads its file when clicked with the mouse', async ({ page }) => {
    const items: Array<[RegExp, RegExp]> = [
      [/Engineering artifacts/, /^commerce-platform-v\d+\.zip$/],
      [/Architecture SVG/, /\.svg$/],
      [/Architecture PNG/, /\.png$/],
      [/Mermaid source/, /\.mmd$/],
    ];
    for (const [item, file] of items) {
      await page.getByRole('button', { name: /^Export/ }).click();
      const download = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: item }).click();
      expect((await download).suggestedFilename()).toMatch(file);
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
    await page.getByRole('button', { name: /Advanced/ }).click();
    const devops = page.waitForEvent('download');
    await page.getByRole('button', { name: /^DevOps bundle/ }).click();
    expect((await devops).suggestedFilename()).toMatch(/^commerce-platform-devops-v\d+\.zip$/);
  });

  test('guided demo walks an English step, a Hinglish step, and the code check', async ({ page }) => {
    await page.getByRole('button', { name: 'Start guided demo' }).click();
    const guide = page.getByRole('region', { name: 'Guided demo' });
    await expect(guide.getByText('step 1 of 3')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'ride-share-platform' })).toBeVisible();

    for (const say of ['Add a Redis cache in front of the trips API', 'payment service ko alag container mein daalo']) {
      await guide.getByRole('button', { name: 'Type it for me' }).click();
      await expect(page.getByLabel('Your instruction')).toHaveValue(say);
      await page.getByRole('button', { name: /Preview my change/ }).click();
      const review = page.getByRole('dialog', { name: 'Review this change' });
      await review.getByLabel('Follow up by voice or text').fill('apply');
      await review.getByLabel('Follow up by voice or text').press('Enter');
      await expect(review).toBeHidden();
    }

    await expect(guide.getByText('step 3 of 3')).toBeVisible();
    await guide.getByRole('button', { name: 'Run the code check' }).click();
    const sync = page.getByRole('dialog', { name: 'Review this change' });
    await expect(sync.getByText('Add 2 services found in ride-share-compose.v2.yml')).toBeVisible({ timeout: 20000 });
    await sync.getByRole('button', { name: /Apply change/ }).click();
    await expect(guide.getByText(/Guided demo · done/)).toBeVisible();
    await page.getByRole('tab', { name: 'Diagram' }).click();
    await expect(page.getByRole('button', { name: /^Payment Service, SERVICE/ })).toBeVisible();
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
