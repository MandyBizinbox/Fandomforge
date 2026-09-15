const { test, expect } = require('@playwright/test');

const routes = [
  ['/', /FandomForge|merch/i],
  ['/faq', /frequently|questions|faq/i],
  ['/creator-onboarding', /creator|store/i],
  ['/creators/creator-integrity-store', /Creator Integrity Store/i],
];

for (const [route, text] of routes) {
  test(`mobile route ${route} is readable without horizontal overflow`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toContainText(text);
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      cards: Array.from(document.querySelectorAll('.card')).map((node) => ({
        left: node.getBoundingClientRect().left,
        right: node.getBoundingClientRect().right,
      })),
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    for (const card of dimensions.cards) {
      expect(card.left).toBeGreaterThanOrEqual(-1);
      expect(card.right).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    }
  });
}
