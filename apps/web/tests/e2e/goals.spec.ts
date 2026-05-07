import { test, expect } from '@playwright/test';

test('goal appears in UI after authenticated creation', async ({ page, request }) => {
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:3000';

  // Login via API to obtain cookie
  const loginResp = await request.post(`${API}/api/auth/login`, {
    data: { email: 'ceo@test.orgos.ai', password: 'ceo@test.orgos.ai' }
  });
  expect(loginResp.ok()).toBeTruthy();

  const setCookie = loginResp.headers()['set-cookie'];
  // Extract the access token cookie value
  let tokenValue = '';
  if (setCookie) {
    const match = /orgos_access_token=([^;]+)/.exec(setCookie);
    if (match) tokenValue = match[1];
  }
  expect(tokenValue).not.toBe('');

  // Set cookie in browser context
  await page.context().addCookies([{ name: 'orgos_access_token', value: decodeURIComponent(tokenValue), domain: 'localhost', path: '/' }]);

  // Navigate to goals page
  await page.goto(`${WEB}/dashboard/goals`);

  // The page should show the recently created E2E Test Goal (created by CI script)
  const goal = page.getByText('E2E Test Goal');
  await expect(goal).toBeVisible({ timeout: 10000 });
});
