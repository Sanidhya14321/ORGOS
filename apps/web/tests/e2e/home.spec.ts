import { test, expect } from '@playwright/test';

test('homepage loads and shows main layout', async ({ page, baseURL }) => {
  await page.goto('/');
  // basic smoke: title contains expected app name or next default
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);

  // ensure main element exists
  const main = page.locator('main');
  await expect(main).toBeVisible();
});
