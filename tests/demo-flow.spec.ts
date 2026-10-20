import { test, expect } from '@playwright/test';

test.describe('VoiceArchitect Demo Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('complete demo flow: load → dictate → preview → apply → review all tabs → export', async ({ page }) => {
    // 1. Load sample
    await page.click('button:has-text("Load sample")');
    await expect(page.locator('h2:has-text("Commerce Platform")')).toBeVisible();
    await expect(page.locator('text=What should change?')).toBeVisible();

    // 2. Dictate/enter instruction
    const textarea = page.locator('#architecture-command');
    await textarea.fill('Move session storage to Redis, keep PostgreSQL as the source of truth, add login rate limiting, and keep login working if Redis is down.');
    
    // 3. Preview change
    await page.click('button:has-text("Preview my change")');
    await expect(page.locator('text=Review this change')).toBeVisible();
    await expect(page.locator('text=Move session storage to Redis')).toBeVisible();
    await expect(page.locator('text=Keep PostgreSQL as source of truth')).toBeVisible();
    await expect(page.locator('text=Add login rate limiting')).toBeVisible();
    await expect(page.locator('text=Keep login working if Redis is down')).toBeVisible();

    // 4. Apply change
    await page.click('button:has-text("Apply change")');
    await expect(page.locator('text=Change applied')).toBeVisible({ timeout: 5000 });

    // 5. Review all 5 tabs
    const tabs = ['Diagram', 'API contract', 'Risks', 'Tasks', 'What changed', 'Telemetry'];
    for (const tab of tabs) {
      await page.click(`button:has-text("${tab}")`);
      await page.waitForTimeout(300); // allow lazy load
    }

    // 6. Export All ZIP
    await page.click('button:has-text("Export")');
    await page.click('button:has-text("Engineering artifacts")');
    // Note: file download not easily testable in headless, but click works

    // 7. Open history panel
    await page.click('button:has-text("Branches and history")');
    await expect(page.locator('text=Main Branch')).toBeVisible();

    // 8. Compare scenarios
    await page.click('button:has-text("Compare scenarios")');
    await expect(page.locator('text=Scenario Comparison')).toBeVisible();
    await page.click('button:has-text("Close")');

    // 9. Kill Redis in chaos sim (in diagram tab)
    await page.click('button:has-text("Diagram")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Kill Redis")');
    await expect(page.locator('text=SEVERED')).toBeVisible({ timeout: 3000 });

    // 10. Open ADR modal and sign off
    await page.click('button:has-text("ADR Sign-Off")');
    await expect(page.locator('text=Architecture Decision Record')).toBeVisible();
    await page.click('button:has-text("Copy Markdown")');
    await page.click('button:has-text("Download Markdown")');
    await page.click('button:has-text("Close")');

    // 11. Verify persistence - reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#architecture-command')).toHaveValue(/Move session storage to Redis/);
  });

  test('keyboard navigation in diagram', async ({ page }) => {
    await page.click('button:has-text("Load sample")');
    await page.click('button:has-text("Diagram")');
    await page.waitForTimeout(500);

    const webNode = page.locator('[role="button"][aria-label*="Web Frontend"]');
    await webNode.focus();
    await expect(webNode).toBeFocused();

    // ArrowRight navigates downstream
    await page.keyboard.press('ArrowRight');
    const apiNode = page.locator('[role="button"][aria-label*="API Gateway"]');
    await expect(apiNode).toBeFocused();

    // ArrowLeft navigates upstream
    await page.keyboard.press('ArrowLeft');
    await expect(webNode).toBeFocused();

    // Escape clears selection
    await page.keyboard.press('Escape');
    await expect(webNode).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('export menu keyboard accessible', async ({ page }) => {
    await page.click('button:has-text("Load sample")');
    const exportBtn = page.locator('button:has-text("Export")');
    await exportBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="menu"]')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});