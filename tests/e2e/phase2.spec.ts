import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 2 — state persistence', () => {
  test('parquetURL persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.reload();
    await expect(page.getByLabel('Parquet file URL')).toHaveValue(FIXTURE_URL);
  });

  test('custom SQL query persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.waitForTimeout(100);
    const editor = page.getByLabel('SQL editor');
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type("SELECT id FROM parquet_scan('" + FIXTURE_URL + "') LIMIT 1");
    await page.reload();
    await expect(editor).toContainText('SELECT id');
  });

  test('status resets to Ready after reload (not persisted)', async ({ page }) => {
    await page.goto('/');
    await page.reload();
    await expect(page.getByText('Ready')).toBeVisible();
  });

  test('results are empty after reload (not persisted)', async ({ page }) => {
    await page.goto('/');
    await page.reload();
    await expect(page.locator('table')).not.toBeVisible();
  });
});
