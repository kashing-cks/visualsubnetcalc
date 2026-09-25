import { test, expect } from '@playwright/test';

// Small things that were left over: a 404 page that loaded the whole application, a Bootstrap
// script fetched from a CDN at a version its own stylesheet did not match, no canonical address,
// and an import box that threw and closed itself when the paste was not JSON.

test('The 404 page loads without a single script', async ({ page }) => {
  // It used to load jQuery, jQuery Validation, lz-string, a CDN Bootstrap and js/main.js, none of
  // which it needs, and main.js threw on elements the page does not have.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/404.html');
  await expect(page.getByRole('link', { name: 'Return to Homepage' })).toBeVisible();
  expect(await page.locator('script').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('The app loads Bootstrap from its own origin, at the version of its stylesheet', async ({ page }) => {
  // The stylesheet is built from the installed Bootstrap; the script used to come from a CDN at
  // whatever version someone last typed. Same origin, same version, no drift.
  await page.goto('/');
  const sources = await page.locator('script[src]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('src') || '')
  );
  const bootstrapScript = sources.find((src) => src.includes('bootstrap'));
  expect(bootstrapScript, 'the page still loads Bootstrap from somewhere').toBeTruthy();
  expect(bootstrapScript).not.toMatch(/^https?:/);

  const loaded = await page.evaluate(() => (window as any).bootstrap?.Tooltip?.VERSION ?? '');
  const stylesheet = await page.evaluate(async () => {
    const text = await (await fetch('css/bootstrap.min.css')).text();
    return (text.match(/v5\.[0-9]+\.[0-9]+/) || [''])[0];
  });
  expect(loaded).toBeTruthy();
  expect('v' + loaded).toBe(stylesheet);
});

test('The app names one address as canonical', async ({ page }) => {
  // The custom domain and the GitHub Pages copy serve the same page; the canonical says which one
  // should be indexed, and it is the address the Open Graph tags already name.
  await page.goto('/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://subnetcal.ckss.site/');
});

test('A paste that is not JSON says so, and keeps the undo history', async ({ page }) => {
  // The Import button is data-bs-dismiss, so the old handler threw its way out of a modal that
  // closed behind it: the page looked as though it had taken the paste. A rejected import also
  // used to wipe the history a rejected paste had not touched.
  await page.goto('/');
  const undo = page.locator('#btn_undo_design');
  await expect(undo).toBeDisabled();
  await page.getByRole('button', { name: 'Split 10.0.0.0/16' }).click();
  await expect(undo).toBeEnabled();

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    (document.getElementById('importExportArea') as HTMLTextAreaElement).value = 'not json';
    document.getElementById('importBtn')!.click();
  });

  await expect(page.locator('#notifyModalDescription')).toContainText('does not hold JSON');
  await expect(undo).toBeEnabled();
  expect(errors).toEqual([]);
});

test('An empty import box says so', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (document.getElementById('importExportArea') as HTMLTextAreaElement).value = '   ';
    document.getElementById('importBtn')!.click();
  });
  await expect(page.locator('#notifyModalDescription')).toContainText('nothing in the box to import');
});

test('A valid paste still imports, and starts a fresh history', async ({ page }) => {
  // The guard must not get in the way of the path it sits on.
  await page.goto('/');
  const undo = page.locator('#btn_undo_design');
  await page.getByRole('button', { name: 'Split 10.0.0.0/16' }).click();
  await expect(undo).toBeEnabled();

  const config = await page.evaluate(() => JSON.stringify((window as any).exportConfig(false)));
  await page.evaluate((text) => {
    (document.getElementById('importExportArea') as HTMLTextAreaElement).value = text;
    document.getElementById('importBtn')!.click();
  }, config);

  await expect(page.locator('#notifyModal')).not.toBeVisible();
  await expect(undo).toBeDisabled();
});
