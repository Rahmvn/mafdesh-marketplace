import { expect, test } from '@playwright/test';

async function gotoApp(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

test.describe('Smoke Routes', () => {
  test('loads the login page', async ({ page }) => {
    await gotoApp(page, '/login');

    await expect(page.getByRole('button', { name: /login to mafdesh/i })).toBeVisible();
    await expect(page.getByText(/welcome back! please login to continue/i)).toBeVisible();
  });

  test('loads the terms page', async ({ page }) => {
    await gotoApp(page, '/terms');

    await expect(page.getByRole('heading', { name: /terms & conditions/i })).toBeVisible();
    await expect(page.getByText(/acceptance of terms/i)).toBeVisible();
  });

  test('redirects unauthenticated users away from support', async ({ page }) => {
    await gotoApp(page, '/support');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: /login to mafdesh/i })).toBeVisible();
  });

  test('redirects unauthenticated users away from admin users', async ({ page }) => {
    await gotoApp(page, '/admin/users');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: /login to mafdesh/i })).toBeVisible();
  });
});
