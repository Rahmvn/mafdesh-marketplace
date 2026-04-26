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

  test('loads the cart page for guests', async ({ page }) => {
    await gotoApp(page, '/cart');

    await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible();
    await expect(page.getByText(/your cart is empty/i)).toBeVisible();
  });

  test('shows the login-required modal for unauthenticated support access', async ({ page }) => {
    await gotoApp(page, '/support');

    await expect(page.getByText(/please login to continue/i)).toBeVisible();
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fsupport$/);
    await expect(page.getByRole('button', { name: /login to mafdesh/i })).toBeVisible();
  });

  test('shows the login-required modal for unauthenticated admin access', async ({ page }) => {
    await gotoApp(page, '/admin/users');

    await expect(page.getByText(/please login to continue/i)).toBeVisible();
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fadmin%2Fusers$/);
    await expect(page.getByRole('button', { name: /login to mafdesh/i })).toBeVisible();
  });

  test('offers sign up when a guest opens profile', async ({ page }) => {
    await gotoApp(page, '/profile');

    await expect(page.getByText(/please log in or create an account to view your profile/i)).toBeVisible();
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });
});
