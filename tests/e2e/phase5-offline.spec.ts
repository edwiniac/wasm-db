import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 5 — offline mode', () => {
  test('offline badge appears in StatusBar when network is cut', async ({ page, context }) => {
    await page.goto('/');
    // Confirm no badge when online.
    await expect(page.getByLabel('offline')).not.toBeVisible({ timeout: 5_000 });

    await context.setOffline(true);
    await expect(page.getByLabel('offline')).toBeVisible({ timeout: 5_000 });
  });

  test('offline badge disappears when network is restored', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);
    await expect(page.getByLabel('offline')).toBeVisible({ timeout: 5_000 });

    await context.setOffline(false);
    await expect(page.getByLabel('offline')).not.toBeVisible({ timeout: 5_000 });
  });

  test('cached Parquet query runs while offline', async ({ page, context, browserName }) => {
    test.skip(
      browserName === 'chromium' || browserName === 'webkit',
      'DuckDB-WASM uses XHR internally on Chromium — SW cannot intercept XHR from blob-URL workers; webkit untested due to missing system dependency',
    );

    await page.goto('/');

    // Load the fixture file and run a query twice to warm all SW range cache entries.
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // First query run — primes range cache.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

    // Second query run — ensures all needed ranges are cached.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

    // Cut the network.
    await context.setOffline(true);
    await expect(page.getByLabel('offline')).toBeVisible({ timeout: 5_000 });

    // Query should still succeed from SW range cache.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async ({ context }) => {
    await context.setOffline(false);
  });
});
