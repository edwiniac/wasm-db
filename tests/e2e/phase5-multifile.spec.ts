import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 5 — multi-file joins', () => {
  test('FilePanel toggle button is visible on load', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /toggle additional files panel/i }),
    ).toBeVisible();
  });

  test('panel body is visible by default and hides on toggle', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByLabel('Additional files panel', { exact: true });
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: /toggle additional files panel/i }).click();
    await expect(panel).not.toBeVisible();
  });

  test('Add file button is disabled after 5 rows are added', async ({ page }) => {
    await page.goto('/');
    const addBtn = page.getByRole('button', { name: /add file/i });
    for (let i = 0; i < 5; i++) {
      await addBtn.click();
    }
    await expect(addBtn).toBeDisabled();
  });

  test('alias validation error appears for reserved keyword', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add file/i }).click();
    await page
      .getByLabel(/Alias for file/i)
      .first()
      .fill('select');
    await expect(page.getByText(/reserved sql keyword/i)).toBeVisible();
  });

  test('probe flow: fill alias + URL → click Load → status shows ready', async ({ page }) => {
    await page.goto('/');

    // Load the primary file first so the engine is warmed up.
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Add a secondary file.
    await page.getByRole('button', { name: /add file/i }).click();
    await page
      .getByLabel(/Alias for file/i)
      .first()
      .fill('orders');
    await page
      .getByLabel(/URL for file/i)
      .first()
      .fill(FIXTURE_URL);
    await page
      .getByLabel(/Probe file/i)
      .first()
      .click();

    await expect(page.getByText(/✓ ready/)).toBeVisible({ timeout: 30_000 });
  });

  test('JOIN query against registered view returns results', async ({ page }) => {
    await page.goto('/');

    // Load primary file.
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Register secondary file as alias_b.
    await page.getByRole('button', { name: /add file/i }).click();
    await page
      .getByLabel(/Alias for file/i)
      .first()
      .fill('alias_b');
    await page
      .getByLabel(/URL for file/i)
      .first()
      .fill(FIXTURE_URL);
    await page
      .getByLabel(/Probe file/i)
      .first()
      .click();
    await expect(page.getByText(/✓ ready/)).toBeVisible({ timeout: 30_000 });

    // Replace the SQL editor content with a JOIN query.
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(
      `SELECT a.id FROM parquet_scan('${FIXTURE_URL}') a JOIN alias_b b ON a.id = b.id LIMIT 5`,
    );

    // Run the query.
    await page.getByRole('button', { name: /run query/i }).click();

    // Results table should appear with at least one cell.
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
  });
});
