import { test, expect } from '@playwright/test';

test('File buttons are visible without opening Tools and the Note column is removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#noteHeader')).toHaveCount(0);
  await expect(page.locator('#calcbody td')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Import / Export', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export to Excel', exact: true })).toBeVisible();
  await expect(page.locator('.dropdown-menu #btn_import_export')).toHaveCount(0);
  await page.getByRole('button', { name: 'Import / Export', exact: true }).click();
  await expect(page.locator('#importExportArea')).toBeVisible();
});

test('Extended palette and custom color persist through splits and sharing', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Change Colors »').click();
  await expect(page.locator('#color_palette [id^="palette_picker_"]')).toHaveCount(24);
  await page.getByRole('button', { name: 'Color 24', exact: true }).click();
  await page.locator('.row_address').click();
  await expect(page.locator('#calcbody tr')).toHaveCSS('background-color', 'rgb(215, 204, 200)');
  await page.locator('#custom_color').fill('#12ab89');
  await page.locator('.row_address').click();
  await expect(page.locator('#calcbody tr')).toHaveCSS('background-color', 'rgb(18, 171, 137)');
  await page.locator('.block-note').fill('Retained note');
  await page.getByRole('button', { name: 'Split 10.0.0.0/16', exact: true }).click();
  for (const row of await page.locator('#calcbody tr').all()) {
    await expect(row).toHaveCSS('background-color', 'rgb(18, 171, 137)');
  }
  await page.getByText('« Stop Changing Colors').click();
  const url = await page.evaluate(() => (window as any).getConfigUrl());
  await page.goto(url);
  await expect(page.locator('#calcbody tr').first()).toHaveCSS('background-color', 'rgb(18, 171, 137)');
  await expect(page.locator('td.join input')).toHaveValue('Retained note');
});
