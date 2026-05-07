import { test, expect, type Page } from '@playwright/test';

async function loginAsCeo(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('ceo@test.orgos.ai');
  await page.getByPlaceholder('Your password').fill('ceo@test.orgos.ai');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test('projects page links goals to task board and opens the selected task', async ({ page }) => {
  await loginAsCeo(page);

  await page.goto('/dashboard/projects');

  await expect(page.getByRole('heading', { name: 'Projects, Goals, and Tasks' })).toBeVisible();
  await expect(page.getByText('Project map')).toBeVisible();

  const inspectLink = page.getByRole('link', { name: 'Inspect' }).first();
  await expect(inspectLink).toBeVisible();
  await inspectLink.click();

  await expect(page).toHaveURL(/\/dashboard\/task-board\?goalId=.*taskId=.*/);
  await expect(page.getByText('Execution focus')).toBeVisible();
  await expect(page.getByText('Task drawer open')).toBeVisible();
});

test('task board ignores malformed query params and still renders normally', async ({ page }) => {
  await loginAsCeo(page);

  await page.goto('/dashboard/task-board?goalId=not-a-uuid&taskId=bad-value');

  await expect(page.getByText('Execution focus')).toBeVisible();
  await expect(page.getByPlaceholder('Search tasks')).toBeVisible();
  await expect(page.getByText('Invalid query params')).toHaveCount(0);
});