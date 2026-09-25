import { test, expect } from '@playwright/test';

// "Aggregate Ranges" answers the question the design itself cannot: given a list of
// addresses and ranges from somewhere else, what is the smallest set of blocks that covers
// exactly those addresses? The design is a strict partition, so it never has to merge
// anything; this feature is all about merging.

const BLOCKS = 'Smallest set of blocks';
const INPUT = 'Addresses to aggregate';

async function openAggregator(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aggregate Ranges' }).click();
  await expect(page.getByLabel(INPUT)).toBeVisible();
}

async function aggregate(page, text) {
  await page.getByLabel(INPUT).fill(text);
  return page.getByLabel(BLOCKS).inputValue();
}

test('A range reduces to the fewest blocks that cover it', async ({ page }) => {
  await openAggregator(page);
  // 5-20 is 5, then 6-7, 8-15, 16-19 and 20: the largest aligned blocks that fit.
  expect(await aggregate(page, '10.0.0.5 - 10.0.0.20')).toBe(
    '10.0.0.5/32\n10.0.0.6/31\n10.0.0.8/29\n10.0.0.16/30\n10.0.0.20/32'
  );
});

test('A block with host bits set is normalised', async ({ page }) => {
  await openAggregator(page);
  expect(await aggregate(page, '10.0.0.5/24')).toBe('10.0.0.0/24');
});

test('A single address is a /32', async ({ page }) => {
  await openAggregator(page);
  expect(await aggregate(page, '10.0.0.7')).toBe('10.0.0.7/32');
});

test('Overlapping entries are merged rather than repeated', async ({ page }) => {
  await openAggregator(page);
  expect(await aggregate(page, '10.0.0.0-10.0.0.9\n10.0.0.5-10.0.0.15')).toBe(
    '10.0.0.0/28'
  );
});

test('Adjacent blocks are combined into a larger one', async ({ page }) => {
  await openAggregator(page);
  expect(await aggregate(page, '10.0.0.0/25\n10.0.0.128/25')).toBe('10.0.0.0/24');
});

test('Entries inside another entry add nothing', async ({ page }) => {
  await openAggregator(page);
  expect(await aggregate(page, '10.0.0.0/24\n10.0.0.5-10.0.0.20\n10.0.0.100')).toBe(
    '10.0.0.0/24'
  );
});

test('The whole address space is one block', async ({ page }) => {
  await openAggregator(page);
  expect(await aggregate(page, '0.0.0.0-255.255.255.255')).toBe('0.0.0.0/0');
});

test('Addresses above 2**31 are not mangled', async ({ page }) => {
  await openAggregator(page);
  // Address arithmetic done with 32-bit shifts wraps here and produces a wrong block.
  expect(await aggregate(page, '224.0.0.0 - 239.255.255.255')).toBe('224.0.0.0/4');
  expect(await aggregate(page, '255.255.255.255')).toBe('255.255.255.255/32');
});

test('An en dash is accepted as a range separator', async ({ page }) => {
  await openAggregator(page);
  // What a document or a spreadsheet usually contains.
  expect(await aggregate(page, '10.0.0.1\u201310.0.0.10')).toBe(
    '10.0.0.1/32\n10.0.0.2/31\n10.0.0.4/30\n10.0.0.8/31\n10.0.0.10/32'
  );
});

test('An entry that cannot be read is named by line, and the rest still work', async ({
  page,
}) => {
  await openAggregator(page);
  const blocks = await aggregate(
    page,
    '10.0.0.0/24\nnot-an-address\n10.0.0.300\n192.168.1.0-192.168.1.255'
  );
  expect(blocks).toBe('10.0.0.0/24\n192.168.1.0/24');

  const errors = page.locator('#aggregateErrors');
  await expect(errors).toBeVisible();
  await expect(errors).toContainText('line 2');
  await expect(errors).toContainText('line 3');
  await expect(errors).toContainText('is not an IPv4 address');
});

test('An IPv6 address is refused with a reason', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '2001:db8::1');
  await expect(page.locator('#aggregateErrors')).toContainText('is not an IPv4 address');
});

test('A range that ends before it starts is refused', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.20-10.0.0.5');
  await expect(page.locator('#aggregateErrors')).toContainText('ends before it starts');
});

test('Comments and blank lines are ignored', async ({ page }) => {
  await openAggregator(page);
  expect(await aggregate(page, '\n# a comment\n// another\n\n10.0.0.0/24')).toBe(
    '10.0.0.0/24'
  );
  await expect(page.locator('#aggregateErrors')).toBeHidden();
});

test('The summary counts ranges, addresses and blocks', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.5-10.0.0.20\n172.16.0.0/30');
  // 16 addresses in the range plus 4 in the /30.
  await expect(page.locator('#aggregateSummary')).toHaveText(
    '2 ranges covering 20 addresses reduce to 6 blocks.'
  );
});

test('Nothing to aggregate shows nothing', async ({ page }) => {
  await openAggregator(page);
  await expect(page.locator('#aggregateSummary')).toHaveText('Nothing to aggregate yet.');
  await aggregate(page, '10.0.0.0/24');
  await aggregate(page, '');
  await expect(page.getByLabel(BLOCKS)).toHaveValue('');
  await expect(page.locator('#aggregateSummary')).toHaveText('Nothing to aggregate yet.');
});

test('Aggregating does not touch the design', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.5 - 10.0.0.20');
  await page.locator('#aggregateModal .btn-close').click();
  // A modal that is still fading out leaves a backdrop over the table, and the backdrop swallows
  // the next click for as long as it is there.
  await expect(page.locator('.modal.show')).toHaveCount(0);
  // The default design is still the only design.
  await expect(page.locator('#calcbody tr')).toHaveCount(1);
  await expect(page.locator('#calcbody tr').first()).toHaveAttribute(
    'aria-label',
    '10.0.0.0/16'
  );
  await expect(page.getByLabel('Network Address')).toHaveValue('10.0.0.0');
});

test('Copy puts the block list on the clipboard', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'the clipboard permission is only granted to the chromium project'
  );
  await openAggregator(page);
  await aggregate(page, '10.0.0.5 - 10.0.0.20');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '10.0.0.5/32\n10.0.0.6/31\n10.0.0.8/29\n10.0.0.16/30\n10.0.0.20/32'
  );
});