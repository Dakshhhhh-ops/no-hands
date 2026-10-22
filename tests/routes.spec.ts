import { test, expect } from '@playwright/test';

// The landing page at "/" and the workspace at /app: deep links, the route split, and the
// workspace's size, edge labels, splitter, and narrow layout.

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

  test('the canvas fills the space beside the composer, and no edge label overflows its chip or the canvas', async ({ page }) => {
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
    // A shortened label keeps its full text in a title.
    const shortened = await page.evaluate(() => [...document.querySelectorAll('.edge-chip')].map((chip) => ({
      shown: chip.querySelector('text')!.textContent ?? '',
      full: chip.querySelector('title')!.textContent ?? '',
    })).filter((label) => label.shown.endsWith('…')));
    expect(shortened.length).toBeGreaterThan(0);
    for (const { shown, full } of shortened) expect(full.startsWith(shown.slice(0, -1))).toBe(true);
  });

  test('the composer splitter resizes from the keyboard, and the panel collapses to a rail', async ({ page }) => {
    await page.goto('/app');
    const splitter = page.getByRole('separator', { name: 'Resize the instruction panel' });
    const panel = page.locator('#va-composer');
    const before = (await panel.boundingBox())!.width;
    await splitter.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(splitter).toHaveAttribute('aria-valuenow', String(Math.round(before) + 32));
    expect((await panel.boundingBox())!.width).toBeGreaterThan(before + 24);
    await page.keyboard.press('Home');
    await expect(splitter).toHaveAttribute('aria-valuenow', '320');

    await page.getByRole('button', { name: 'Collapse the instruction panel' }).click();
    await expect(panel).toHaveCount(0);
    await page.getByRole('button', { name: 'Show the instruction panel' }).click();
    await expect(page.getByLabel('Your instruction')).toBeVisible();
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

  test('the bottom tabs switch between saying a change, the diagram, and the docs', async ({ page }) => {
    await page.goto('/app');
    const tabs = page.getByRole('navigation', { name: 'Workspace views' });
    await expect(page.getByLabel('Your instruction')).toBeVisible();
    await tabs.getByRole('button', { name: 'Diagram' }).click();
    const canvas = page.locator('.diagram-canvas');
    await expect(canvas).toBeVisible();
    expect((await canvas.boundingBox())!.height).toBeGreaterThanOrEqual(844 * 0.6 - 56);
    await tabs.getByRole('button', { name: 'Docs' }).click();
    await expect(page.getByRole('tab', { name: 'What changed', selected: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tab', { name: 'What changed' })).toBeHidden();
  });
});
