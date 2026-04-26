import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 3 — schema explorer', () => {
  test('schema tree appears after probe', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /load/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30000 });
  });

  test('schema tree shows at least one column after probe', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /load/i }).click();
    const tree = page.getByLabel('Schema tree');
    await expect(tree).toBeVisible({ timeout: 30000 });
    // Column names are rendered as spans inside the tree
    await expect(tree.locator('span').first()).toBeVisible();
  });

  test('schema resets when URL is changed', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /load/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30000 });
    // Changing the URL dispatches SET_URL which clears schemaStatus → idle → SchemaTree returns null
    await page.getByLabel('Parquet file URL').fill('https://other.example.com/b.parquet');
    await expect(page.getByLabel('Schema tree')).not.toBeVisible();
  });
});
