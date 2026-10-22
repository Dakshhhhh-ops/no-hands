import { test, expect } from '@playwright/test';

// The landing page at "/" and the workspace at /app: deep links, the route split, and the
// workspace's size, edge labels, command bar, slide-over, and narrow layout.

test('deep links to /app and /app?demo=guided work, including after a refresh', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Commerce Platform' })).toBeVisible();
  await expect(page).toHaveTitle(/Workspace/);
  await expect(page.getByLabel('Your instruction')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Commerce Platform' })).toBeVisible();

  await page.goto('/app?demo=guided');
  const guide = page.getByRole('region', { name: 'Guided demo' });
  await expect(guide.getByText('step 1 of 3')).toBeVisible({ timeout: 20000 });
  await page.reload();
  await expect(guide.getByText('step 1 of 3')).toBeVisible({ timeout: 20000 });
});

test('the landing page downloads none of the workspace, and its links open it', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname); });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(scripts.filter((path) => /\/assets\/(App|ArchitectureDiagram|Composer)-/.test(path))).toEqual([]);

  await page.getByRole('link', { name: /Open workspace/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Commerce Platform' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /Say the change/ })).toBeVisible();
});

test('/app?import=compose offers the import, and /app?sample=food loads that sample', async ({ page }) => {
  await page.goto('/app?import=compose');
  const dialog = page.getByRole('dialog', { name: 'Start from your own stack' });
  await expect(dialog.getByRole('button', { name: /Import your docker-compose file/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.goto('/app?sample=food');
  await expect(page.getByRole('heading', { level: 1, name: 'Food Delivery Platform' })).toBeVisible();
});

test.describe('at 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the canvas fills the screen, and no edge label overflows its chip or the canvas', async ({ page }) => {
    await page.goto('/app');
    const canvas = page.locator('.diagram-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(520);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);

    const problems = await page.evaluate(() => {
      const canvasBox = document.querySelector('.diagram-canvas svg')!.getBoundingClientRect();
      const out: string[] = [];
      for (const chip of document.querySelectorAll('.edge-chip')) {
        const rect = chip.querySelector('rect')!.getBoundingClientRect();
        const text = chip.querySelector('text')!.getBoundingClientRect();
        const label = chip.querySelector('text')!.textContent;
        if (text.left < rect.left - 1 || text.right > rect.right + 1) out.push(`"${label}" overflows its chip`);
        if (rect.left < canvasBox.left - 1 || rect.right > canvasBox.right + 1) out.push(`"${label}" leaves the diagram`);
      }
      return out;
    });
    expect(problems).toEqual([]);
    // Any shortened label keeps its full text in a title.
    const shortened = await page.evaluate(() => [...document.querySelectorAll('.edge-chip')].map((chip) => ({
      shown: chip.querySelector('text')!.textContent ?? '',
      full: chip.querySelector('title')!.textContent ?? '',
    })).filter((label) => label.shown.endsWith('…')));
    for (const { shown, full } of shortened) expect(full.startsWith(shown.slice(0, -1))).toBe(true);
  });

  test('the command bar: Enter previews, Shift+Enter is a new line, and the plus menu holds the Wispr Flow tools', async ({ page }) => {
    await page.goto('/app');
    const box = page.getByLabel('Your instruction');
    await expect(box).toBeFocused();
    // The bar floats over the bottom of the canvas, clear of the fitted diagram.
    const bar = (await page.locator('.va-command-bar').boundingBox())!;
    const svg = (await page.locator('.diagram-canvas svg').boundingBox())!;
    expect(bar.y).toBeGreaterThan(svg.y + svg.height - 1);

    await box.fill('Split payments into a separate service');
    await box.press('Shift+Enter');
    await expect(box).toHaveValue('Split payments into a separate service\n');
    await box.press('Enter');
    const review = page.getByRole('dialog', { name: 'Review this change' });
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Close review' }).click();
    await expect(review).toBeHidden();

    const plus = page.getByRole('button', { name: 'Wispr Flow tools and examples' });
    await plus.click();
    await expect(plus).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Import from Wispr Flow or paste notes', 'Copy names for your Flow dictionary']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
    await page.getByRole('button', { name: /Redis Session Store/ }).click();
    await expect(plus).toHaveAttribute('aria-expanded', 'false');
    await expect(box).toBeFocused();
    await expect(box).toHaveValue(/Redis/);
  });

  test('docs open in a slide-over beside the diagram, and Escape closes it', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Generated docs' }).click();
    const drawer = page.locator('#va-drawer');
    await expect(page.getByRole('tab', { name: 'What changed', selected: true })).toBeVisible();
    // The diagram and the command bar make room: neither sits under the slide-over.
    const left = (await drawer.boundingBox())!.x;
    await expect.poll(async () => { const svg = (await page.locator('.diagram-canvas svg').boundingBox())!; return svg.x + svg.width; }).toBeLessThanOrEqual(left);
    const bar = (await page.locator('.va-command-bar').boundingBox())!;
    expect(bar.x + bar.width).toBeLessThanOrEqual(left);
    await page.getByRole('tab', { name: 'What changed' }).press('Escape');
    await expect(drawer).toBeHidden();
  });
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/', '/app']) {
    test(`nothing scrolls sideways on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('the diagram and the command bar share the screen, and the docs open as a sheet', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByLabel('Your instruction')).toBeVisible();
    const canvas = page.locator('.diagram-canvas');
    await expect(canvas).toBeVisible();
    expect((await canvas.boundingBox())!.height).toBeGreaterThanOrEqual(844 * 0.9);
    await page.getByRole('button', { name: 'Generated docs' }).click();
    await expect(page.getByRole('tab', { name: 'What changed', selected: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tab', { name: 'What changed' })).toBeHidden();
  });
});
