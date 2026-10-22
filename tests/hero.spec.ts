import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// The hero's layout: from 1280px the product card and the decorations sit in the gutters
// beside the text, below that the card follows the note in flow. Nothing may overlap the
// headline, description, actions, or note, and nothing may be cut off by the first screen.
const DESKTOP: Array<[width: number, height: number]> = [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 940], [1920, 1080]];

interface Box { left: number; top: number; right: number; bottom: number }

/** Boxes of the text containers (not the aria-hidden word spans inside the h1) and of every visible gutter item. */
function heroBoxes(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      if (!el) return null;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    };
    const one = (selector: string) => box(document.querySelector(selector));
    return {
      content: {
        h1: one('#va-hero-title'),
        description: one('.va-hero-description'),
        actions: one('.va-hero-actions'),
        note: one('.va-hero-note'),
      },
      card: one('.va-proof'),
      // From 1280px the card is in the right gutter; below that, and in windows too short for it, it is in flow.
      cardInGutter: (() => {
        const el = document.querySelector('.va-proof');
        return el ? getComputedStyle(el).gridColumnStart === '3' : false;
      })(),
      decorations: [...document.querySelectorAll('.va-frags .va-frag')].map(box).filter((b): b is Box => b !== null),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = (a: Box, vw: number, vh: number) => a.left >= 0 && a.top >= 0 && a.right <= vw && a.bottom <= vh;

for (const scheme of ['light', 'dark'] as const) {
  test(`on desktop sizes the gutter items never overlap the text or leave the first screen (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: DESKTOP[0]![0], height: DESKTOP[0]![1] });
    await page.goto('/');
    await expect(page.locator('.va-proof')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of DESKTOP) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const size = `${width}x${height}`;
      const { content, card, cardInGutter, decorations, overflow, viewport } = await heroBoxes(page);
      expect(overflow, `${size}: horizontal overflow`).toBeLessThanOrEqual(0);
      for (const [name, b] of Object.entries(content)) expect(b, `${size}: ${name} is rendered`).not.toBeNull();
      expect(card, `${size}: product card is rendered`).not.toBeNull();
      expect(decorations.length, `${size}: at most 3 decorations besides the card`).toBeLessThanOrEqual(3);
      for (const [i, item] of [card!, ...decorations].entries()) {
        const label = i === 0 ? 'product card' : `decoration ${i}`;
        for (const [name, b] of Object.entries(content)) {
          expect(intersects(item, b!), `${size}: ${label} overlaps the ${name}`).toBe(false);
        }
        // In flow, the card is meant to be scrolled to; in the gutter it must fit the first screen.
        if (i > 0 || cardInGutter) {
          expect(inside(item, viewport.width, viewport.height), `${size}: ${label} is cut off (${JSON.stringify(item)})`).toBe(true);
        }
      }
    }
  });
}

test('on a phone the badge fits one line and the product card follows the note in flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.va-proof')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const { content, card, cardInGutter, decorations, overflow } = await heroBoxes(page);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(content.note).not.toBeNull();
  expect(cardInGutter).toBe(false);
  expect(decorations).toEqual([]);
  expect(card).not.toBeNull();
  expect(card!.top, 'the card comes after the note').toBeGreaterThanOrEqual(content.note!.bottom);
  expect(await page.locator('.va-proof').evaluate((el) => getComputedStyle(el).position)).toBe('static');

  const badgeLines = await page.locator('.va-hero-eyebrow').evaluate((el) => {
    const style = getComputedStyle(el);
    const inner = el.getBoundingClientRect().height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
    return Math.round(inner / parseFloat(style.lineHeight));
  });
  expect(badgeLines).toBe(1);
  await expect(page.locator('.va-hero-eyebrow')).toHaveText(/^\s*Built for Wispr Flow\s*$/, { useInnerText: true });
});

test('the headline and the product card keep their accessible names', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Say the change. See what it touches.');
  await expect(page.getByRole('figure', { name: 'Example: a Hinglish instruction becomes a reviewed change' })).toBeVisible();
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the product card shows the finished change, with nothing animating', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.va-proof');
    await expect(card).toBeVisible();
    await expect(card.locator('.va-proof-said')).toHaveText('payment service ko alag container mein daalo aur gateway se connect karo');
    expect(await card.locator('.va-proof-ghost').textContent()).toBe('');
    await expect(card.locator('.va-story-diff li')).toHaveText(['+ payment-service (new service, own container)', '+ gateway → payment-service']);
    await expect(card.locator('.va-story-diff li[data-hidden]')).toHaveCount(0);
    await expect(card.locator('.va-story-actions .is-primary')).toHaveText('“apply”');
    // Still final, and still nothing running, a few seconds later.
    await page.waitForTimeout(1500);
    expect(await card.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(card.locator('.va-story-diff li[data-hidden]')).toHaveCount(0);
  });
});
