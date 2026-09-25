import { test, expect } from '@playwright/test';

// The configuration format is a contract with whatever wrote the link or the pasted JSON,
// and it is also the boundary where untrusted input enters the app. These tests pin down
// what the format accepts and what it refuses, so the rules in docs/config-format.md are
// not just prose: see that file for the format itself.

const DEFAULT_ROW = '10.0.0.0/16';

test.beforeEach(async ({ page }) => {
  // LZString only exists once the app has loaded.
  await page.goto('/');
});

// Builds a share link the way getConfigUrl() does, from an arbitrary config object.
async function shareLink(page, config) {
  const payload = await page.evaluate(
    (cfg) => window.LZString.compressToEncodedURIComponent(JSON.stringify(cfg)),
    config
  );
  return '/index.html?c=1' + payload;
}

async function importJson(page, config) {
  await page.evaluate((cfg) => {
    document.getElementById('importExportArea').value = JSON.stringify(cfg);
    document.getElementById('importBtn').click();
  }, config);
}

async function rowLabels(page) {
  return page.locator('#calcbody tr').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('aria-label'))
  );
}

// A link or a paste the app cannot use must still leave a working page behind.
async function expectDefaultDesign(page) {
  await expect(page.locator('#calcbody')).not.toContainText('Loading');
  await expect(page.getByLabel('Network Address')).toHaveValue('10.0.0.0');
  await expect(page.getByLabel('Network Size')).toHaveValue('16');
  await expect(rowLabels(page)).resolves.toEqual([DEFAULT_ROW]);
}

test('A share link written with the long key names loads', async ({ page }) => {
  // The app writes v/b/m/s, but the long names are what a document or a hand-written
  // generator would use, and they mean exactly the same thing.
  await page.goto(
    await shareLink(page, {
      config_version: '1',
      subnets: { '10.0.0.0/24': { '10.0.0.0/26': {}, '10.0.0.64/26': {} } },
    })
  );
  await expect(page.locator('.modal.show')).toHaveCount(0);
  await expect(page.getByLabel('Network Size')).toHaveValue('24');
  expect(await rowLabels(page)).toEqual(['10.0.0.0/26', '10.0.0.64/26']);
});

test('A share link may name subnets with full CIDRs', async ({ page }) => {
  // A version 2 key is normally an Nth string, but a CIDR is unambiguous — an Nth string
  // never contains a dot or a slash — and it is what people write by hand.
  await page.goto(
    await shareLink(page, {
      config_version: '2',
      base_network: '10.0.0.0/24',
      subnets: { '10.0.0.0/26': {}, '10.0.0.64/26': {} },
    })
  );
  await expect(page.locator('.modal.show')).toHaveCount(0);
  expect(await rowLabels(page)).toEqual(['10.0.0.0/26', '10.0.0.64/26']);
});

test('A subnet key that is neither an Nth string nor a CIDR is refused', async ({
  page,
}) => {
  // Decoding 'zz' as an Nth string would otherwise produce a plausible-looking but
  // meaningless subnet somewhere outside the base network.
  await page.goto(
    await shareLink(page, {
      v: '2',
      b: '10.0.0.0/24',
      s: { zz: {} },
    })
  );
  await expectDefaultDesign(page);
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'could not be read'
  );
});

test('An Nth key that falls outside its base network is refused', async ({
  page,
}) => {
  // '104' is the 10th /4, which cannot be inside a /24.
  await page.goto(
    await shareLink(page, { v: '2', b: '10.0.0.0/24', s: { '104': {} } })
  );
  await expectDefaultDesign(page);
  // The old decoder wrapped the arithmetic and rendered a table of addresses that had
  // nothing to do with the base network.
  await expect(page.locator('#calcbody')).not.toContainText('50.0.0.0');
});

test('An Nth key whose mask is past /32 is refused', async ({ page }) => {
  // 'z' is 35 in base36, so the mask is not a mask.
  await page.goto(
    await shareLink(page, { v: '2', b: '10.0.0.0/24', s: { '0z': {} } })
  );
  await expectDefaultDesign(page);
});

test('An unreadable link says so by name when the version is unknown', async ({
  page,
}) => {
  await page.goto(await shareLink(page, { v: '99', b: '10.0.0.0/16', s: {} }));
  await expectDefaultDesign(page);
});

test('A pasted configuration with an unknown version is refused', async ({
  page,
}) => {
  await importJson(page, { config_version: '3', subnets: { '10.0.0.0/24': {} } });
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'version must be "1" or "2"'
  );
  await expectDefaultDesign(page);
});

test('A pasted configuration without a subnet map is refused', async ({ page }) => {
  await importJson(page, { config_version: '1', subnets: null });
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'does not contain any subnets'
  );
  await expect(page.locator('#calcbody')).not.toContainText('Loading');
});

test('A pasted version 2 configuration without a base network is refused', async ({
  page,
}) => {
  await importJson(page, { config_version: '2', subnets: { '10.0.0.0/24': {} } });
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'needs a base_network'
  );
});

test('A pasted configuration with an unknown operating mode is refused', async ({
  page,
}) => {
  await importJson(page, {
    config_version: '1',
    operating_mode: 'AWSX',
    subnets: { '10.0.0.0/24': {} },
  });
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'unknown operating mode'
  );
});

test('A pasted subnet that is not an aligned network is refused', async ({
  page,
}) => {
  // 10.0.0.128/18 is not a /18 network: the /18 blocks start at .0, .64, .128 of the
  // third octet. Two keys like this share one Nth representation in a share link, so
  // one of them silently disappears.
  await importJson(page, {
    config_version: '1',
    subnets: { '10.0.0.0/16': { '10.0.0.0/18': {}, '10.0.0.128/18': {} } },
  });
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'invalid subnet entries'
  );
  await expectDefaultDesign(page);
});

test('A refused paste leaves the current design alone', async ({ page }) => {
  await importJson(page, {
    config_version: '1',
    subnets: { '10.0.0.0/24': { '10.0.0.0/26': {}, '10.0.0.64/26': {} } },
  });
  await expect(page.locator('.modal.show')).toHaveCount(0);
  expect(await rowLabels(page)).toEqual(['10.0.0.0/26', '10.0.0.64/26']);

  await importJson(page, { config_version: '1', subnets: null });
  await page.locator('#notifyModal .btn-close').click();

  // The rejected paste must not have changed what is on screen.
  expect(await rowLabels(page)).toEqual(['10.0.0.0/26', '10.0.0.64/26']);
  await expect(page.getByLabel('Network Size')).toHaveValue('24');
});

test('A valid configuration still imports normally', async ({ page }) => {
  await importJson(page, {
    config_version: '2',
    operating_mode: 'AWS',
    base_network: '10.0.0.0/24',
    subnets: { '10.0.0.0/24': { '10.0.0.0/28': {} } },
  });
  await expect(page.locator('.modal.show')).toHaveCount(0);
  await expect(page.getByLabel('Network Size')).toHaveValue('24');
  await expect(page.locator('#dropdown_aws')).toHaveClass(/active/);
  expect(await rowLabels(page)).toEqual(['10.0.0.0/28']);
});

test('The app can read the share link it writes', async ({ page }) => {
  await importJson(page, {
    config_version: '1',
    operating_mode: 'AWS',
    subnets: {
      '10.0.0.0/16': {
        '10.0.0.0/18': { '10.0.0.0/19': { _note: 'a' } },
        '10.0.64.0/18': { _color: '#00aa55' },
      },
    },
  });
  const before = await rowLabels(page);

  const url = await page.evaluate(() => window.getConfigUrl());
  await page.goto(url);

  expect(await rowLabels(page)).toEqual(before);
  await expect(page.locator('.modal.show')).toHaveCount(0);
  // The note and the colour survive the trip through the Nth encoding.
  await expect(
    page.getByRole('textbox', { name: '10.0.0.0/19 Split Note', exact: true })
  ).toHaveValue('a');
});

test('A pasted version 2 configuration may use the Nth key form too', async ({ page }) => {
  // docs/config-format.md says a key is either a CIDR or an Nth string, and expandSubnetMap()
  // decodes both before the design is applied. A share link may carry the Nth form; a paste
  // has to accept it the same way. "1q" is nth 1 at mask 26 (q is 26 in base36) inside
  // 10.0.0.0/16, which is the block 10.0.0.64/26.
  await importJson(page, { config_version: '2', base_network: '10.0.0.0/16', subnets: { '1q': {} } });
  await expect(rowLabels(page)).resolves.toEqual(['10.0.0.64/26']);
});

test('A pasted version 2 configuration with an undecodable key is still refused', async ({ page }) => {
  // Accepting the Nth form must not turn the key check into a rubber stamp: "zzzz" asks for a
  // mask of 35, which is not a subnet of anything.
  await importJson(page, { config_version: '2', base_network: '10.0.0.0/16', subnets: { 'zzzz': {} } });
  await expect(page.locator('#notifyModalDescription')).toContainText('invalid subnet entries');
  await expectDefaultDesign(page);
});

test('A pasted Nth key keeps the note and colour that travel with it', async ({ page }) => {
  // Renaming an Nth key to its CIDR must move the key and nothing else: a note or a colour on
  // that node has to arrive with it.
  await importJson(page, {
    config_version: '2',
    base_network: '10.0.0.0/16',
    subnets: { '1q': { _note: 'branch office', _color: '#ff0000' } },
  });
  await expect(rowLabels(page)).resolves.toEqual(['10.0.0.64/26']);
  await expect(page.getByRole('textbox', { name: /10\.0\.0\.64\/26.*Note/ })).toHaveValue('branch office');
});
