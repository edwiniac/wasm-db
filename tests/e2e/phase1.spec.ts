import { test, expect } from '@playwright/test';

test.describe('Phase 1 — basic UI', () => {
  test('page loads with URL input and Run button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Parquet file URL')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run query' })).toBeVisible();
  });

  test('Run button is disabled when URL is empty', async ({ page }) => {
    await page.goto('/');
    const runBtn = page.getByRole('button', { name: 'Run query' });
    await expect(runBtn).toBeDisabled();
  });

  test('Load button is disabled when URL is empty', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Load' })).toBeDisabled();
  });

  test('Load button enables after typing a URL', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill('http://localhost:5173/fixtures/tiny.parquet');
    await expect(page.getByRole('button', { name: 'Load' })).toBeEnabled();
  });

  test('SQL editor is visible and contains default query', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByLabel('SQL editor');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('SELECT');
  });

  test('URL auto-populates the SQL query template', async ({ page }) => {
    await page.goto('/');
    const url = 'http://localhost:5173/fixtures/tiny.parquet';
    await page.getByLabel('Parquet file URL').fill(url);
    const editor = page.getByLabel('SQL editor');
    await expect(editor).toContainText(url);
  });

  test('status bar shows Ready on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Ready')).toBeVisible();
  });
});
