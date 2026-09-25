import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync } from 'fs';

// The drawing is exported as the drawing, not as a picture of the page: the SVG file carries
// its own size because nothing outside the page knows about the page's stylesheet, and the PNG
// is rasterised from that same SVG at twice the size. Both are checked here by reading what
// actually landed on disk.

async function download(page: Page, name: string): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  return file;
}

async function bytes(page: Page, name: string): Promise<Buffer> {
  const file = await download(page, name);
  const path = await file.path();
  if (!path) throw new Error('the download had no file behind it');
  return readFileSync(path);
}

function pngSize(data: Buffer) {
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function openOverview(page: Page) {
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('#overview_svg')).toBeVisible();
}

async function splitOnce(page: Page) {
  await page.locator('#calcbody td.split button').first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('The overview offers both formats', async ({ page }) => {
  await openOverview(page);
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PNG' })).toBeVisible();
});

test('The SVG download is the drawing, named after the design', async ({ page }) => {
  await splitOnce(page);
  await openOverview(page);
  const file = await download(page, 'Download SVG');
  expect(file.suggestedFilename()).toBe('subnets-10.0.0.0-16.svg');

  const svg = (await bytes(page, 'Download SVG')).toString('utf8');
  expect(svg.startsWith('<svg ')).toBe(true);
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  // The same blocks that are on screen, not a placeholder.
  expect(svg).toContain('10.0.0.0/17');
  expect(svg).toContain('10.0.128.0/17');
  expect(await page.locator('#overview_svg rect').count()).toBe(2);
  expect((svg.match(/<rect /g) || []).length).toBe(2);
});

test('The exported SVG carries its own size instead of the page styling', async ({ page }) => {
  await openOverview(page);
  const svg = (await bytes(page, 'Download SVG')).toString('utf8');
  // A file gets opened somewhere that has never heard of this stylesheet.
  expect(svg).toContain('width="960" height="540"');
  expect(svg).not.toContain('style=');
  expect(svg).not.toContain('max-height:68vh');
});

test('The PNG download is a real PNG at twice the size', async ({ page }) => {
  await openOverview(page);
  const data = await bytes(page, 'Download PNG');
  // The magic bytes, and then the dimensions in the header rather than a promise of them.
  expect([...data.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(data.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(pngSize(data)).toEqual({ width: 1920, height: 1080 });
  expect(data.length).toBeGreaterThan(1000);
});

test('The PNG download is named after the design', async ({ page }) => {
  await openOverview(page);
  const file = await download(page, 'Download PNG');
  expect(file.suggestedFilename()).toBe('subnets-10.0.0.0-16.png');
});

test('What is exported is the design on screen at the time', async ({ page }) => {
  await openOverview(page);
  const one = (await bytes(page, 'Download SVG')).toString('utf8');
  expect((one.match(/<rect /g) || []).length).toBe(1);

  await page.locator('#overviewModal .btn-close').click();
  // A modal that is still fading out leaves a backdrop over the table, and the backdrop swallows
  // the next click for as long as it is there.
  await expect(page.locator('.modal.show')).toHaveCount(0);
  await splitOnce(page);
  await splitOnce(page);
  await openOverview(page);
  const three = (await bytes(page, 'Download SVG')).toString('utf8');
  expect((three.match(/<rect /g) || []).length).toBe(3);
  expect(three).toContain('10.0.0.0/18');
});

test('A different base network names the file after itself', async ({ page }) => {
  await page.getByLabel('Network Address').fill('172.16.0.0');
  await page.getByLabel('Network Size').fill('20');
  await page.getByRole('button', { name: 'Go' }).click();
  await openOverview(page);
  const file = await download(page, 'Download SVG');
  expect(file.suggestedFilename()).toBe('subnets-172.16.0.0-20.svg');
});

test('The page says what it downloaded, and forgets it next time', async ({ page }) => {
  await openOverview(page);
  await expect(page.locator('#overviewExportStatus')).toHaveText('');
  await download(page, 'Download PNG');
  await expect(page.locator('#overviewExportStatus')).toContainText('Downloaded subnets-10.0.0.0-16.png');
  await expect(page.locator('#overviewExportStatus')).toContainText('1920×1080');

  await page.locator('#overviewModal .btn-close').click();
  // A modal that is still fading out leaves a backdrop over the table, and the backdrop swallows
  // the next click for as long as it is there.
  await expect(page.locator('.modal.show')).toHaveCount(0);
  await openOverview(page);
  await expect(page.locator('#overviewExportStatus')).toHaveText('');
});

test('An exported SVG is well formed XML', async ({ page }) => {
  await splitOnce(page);
  await openOverview(page);
  const svg = (await bytes(page, 'Download SVG')).toString('utf8');
  // Parsed as a document rather than pattern-matched: brackets that do not balance would show
  // up as a parser error, which is how a broken export would reach the user.
  const parsed = await page.evaluate((markup) => {
    const document_ = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const problem = document_.querySelector('parsererror');
    return {
      error: problem ? problem.textContent : null,
      rects: document_.querySelectorAll('rect').length,
      texts: document_.querySelectorAll('text').length,
    };
  }, svg);
  expect(parsed.error).toBeNull();
  expect(parsed.rects).toBe(2);
  expect(parsed.texts).toBe(2);
});