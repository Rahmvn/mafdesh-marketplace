/* global process */
import { expect, test } from '@playwright/test';

const AUTH_ENV = {
  buyerEmail: process.env.E2E_AUTH_EMAIL_BUYER,
  buyerPassword: process.env.E2E_AUTH_PASSWORD_BUYER,
  sellerEmail: process.env.E2E_AUTH_EMAIL_SELLER,
  sellerPassword: process.env.E2E_AUTH_PASSWORD_SELLER,
  adminEmail: process.env.E2E_AUTH_EMAIL_ADMIN,
  adminPassword: process.env.E2E_AUTH_PASSWORD_ADMIN,
};

const hasAuthSmokeEnv = Object.values(AUTH_ENV).every(Boolean);

test.describe('Auth Smoke', () => {
  test.skip(!hasAuthSmokeEnv, 'Set E2E auth credentials to run live auth smoke.');

  async function login(page, { email, password, role = 'buyer', initialPath = '/login' }) {
    await page.goto(initialPath, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: new RegExp(role, 'i') }).click();
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /login to mafdesh/i }).click();
  }

  test('buyer login succeeds and lands on the marketplace', async ({ page }) => {
    await login(page, {
      email: AUTH_ENV.buyerEmail,
      password: AUTH_ENV.buyerPassword,
      role: 'buyer',
    });

    await expect(page).toHaveURL(/\/marketplace$/);
  });

  test('seller login succeeds and lands on the seller dashboard', async ({ page }) => {
    await login(page, {
      email: AUTH_ENV.sellerEmail,
      password: AUTH_ENV.sellerPassword,
      role: 'seller',
    });

    await expect(page).toHaveURL(/\/seller\/dashboard$/);
  });

  test('admin login succeeds and lands on the admin dashboard', async ({ page }) => {
    await login(page, {
      email: AUTH_ENV.adminEmail,
      password: AUTH_ENV.adminPassword,
      role: 'admin',
    });

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test('guest-to-login-to-return preserves the original protected destination', async ({ page }) => {
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fsupport$/);

    await page.getByRole('button', { name: /buyer/i }).click();
    await page.getByLabel(/email address/i).fill(AUTH_ENV.buyerEmail);
    await page.getByLabel(/password/i).fill(AUTH_ENV.buyerPassword);
    await page.getByRole('button', { name: /login to mafdesh/i }).click();

    await expect(page).toHaveURL(/\/support$/);
  });

  test('admin route protection redirects non-admin users back out after login', async ({ page }) => {
    await login(page, {
      email: AUTH_ENV.sellerEmail,
      password: AUTH_ENV.sellerPassword,
      role: 'seller',
      initialPath: '/login?returnUrl=%2Fadmin%2Fdashboard',
    });

    await expect(page).toHaveURL(/\/seller\/dashboard$/);
  });
});
