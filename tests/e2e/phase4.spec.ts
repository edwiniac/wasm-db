import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 4 — URL sharing', () => {
  test('share button is visible and enabled after URL is entered', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    const shareBtn = page.getByRole('button', { name: /share/i });
    await expect(shareBtn).toBeVisible();
    await expect(shareBtn).toBeEnabled();
  });

  test('navigating to a shared URL auto-probes and shows schema tree', async ({ page }) => {
    const sql = `SELECT *\nFROM parquet_scan('${FIXTURE_URL}')\nLIMIT 100`;
    const hash = new URLSearchParams({ url: FIXTURE_URL, q: sql }).toString();
    await page.goto(`/#${hash}`);
    // URL input must be populated immediately from hash
    await expect(page.getByLabel('Parquet file URL')).toHaveValue(FIXTURE_URL);
    // Auto-probe fires — schema tree should appear without the user clicking Load
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30000 });
  });

  test('drift banner appears when sf param does not match live schema', async ({ page }) => {
    // 'ffffffff' is a deliberate wrong fingerprint — actual tiny.parquet fingerprint differs
    const hash = new URLSearchParams({ url: FIXTURE_URL, sf: 'ffffffff' }).toString();
    await page.goto(`/#${hash}`);
    // Auto-probe + schema load → drift detected → banner shown
    await expect(page.getByText(/schema has changed/i)).toBeVisible({ timeout: 30000 });
  });
});
