import { test, expect } from '@playwright/test';

// A list copied from somewhere else often contains entries that cover the same addresses
// twice: two sources pasted together, a range widened in one place and not another, a host
// address repeated on two rows. The design itself can never have this problem — it is a
// strict partition — so this is reported here, where the lists arrive.
//
// It is a warning rather than an error: the blocks below are still correct, because the
// aggregation takes the union. It is a sign the list is not what its author thought it was.

const INPUT = 'Addresses to aggregate';
const BLOCKS = 'Smallest set of blocks';
const OVERLAPS = '#aggregateOverlaps';
const ERRORS = '#aggregateErrors';

async function openAggregator(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aggregate Ranges' }).click();
  await expect(page.getByLabel(INPUT)).toBeVisible();
}

async function aggregate(page, text) {
  await page.getByLabel(INPUT).fill(text);
  return page.getByLabel(BLOCKS).inputValue();
}

test('Overlapping entries are reported by line', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.0-10.0.0.9\n10.0.0.5-10.0.0.15');
  const warning = page.locator(OVERLAPS);
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('lines 1 and 2');
  await expect(warning).toContainText('10.0.0.0-10.0.0.9');
  await expect(warning).toContainText('10.0.0.5-10.0.0.15');
});

test('An entry inside another entry is an overlap too', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.0/24\n10.0.0.5');
  await expect(page.locator(OVERLAPS)).toContainText('lines 1 and 2');
});

test('Entries that merely touch are not an overlap', async ({ page }) => {
  await openAggregator(page);
  // The warning has to be able to appear, or "hidden" below proves nothing.
  await aggregate(page, '10.0.0.0/24\n10.0.0.5');
  await expect(page.locator(OVERLAPS)).toBeVisible();
  // One ends at .127 and the next starts at .128: a clean handover, not a conflict.
  await aggregate(page, '10.0.0.0/25\n10.0.0.128/25');
  await expect(page.locator(OVERLAPS)).toBeHidden();
  await expect(page.getByLabel(BLOCKS)).toHaveValue('10.0.0.0/24');
});

test('Disjoint entries are not an overlap', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.0/24\n10.0.0.128/25');
  await expect(page.locator(OVERLAPS)).toBeVisible();
  await aggregate(page, '10.0.0.0/24\n192.168.1.0/24');
  await expect(page.locator(OVERLAPS)).toBeHidden();
});

test('A three-way overlap is reported once, naming all three lines', async ({ page }) => {
  await openAggregator(page);
  await aggregate(
    page,
    '10.0.0.0-10.0.0.10\n10.0.0.5-10.0.0.20\n10.0.0.15-10.0.0.30'
  );
  const warning = page.locator(OVERLAPS);
  await expect(warning).toContainText('lines 1, 2 and 3');
  await expect(warning.locator('li')).toHaveCount(1);
});

test('Separate overlaps are reported separately', async ({ page }) => {
  await openAggregator(page);
  await aggregate(
    page,
    '10.0.0.0-10.0.0.9\n10.0.0.5-10.0.0.15\n172.16.0.1\n172.16.0.1'
  );
  const warning = page.locator(OVERLAPS);
  await expect(warning.locator('li')).toHaveCount(2);
  await expect(warning).toContainText('lines 1 and 2');
  await expect(warning).toContainText('lines 3 and 4');
});

test('An unreadable line does not shift the line numbers', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.0/24\nnonsense\n10.0.0.5');
  // The overlap is between the first and the third line, not the first and the second.
  await expect(page.locator(OVERLAPS)).toContainText('lines 1 and 3');
  await expect(page.locator(ERRORS)).toContainText('line 2');
});

test('The warnings do not change the blocks', async ({ page }) => {
  await openAggregator(page);
  // Each address is still counted once: the union is the same as for the range alone.
  expect(await aggregate(page, '10.0.0.0-10.0.0.9\n10.0.0.5-10.0.0.15')).toBe(
    '10.0.0.0/28'
  );
  await expect(page.locator(OVERLAPS)).toBeVisible();
  await expect(page.locator('#aggregateSummary')).toHaveText(
    '1 range covering 16 addresses reduce to 1 block.'
  );
});

test('Clearing the list clears the warning', async ({ page }) => {
  await openAggregator(page);
  await aggregate(page, '10.0.0.0-10.0.0.9\n10.0.0.5-10.0.0.15');
  await expect(page.locator(OVERLAPS)).toBeVisible();
  await aggregate(page, '');
  await expect(page.locator(OVERLAPS)).toBeHidden();
  await expect(page.locator(ERRORS)).toBeHidden();
});