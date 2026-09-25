import { test, expect } from '@playwright/test';

// Importing a configuration whose subnets are too small for its operating mode must not
// leave the module state, the visible mode and the table disagreeing with each other.

async function importConfig(page, config) {
  await page.evaluate((cfg) => {
    document.getElementById('importExportArea').value = JSON.stringify(cfg);
    document.getElementById('importBtn').click();
  }, config);
}

// operatingMode is a top-level `let`, so it lives in the global lexical scope rather than
// on window; it has to be read as a bare identifier.
async function currentMode(page) {
  return page.evaluate(() => operatingMode);
}

const AWS_WITH_TINY_SUBNETS = {
  config_version: '2',
  operating_mode: 'AWS',
  base_network: '10.0.0.0/24',
  subnets: { '10.0.0.0/24': { '10.0.0.0/30': {}, '10.0.0.4/30': {} } },
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('A rejected mode leaves the app in the mode the UI shows', async ({
  page,
}) => {
  await importConfig(page, AWS_WITH_TINY_SUBNETS);
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'smaller than the minimum allowed for AWS'
  );
  // The mode the UI shows and the mode the code applies must be the same one.
  expect(await currentMode(page)).toBe('Standard');
  await expect(page.locator('#dropdown_standard')).toHaveClass(/active/);
  await expect(page.locator('#dropdown_aws')).not.toHaveClass(/active/);
});

test('The imported design is rendered even when its mode is rejected', async ({
  page,
}) => {
  await importConfig(page, AWS_WITH_TINY_SUBNETS);
  await page.locator('#notifyModal .btn-close').click();
  // A modal that is still fading out leaves a backdrop over the table, and the backdrop swallows
  // the next click for as long as it is there.
  await expect(page.locator('.modal.show')).toHaveCount(0);
  // The table must show the imported design, not the design that was there before.
  const rows = page.locator('#calcbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('aria-label', '10.0.0.0/30');
  await expect(page.locator('#calcbody')).not.toContainText('Loading');
  // Standard mode is in effect, so the usable range matches Standard, not AWS.
  await expect(
    page.getByLabel('10.0.0.0/30', { exact: true }).getByLabel('Usable IPs')
  ).toContainText('10.0.0.1 - 10.0.0.2');
});

test('Splitting after a rejected mode uses the visible mode', async ({
  page,
}) => {
  await importConfig(page, AWS_WITH_TINY_SUBNETS);
  await page.locator('#notifyModal .btn-close').click();
  // A modal that is still fading out leaves a backdrop over the table, and the backdrop swallows
  // the next click for as long as it is there.
  await expect(page.locator('.modal.show')).toHaveCount(0);
  // Standard allows down to /32, so splitting a /30 must succeed.
  await page.locator('#calcbody td.split .subnet-action').first().click();
  const rows = page.locator('#calcbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveAttribute('aria-label', '10.0.0.0/31');
});

test('A mode that the subnets do satisfy is applied normally', async ({
  page,
}) => {
  // A uniformly nested tree, so every level has a column and the render adds its resizers.
  await importConfig(page, {
    config_version: '1',
    operating_mode: 'AWS',
    subnets: {
      '10.0.0.0/24': {
        '10.0.0.0/25': {
          '10.0.0.0/26': { '10.0.0.0/27': { '10.0.0.0/28': {}, '10.0.0.16/28': {} } },
        },
      },
    },
  });
  await expect(page.locator('.modal.show')).toHaveCount(0);
  expect(await currentMode(page)).toBe('AWS');
  await expect(page.locator('#dropdown_aws')).toHaveClass(/active/);
  await expect(page.locator('#dropdown_standard')).not.toHaveClass(/active/);
  // AWS reserves four addresses at the start of the subnet.
  await expect(
    page.getByLabel('10.0.0.0/28', { exact: true }).getByLabel('Usable IPs')
  ).toContainText('10.0.0.4 - 10.0.0.14');
});
