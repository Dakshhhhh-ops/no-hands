import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// The preview server sends the production headers (server/securityHeaders.ts), so
// these tests run the app under its real Content-Security-Policy and fail on any
// violation, not only on the ones that print a console error.

async function trackViolations(page: Page, browserName: string) {
  await page.addInitScript((engine) => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener('securitypolicyviolation', (e) => {
      // WebKit reports a style-src-attr violation for every native <select>, even on a bare
      // page with no styles or scripts: its own internal styling of the control. Only that
      // exact report is ignored; anything from the app still fails the test.
      const target = e.target as Element | null;
      if (engine === 'webkit' && e.effectiveDirective === 'style-src-attr' && target?.nodeName === 'SELECT' && !e.sample) return;
      seen.push(`${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile || 'page'}:${e.lineNumber}`);
    });
  }, browserName);
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

test('the page and its assets are served with the security headers', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(headers['permissions-policy']).toContain('microphone=(self)');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');

  const asset = await page.request.get(await page.locator('script[type="module"]').first().getAttribute('src') as string);
  expect(asset.headers()['content-security-policy']).toContain("default-src 'self'");
  const api = await page.request.get('/api/health');
  expect(api.headers()['content-security-policy']).toContain("default-src 'self'");
});

test('fonts are self-hosted: the page makes no third-party requests', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('/');
  // Fonts load lazily once text needs them; WebKit can settle document.fonts.ready before that.
  await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded' && /Instrument Sans/.test(f.family)))).toBe(true);
  expect([...origins].filter((o) => !o.startsWith('http://localhost'))).toEqual([]);
});

test('the guided demo, every export, the docs, and the import dialog run with no CSP violation', async ({ page, browserName }) => {
  test.slow();
  const violations = await trackViolations(page, browserName);
  await page.goto('/');

  // Guided demo: recorded answers, review, spoken "apply", and the code check.
  await page.getByRole('button', { name: 'Start guided demo' }).click();
  const guide = page.getByRole('region', { name: 'Guided demo' });
  await expect(guide.getByText('step 1 of 3')).toBeVisible({ timeout: 20000 });
  for (let step = 0; step < 2; step += 1) {
    await guide.getByRole('button', { name: 'Type it for me' }).click();
    await page.getByRole('button', { name: /Preview my change/ }).click();
    const review = page.getByRole('dialog', { name: 'Review this change' });
    await review.getByLabel('Follow up by voice or text').fill('apply');
    await review.getByLabel('Follow up by voice or text').press('Enter');
    await expect(review).toBeHidden();
  }
  await guide.getByRole('button', { name: 'Run the code check' }).click();
  const sync = page.getByRole('dialog', { name: 'Review this change' });
  await sync.getByRole('button', { name: /Apply change/ }).click();
  await expect(guide.getByText(/Guided demo · done/)).toBeVisible();

  // Every export, including the PNG drawn from a blob: URL, and the DevOps bundle.
  for (const item of [/Engineering artifacts/, /Architecture SVG/, /Architecture PNG/, /Mermaid source/]) {
    await page.getByRole('button', { name: /^Export/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: item }).click();
    await download;
  }
  await page.getByRole('button', { name: /^More$/ }).click();
  const devops = page.waitForEvent('download');
  await page.getByRole('button', { name: /^DevOps bundle/ }).click();
  await devops;

  // Generated docs, the outage simulator, and the import dialog.
  for (const name of ['API contract', 'Risks', 'Tasks']) {
    await page.getByRole('button', { name: /Generated docs/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.getByRole('button', { name: /^More$/ }).click();
  await page.getByRole('button', { name: /Outage simulator and decision records/ }).click();
  await page.getByRole('button', { name: /Import from Wispr Flow or paste notes/ }).click();
  await expect(page.getByRole('dialog', { name: 'Import notes' })).toBeVisible();

  expect(await violations()).toEqual([]);
});
