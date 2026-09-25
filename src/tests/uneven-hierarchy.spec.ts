import { test, expect } from '@playwright/test';

// A configuration can nest unevenly: a /24 that holds /28s directly skips /25 to /27.
// renderTableColumns() derives its columns from maxNetSize and maxDepth, so those prefixes
// have no column and the render must cope with that.

const UNEVEN = {
  config_version: '2',
  operating_mode: 'AWS',
  base_network: '10.0.0.0/24',
  subnets: { '10.0.0.0/24': { '10.0.0.0/28': {}, '10.0.0.16/28': {} } },
};

async function importConfig(page, config) {
  await page.evaluate((cfg) => {
    document.getElementById('importExportArea').value = JSON.stringify(cfg);
    document.getElementById('importBtn').click();
  }, config);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('An uneven hierarchy renders without throwing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await importConfig(page, UNEVEN);
  await expect(page.locator('#calcbody tr')).toHaveCount(2);
  await expect(page.locator('#calcbody')).not.toContainText('Loading');
  expect(errors).toEqual([]);
});

test('An uneven hierarchy still applies its operating mode', async ({
  page,
}) => {
  await importConfig(page, UNEVEN);
  // The render used to abort part-way through, which also skipped the mode UI update.
  expect(await page.evaluate(() => operatingMode)).toBe('AWS');
  await expect(page.locator('#dropdown_aws')).toHaveClass(/active/);
  await expect(page.locator('#dropdown_standard')).not.toHaveClass(/active/);
  await expect(page.locator('#useableHeader')).toContainText('AWS');
});

test('An uneven hierarchy shows the correct usable range', async ({
  page,
}) => {
  await importConfig(page, UNEVEN);
  await expect(
    page.getByLabel('10.0.0.0/28', { exact: true }).getByLabel('Usable IPs')
  ).toContainText('10.0.0.4 - 10.0.0.14');
});

test('An uneven hierarchy is still editable', async ({ page }) => {
  await importConfig(page, UNEVEN);
  const note = page.getByRole('textbox', {
    name: '10.0.0.0/28 Split Note',
    exact: true,
  });
  await note.fill('DMZ');
  await expect(note).toHaveValue('DMZ');
});

test('A share link with an uneven hierarchy loads too', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Version 1 payloads carry full CIDR keys, so they can express an uneven tree directly.
  // Share links use the minified key names: v = config_version, s = subnets, m = operating_mode.
  const payload = await page.evaluate((cfg) => {
    return (
      '1' +
      window.LZString.compressToEncodedURIComponent(
        JSON.stringify({ v: '1', m: cfg.operating_mode, s: cfg.subnets })
      )
    );
  }, UNEVEN);
  await page.goto('/index.html?c=' + payload);
  await expect(page.locator('#calcbody tr')).toHaveCount(2);
  expect(errors).toEqual([]);
});
