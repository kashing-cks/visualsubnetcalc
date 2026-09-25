import { test, expect } from '@playwright/test';

// Reading a spreadsheet into the aggregator is the difference between "paste the addresses
// you can be bothered to find" and "point it at the file". The file does not have to be laid
// out in any particular way, because every cell is checked.

const BLOCKS = 'Smallest set of blocks';
const INPUT = 'Addresses to aggregate';
const FILE = 'Load from a file';
const STATUS = '#aggregateFileStatus';

async function openAggregator(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aggregate Ranges' }).click();
  await expect(page.getByLabel(INPUT)).toBeVisible();
}

async function uploadCsv(page, name, text) {
  await page.getByLabel(FILE).setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
}

// Builds a real workbook on the page, which is the only place the writer exists, and hands
// the bytes back to Node so they can be uploaded like any other file.
async function workbookBuffer(page, rows) {
  const base64 = await page.evaluate((data) => {
    const XLSX = window.XLSX;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), 'Sheet1');
    const bytes = new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
    let binary = '';
    // Chunked, because String.fromCharCode(...bytes) overflows the argument list.
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }, rows);
  return Buffer.from(base64, 'base64');
}

test('A CSV column of blocks is read into the list', async ({ page }) => {
  await openAggregator(page);
  await uploadCsv(
    page,
    'subnets.csv',
    'Site,Block,Notes\nHQ,10.0.0.0/24,the office\nBranch,10.0.1.0/25,\n'
  );
  await expect(page.locator(STATUS)).toHaveText('Read 2 entries from subnets.csv.');
  await expect(page.getByLabel(INPUT)).toHaveValue('10.0.0.0/24\n10.0.1.0/25');
  await expect(page.getByLabel(BLOCKS)).toHaveValue('10.0.0.0/24\n10.0.1.0/25');
});

test('Host addresses and ranges in the file are collected too', async ({ page }) => {
  await openAggregator(page);
  await uploadCsv(page, 'hosts.csv', 'name,address\nweb,10.0.0.7\nrange,10.0.0.5 - 10.0.0.20\n');
  await expect(page.locator(STATUS)).toHaveText('Read 2 entries from hosts.csv.');
  // 10.0.0.7 is inside 10.0.0.5 - 10.0.0.20, so the cover is the range alone.
  await expect(page.getByLabel(BLOCKS)).toHaveValue(
    '10.0.0.5/32\n10.0.0.6/31\n10.0.0.8/29\n10.0.0.16/30\n10.0.0.20/32'
  );
});

test('A repeated entry is collected once', async ({ page }) => {
  await openAggregator(page);
  await uploadCsv(page, 'dupes.csv', 'a\n10.0.0.0/24\n10.0.0.0/24\n10.0.0.0/24\n');
  await expect(page.locator(STATUS)).toHaveText('Read 1 entry from dupes.csv.');
  await expect(page.getByLabel(INPUT)).toHaveValue('10.0.0.0/24');
});

test('An Excel workbook is read', async ({ page }) => {
  await openAggregator(page);
  const buffer = await workbookBuffer(page, [
    ['Site', 'Block'],
    ['HQ', '10.0.0.0/24'],
    ['Branch', '172.16.0.0/12'],
  ]);
  await page.getByLabel(FILE).setInputFiles({
    name: 'plan.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await expect(page.locator(STATUS)).toHaveText('Read 2 entries from plan.xlsx.');
  await expect(page.getByLabel(INPUT)).toHaveValue('10.0.0.0/24\n172.16.0.0/12');
});

test('A file with nothing to aggregate says so', async ({ page }) => {
  await openAggregator(page);
  await uploadCsv(page, 'notes.csv', 'name,owner\ncore,alice\nedge,bob\n');
  await expect(page.locator(STATUS)).toHaveText(
    'No addresses, blocks or ranges were found in notes.csv.'
  );
  await expect(page.getByLabel(INPUT)).toHaveValue('');
  await expect(page.getByLabel(BLOCKS)).toHaveValue('');
});

test('A file that is not a workbook says so plainly', async ({ page }) => {
  await openAggregator(page);
  // XLSX.read() would read these bytes as text and report an empty sheet, which reads as
  // "your file is fine but has nothing in it" — the wrong thing to tell someone.
  await page.getByLabel(FILE).setInputFiles({
    name: 'broken.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('this is not a workbook at all'),
  });
  await expect(page.locator(STATUS)).toHaveText(
    'broken.xlsx is not a workbook. Save it as .xlsx, or as .csv if it is text.'
  );
});

test('The file fills the box, and the box can still be edited afterwards', async ({
  page,
}) => {
  await openAggregator(page);
  await uploadCsv(page, 'one.csv', '10.0.0.0/24\n');
  await expect(page.locator(STATUS)).toHaveText('Read 1 entry from one.csv.');
  // The file is a starting point, not a mode: typing over it works as usual.
  await page.getByLabel(INPUT).fill('10.0.0.0/24\n10.0.0.0/25');
  await expect(page.getByLabel(BLOCKS)).toHaveValue('10.0.0.0/24');
});