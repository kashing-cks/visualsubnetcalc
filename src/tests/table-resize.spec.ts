import { test, expect, type Locator, type Page } from '@playwright/test';

async function width(locator: Locator) {
  return locator.evaluate(element => element.getBoundingClientRect().width);
}

async function drag(page: Page, handle: Locator, distance: number) {
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const startX = Math.round(box.x + box.width / 2);
  const centerY = Math.round(box.y + box.height / 2);
  // Firefox refuses to move the synthetic pointer outside the viewport and then
  // reports garbage coordinates, which collapses the column to its minimum.
  // Clamp the target so the drag always stays on screen and report the distance
  // that was actually applied. Integer coordinates keep both engines in sync.
  const maxX = Math.round((page.viewportSize()?.width ?? startX + distance) - 1);
  const endX = Math.min(startX + distance, maxX);
  await page.mouse.move(startX, centerY);
  await page.mouse.down();
  await page.mouse.move(endX, centerY, { steps: 10 });
  await page.mouse.up();
  return endX - startX;
}

test('Dragging a parent Note widens its column without changing notes or subnet structure', async ({ page }) => {
  await page.setViewportSize({ width: 2600, height: 1080 });
  await page.goto('/');
  // The Note columns sit at the right edge of a table that stretches to fill the
  // window, so a long pointer drag would leave the viewport - and Firefox cannot
  // move the pointer past the window edge. Keep the table narrower than the
  // window so the whole drag stays on screen in both engines.
  await page.addStyleTag({ content: '.table-responsive { max-width: 1200px; }' });
  await page.waitForFunction(() => document.getElementById('calc')!.getBoundingClientRect().width < 1300);
  await page.getByRole('button', { name: 'Split 10.0.0.0/16', exact: true }).click();
  await page.getByRole('button', { name: 'Split 10.0.0.0/17', exact: true }).click();
  const parent = page.getByRole('textbox', { name: '10.0.0.0/16 Join Note', exact: true });
  const note = 'Huawei Cloud production network - Hong Kong';
  await parent.fill(note);
  await parent.blur();
  const before = await width(parent);
  const addressWidth = await width(page.locator('#subnetHeader'));
  const grown = await drag(page, page.getByRole('separator', { name: 'Resize /16 Note', exact: true }), 400);
  expect(grown).toBe(400);
  expect(await width(parent)).toBeCloseTo(before + grown, 0);
  expect(await width(page.locator('#subnetHeader'))).toBeCloseTo(addressWidth, 0);
  // Chromium can round the internal input editor one pixel wider than clientWidth.
  expect(await parent.evaluate(input => input.scrollWidth - input.clientWidth)).toBeLessThanOrEqual(1);
  await expect(parent).toHaveValue(note);
  await expect(parent).toHaveAttribute('title', note);
  await expect(page.locator('#calcbody tr')).toHaveCount(3);
  await expect(page.locator('body')).not.toHaveClass(/resizing-columns/);

  await page.getByRole('button', { name: 'Join 10.0.0.0/17', exact: true }).click();
  expect(await width(parent)).toBeCloseTo(before + grown, 0);
  await page.getByRole('button', { name: 'Join 10.0.0.0/16', exact: true }).click();
  const root = page.getByRole('textbox', { name: '10.0.0.0/16 Split Note', exact: true });
  expect(await width(root)).toBeCloseTo(before + grown, 0);
  await expect(root).toHaveValue(note);
  await page.getByRole('button', { name: 'Reset column widths' }).click();
  expect(await width(root)).toBeCloseTo(before, 0);
  await expect(root).toHaveValue(note);
});

test('Merged blocks resize the correct level and preserve table alignment', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Split 10.0.0.0/16', exact: true }).click();
  await page.getByRole('button', { name: 'Split 10.0.0.0/17', exact: true }).click();
  const merged = page.locator('td.split[data-subnet="10.0.128.0/17"]');
  const sameLevel = page.locator('td.join[data-subnet="10.0.0.0/17"]');
  const leaf = page.locator('td.split[data-subnet="10.0.0.0/18"]');
  const mergedWidth = await width(merged);
  const levelWidth = await width(sameLevel);
  const leafWidth = await width(leaf);
  const grown = await drag(page, merged.getByRole('separator'), 120);
  expect(await width(merged)).toBeCloseTo(mergedWidth + grown, 0);
  expect(await width(sameLevel)).toBeCloseTo(levelWidth + grown, 0);
  expect(await width(leaf)).toBeCloseTo(leafWidth, 0);
  const right = (locator: Locator) => locator.evaluate(cell => cell.getBoundingClientRect().right);
  expect(await right(merged)).toBeCloseTo(await right(sameLevel), 0);
  await expect(merged).toHaveAttribute('colspan', '2');
  await expect(page.locator('#calcbody tr')).toHaveCount(3);
});

test('Headers support pointer and keyboard resizing with minimum widths and horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  const handle = page.getByRole('separator', { name: 'Resize Subnet Address', exact: true });
  const before = await width(page.locator('#subnetHeader'));
  const grown = await drag(page, handle, 100);
  expect(await width(page.locator('#subnetHeader'))).toBeCloseTo(before + grown, 0);
  await handle.focus();
  await handle.press('Shift+ArrowRight');
  expect(await width(page.locator('#subnetHeader'))).toBeCloseTo(before + grown + 50, 0);
  for (let i = 0; i < 10; i++) await handle.press('Shift+ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '200');
  await page.setViewportSize({ width: 600, height: 700 });
  const noteHandle = page.getByRole('separator', { name: 'Resize /16 Note', exact: true });
  await expect(noteHandle).toHaveAttribute('aria-valuenow', '120');
  await noteHandle.focus();
  await noteHandle.press('Shift+ArrowRight');
  await expect(noteHandle).toHaveAttribute('aria-valuenow', '170');
  expect(await page.locator('#calc').evaluate(table => table.parentElement!.scrollWidth > table.parentElement!.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Reset column widths' }).click();
  await expect(noteHandle).toHaveAttribute('aria-valuenow', '160');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('link', { name: 'Mode - Huawei Cloud', exact: true }).click();
  await expect(page.getByRole('separator', { name: 'Resize Usable IPs', exact: true })).toHaveCount(1);
});
