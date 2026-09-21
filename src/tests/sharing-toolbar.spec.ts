import { test, expect } from '@playwright/test';

test('Copied URL preserves a GitHub Pages subdirectory and restores the design', async ({ page, context }) => {
  // Serve the actual app at a project path, as GitHub Pages does.
  await context.route('**/visualsubnetcalc/**', async route => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace('/visualsubnetcalc/', '/');
    const response = await route.fetch({ url: url.href });
    await route.fulfill({ response });
  });
  await page.goto('/visualsubnetcalc/');
  await page.locator('td.split input').fill('香港 VPC');
  await page.getByRole('button', { name: 'Split 10.0.0.0/16', exact: true }).click();
  await page.locator('td.split input').first().fill('Production');
  await page.getByRole('button', { name: 'Copy Shareable URL', exact: true }).click();
  await expect(page.locator('#copy_url')).toHaveText('Copied!');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).pathname).toBe('/visualsubnetcalc/index.html');
  await page.goto(url);
  await expect(page.locator('td.join input')).toHaveValue('香港 VPC');
  await expect(page.locator('td.split input').first()).toHaveValue('Production');
  await page.getByRole('button', { name: 'Copy Shareable URL', exact: true }).click();
  await expect(page.locator('#copy_url')).toHaveText('Copied!');
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname).toBe('/visualsubnetcalc/index.html');
});

test('Copy waits for success and shows a selected link when clipboard access is denied', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: () => new Promise((resolve, reject) => { (window as any).rejectCopy = reject; })
    } });
    document.execCommand = () => false;
  });
  await page.getByRole('button', { name: 'Copy Shareable URL', exact: true }).click();
  await expect(page.locator('#copy_url')).toHaveText('Copying…');
  await expect(page.locator('#copy_url')).toBeDisabled();
  await page.evaluate(() => (window as any).rejectCopy(new Error('Denied')));
  await expect(page.locator('#share_status')).toContainText('Automatic copy is unavailable');
  await expect(page.locator('#share_url')).toBeVisible();
  await expect(page.locator('#share_url')).toBeFocused();
  expect(await page.locator('#share_url').evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!)).toBe((await page.locator('#share_url').inputValue()).length);
  await expect(page.locator('#copy_url')).toHaveText('Copy Shareable URL');
});

test('Missing clipboard API uses the legacy copy fallback', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.getByRole('button', { name: 'Copy Shareable URL', exact: true }).click();
  await expect(page.locator('#copy_url')).toHaveText('Copied!');
  await expect(page.locator('#share_fallback')).toBeHidden();
});

test('Palette is keyboard accessible and stops painting when closed', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Change Colors', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const swatch = page.getByRole('button', { name: 'Color 1', exact: true });
  await swatch.focus();
  await swatch.press('Space');
  await expect(swatch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#color_hint')).toContainText('#FFADAD');
  await page.locator('.row_address').click();
  await expect(page.locator('#calcbody tr')).toHaveCSS('background-color', 'rgb(255, 173, 173)');
  await page.locator('#custom_color').fill('#12ab89');
  await page.getByRole('button', { name: 'Stop Changing Colors', exact: true }).click();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.locator('.row_address').click();
  await expect(page.locator('#calcbody tr')).toHaveCSS('background-color', 'rgb(255, 173, 173)');
});

test('Zoom-sized viewports reflow toolbar and proportionally scale custom columns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const handle = page.getByRole('separator', { name: 'Resize /16 Note', exact: true });
  await handle.focus();
  for (let i = 0; i < 8; i++) await handle.press('Shift+ArrowRight');
  const before = Number(await handle.getAttribute('aria-valuenow'));
  const container = await page.locator('.table-responsive').evaluate(el => el.clientWidth);
  await page.setViewportSize({ width: 960, height: 600 });
  const smaller = await page.locator('.table-responsive').evaluate(el => el.clientWidth);
  await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round(before * smaller / container)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(handle).toHaveAttribute('aria-valuenow', String(before));
  await page.getByRole('button', { name: 'Change Colors', exact: true }).click();
  for (const width of [720, 480, 375, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(page.getByRole('button', { name: 'Copy Shareable URL', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const button of await page.locator('.design-actions button, #color_palette [role="button"], #color_palette button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
});
