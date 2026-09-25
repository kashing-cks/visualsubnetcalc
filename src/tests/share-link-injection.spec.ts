import { test, expect } from '@playwright/test';

// Share links carry a compressed JSON config. A crafted link must never be able to
// inject markup into the table: subnet keys and colours are attacker-controlled input.

async function gotoWithConfig(page, config) {
  const payload = await page.evaluate((cfg) => {
    return (
      '1' + window.LZString.compressToEncodedURIComponent(JSON.stringify(cfg))
    );
  }, config);
  await page.goto('/index.html?c=' + payload);
}

test('Crafted subnet key cannot inject markup', async ({ page }) => {
  await page.goto('/');
  await gotoWithConfig(page, {
    v: '1',
    s: { '10.0.0.0<img src=x onerror="window.__injected=1">/24': {} },
  });
  await expect(page.locator('#calcbody img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  // The invalid entry is rejected instead of being rendered.
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'invalid subnet entries'
  );
});

test('Crafted subnet key cannot inject an event handler attribute', async ({
  page,
}) => {
  await page.goto('/');
  await gotoWithConfig(page, {
    v: '1',
    s: { '10.0.0.0" onmouseover="window.__injected=2/24': {} },
  });
  await expect(page.locator('#calcbody [onmouseover]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
});

test('Crafted row colour cannot inject an event handler attribute', async ({
  page,
}) => {
  await page.goto('/');
  await gotoWithConfig(page, {
    v: '1',
    s: { '10.0.0.0/24': { _c: 'red" onmouseover="window.__injected=3' } },
  });
  await expect(page.locator('#calcbody [onmouseover]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  // The design still renders, just without the invalid colour.
  await expect(
    page.getByLabel('10.0.0.0/24', { exact: true }).getByLabel('Subnet Address')
  ).toContainText('10.0.0.0/24');
});

test('A rejected config still renders a usable table', async ({ page }) => {
  await page.goto('/');
  await gotoWithConfig(page, {
    v: '1',
    s: { '10.0.0.0<img src=x onerror="window.__injected=4">/24': {} },
  });
  // The page must not be stranded on the "Loading..." placeholder row.
  await expect(page.locator('#calcbody')).not.toContainText('Loading');
  await expect(
    page.getByLabel('10.0.0.0/16', { exact: true }).getByLabel('Subnet Address')
  ).toContainText('10.0.0.0/16');
  await expect(page.getByLabel('Network Address')).toHaveValue('10.0.0.0');
  await expect(page.getByLabel('Network Size')).toHaveValue('16');
  // The rejected key must not leak into the boundary-correction modal either.
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'invalid subnet entries'
  );
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  // And the design is still editable once the warning is dismissed.
  await page.locator('#notifyModal .btn-close').click();
  // A modal that is still fading out leaves a backdrop over the table, and the backdrop swallows
  // the next click for as long as it is there.
  await expect(page.locator('.modal.show')).toHaveCount(0);
  await page.locator('#calcbody td.split .subnet-action').first().click();
  await expect(page.locator('#calcbody tr')).toHaveCount(2);
});

test('A valid share link still renders after validation', async ({ page }) => {
  await page.goto('/');
  await gotoWithConfig(page, {
    v: '2',
    b: '10.0.0.0/24',
    s: { '0o': { n: 'DMZ' } },
  });
  await expect(
    page.getByLabel('10.0.0.0/24', { exact: true }).getByLabel('Subnet Address')
  ).toContainText('10.0.0.0/24');
  await expect(
    page.getByRole('textbox', { name: '10.0.0.0/24 Split Note', exact: true })
  ).toHaveValue('DMZ');
});
