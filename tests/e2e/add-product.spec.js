/* global process */
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SELLER_AUTH_ENV = {
  email: process.env.E2E_AUTH_EMAIL_SELLER,
  password: process.env.E2E_AUTH_PASSWORD_SELLER,
};

const hasSellerAuthEnv = Object.values(SELLER_AUTH_ENV).every(Boolean);

async function loginSeller(page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /seller/i }).click();
  await page.getByLabel(/email address/i).fill(SELLER_AUTH_ENV.email);
  await page.getByLabel(/password/i).fill(SELLER_AUTH_ENV.password);
  await page.getByRole('button', { name: /login to mafdesh/i }).click();
  await expect(page).toHaveURL(/\/seller\/dashboard$/);
}

test.describe('Seller add-product preview flow', () => {
  test.skip(!hasSellerAuthEnv, 'Set seller E2E auth credentials to run live add-product preview smoke.');

  test('seller can reach the buyer-facing preview after completing the visible form', async ({ page }) => {
    const productName = `E2E Preview Headphones ${Date.now()}`;
    const imagePaths = [
      path.resolve('mafdesh-img/landscape-logo-removebg-preview.png'),
      path.resolve('mafdesh-img/noBackground-logo.png'),
      path.resolve('mafdesh-img/portrait-logo-removebg-preview.png'),
    ];

    await loginSeller(page);

    await page.goto('/seller/products/new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /add new product/i })).toBeVisible();

    await page.locator('input[name="name"]').fill(productName);
    await page.getByPlaceholder('Search categories...').click();
    await page.getByPlaceholder('Search categories...').fill('Electronics');
    await page.getByRole('button', { name: /^Electronics$/ }).click();
    await page.locator('input[name="marketPrice"]').fill('20000');
    await page.locator('input[name="stock"]').fill('8');
    await page.getByRole('button', { name: /^Next$/ }).click();

    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.nth(0).setInputFiles(imagePaths[0]);
    await fileInputs.nth(1).setInputFiles(imagePaths[1]);
    await fileInputs.nth(2).setInputFiles(imagePaths[2]);
    await page.getByRole('button', { name: /^Next$/ }).click();

    await page.getByPlaceholder('e.g. Samsung, Apple, Tecno').fill('Sony');
    await page.getByPlaceholder('e.g. Galaxy S24').fill('WH-1000XM5');
    await page.locator('select').first().selectOption('Brand New');
    await page
      .getByPlaceholder('List the most important features and details, one per line')
      .fill(
        'Active noise cancellation for travel.\nLong battery life for daily use.\nClear calls and balanced sound.'
      );

    await page.getByRole('button', { name: /preview product/i }).click();

    await expect(page).toHaveURL(/\/seller\/products\/add\/preview$/);
    await expect(page.getByRole('heading', { name: /preview product/i })).toBeVisible();
    await expect(page.getByText(productName)).toBeVisible();
    await expect(page.getByText(/buyer-facing preview/i)).toBeVisible();
  });
});
