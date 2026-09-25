import { test, expect } from '@playwright/test';

// A share link is untrusted input: chat clients truncate long URLs, fragments get
// mangled, and users mistype them. A link that cannot be read must degrade to the
// default design instead of leaving the page broken.

const DEFAULT_ROW = '10.0.0.0/16';

// LZString only exists once the app has loaded, so every test starts from the default
// page before building its payload.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function expectDefaultDesign(page) {
  await expect(page).not.toHaveTitle(/error/i);
  await expect(page.locator('#calcbody')).not.toContainText('Loading');
  await expect(
    page.getByLabel(DEFAULT_ROW, { exact: true }).getByLabel('Subnet Address')
  ).toContainText(DEFAULT_ROW);
  await expect(page.getByLabel('Network Address')).toHaveValue('10.0.0.0');
  await expect(page.getByLabel('Network Size')).toHaveValue('16');
}

test('Empty share payload falls back to the default design', async ({ page }) => {
  await page.goto('/index.html?c=1');
  await expectDefaultDesign(page);
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'could not be read'
  );
});

test('Garbage share payload falls back to the default design', async ({
  page,
}) => {
  await page.goto('/index.html?c=1notvalidlz!!');
  await expectDefaultDesign(page);
  await expect(page.locator('.modal.show .modal-body')).toContainText(
    'could not be read'
  );
});

test('Truncated share payload falls back to the default design', async ({
  page,
}) => {
  // Copy the first 40 characters of a real link, as a chat client might clip it.
  const payload = await page.evaluate(() =>
    window.LZString.compressToEncodedURIComponent(
      JSON.stringify({ v: '2', b: '10.0.0.0/16', s: { '0o': { n: 'DMZ' } } })
    )
  );
  await page.goto('/index.html?c=1' + payload.slice(0, 40));
  await expectDefaultDesign(page);
});

test('A payload that is not an object falls back to the default design', async ({
  page,
}) => {
  const payload = await page.evaluate(() =>
    window.LZString.compressToEncodedURIComponent(JSON.stringify([1, 2, 3]))
  );
  await page.goto('/index.html?c=1' + payload);
  await expectDefaultDesign(page);
});

test('A payload without a subnet map falls back to the default design', async ({
  page,
}) => {
  const payload = await page.evaluate(() =>
    window.LZString.compressToEncodedURIComponent(JSON.stringify({ v: '2' }))
  );
  await page.goto('/index.html?c=1' + payload);
  await expectDefaultDesign(page);
});

test('An unknown config version falls back to the default design', async ({
  page,
}) => {
  const payload = await page.evaluate(() =>
    window.LZString.compressToEncodedURIComponent(
      JSON.stringify({ v: '99', b: '10.0.0.0/16', s: {} })
    )
  );
  await page.goto('/index.html?c=1' + payload);
  await expectDefaultDesign(page);
});

test('A design is still editable after a bad link', async ({ page }) => {
  await page.goto('/index.html?c=1notvalidlz!!');
  await expectDefaultDesign(page);
  await page.locator('#notifyModal .btn-close').click();
  // A modal that is still fading out leaves a backdrop over the table, and the backdrop swallows
  // the next click for as long as it is there.
  await expect(page.locator('.modal.show')).toHaveCount(0);
  await page.locator('#calcbody td.split .subnet-action').first().click();
  await expect(page.locator('#calcbody tr')).toHaveCount(2);
});

test('A valid share link is unaffected', async ({ page }) => {
  const payload = await page.evaluate(() =>
    window.LZString.compressToEncodedURIComponent(
      JSON.stringify({ v: '2', b: '10.0.0.0/24', s: { '0o': { n: 'DMZ' } } })
    )
  );
  await page.goto('/index.html?c=1' + payload);
  await expect(
    page.getByLabel('10.0.0.0/24', { exact: true }).getByLabel('Subnet Address')
  ).toContainText('10.0.0.0/24');
  await expect(
    page.getByRole('textbox', { name: '10.0.0.0/24 Split Note', exact: true })
  ).toHaveValue('DMZ');
  await expect(page.locator('.modal.show')).toHaveCount(0);
});

test('No share parameter still renders the default design', async ({ page }) => {
  await page.goto('/');
  await expectDefaultDesign(page);
});
