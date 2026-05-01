import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 5 — visual query builder', () => {
  test('clicking a schema column inserts its name into the SQL editor', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Read the first column name from the data attribute and click its row.
    const firstRow = page.getByLabel('Schema tree').locator('[data-column]').first();
    const colName = await firstRow.getAttribute('data-column');
    await firstRow.click();

    // The column name should now appear in the editor content.
    await expect(page.locator('.cm-content')).toContainText(colName!, { timeout: 5_000 });
  });

  test('clicking a result cell inserts a WHERE filter into the SQL editor', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Run the default query to populate the results table.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

    // Click the first data cell in the results table.
    await page.getByRole('table').locator('tbody tr:first-child td:first-child').click();

    // The editor should now contain a WHERE or AND clause.
    await expect(page.locator('.cm-content')).toContainText(/WHERE|AND/i, { timeout: 5_000 });
  });
});
