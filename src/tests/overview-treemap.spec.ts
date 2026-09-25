import { test, expect, type Page } from '@playwright/test';

// The overview is a treemap of a binary partition, so it has one property that can be checked
// exactly: a block's rectangle is its share of the address space. Everything else follows from
// that — one rectangle per block, side by side, no overlaps, filling the canvas.

type Rect = { cidr: string; x: number; y: number; width: number; height: number };

const CANVAS = 960 * 540;

function rects(page: Page) {
  return page.evaluate(() => {
    return (window as any).treemapRects().rects.map((entry) => ({
      cidr: entry.cidr,
      x: entry.box.x,
      y: entry.box.y,
      width: entry.box.width,
      height: entry.box.height,
    })) as Rect[];
  });
}

function size(cidr: string) {
  return 2 ** (32 - Number(cidr.split('/')[1]));
}

async function splitOnce(page: Page) {
  await page.locator('#calcbody td.split button').first().click();
}

async function openOverview(page: Page) {
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('#overview_svg')).toBeVisible();
}

function hexToRgb(hex: string) {
  const value = hex.trim();
  return `rgb(${parseInt(value.slice(1, 3), 16)}, ${parseInt(value.slice(3, 5), 16)}, ${parseInt(value.slice(5, 7), 16)})`;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('A design with one block is one rectangle', async ({ page }) => {
  await openOverview(page);
  const layout = await rects(page);
  expect(layout.map((rect) => rect.cidr)).toEqual(['10.0.0.0/16']);
  expect(layout[0].x).toBe(0);
  expect(layout[0].y).toBe(0);
  await expect(page.locator('#overview_hint')).toContainText('1 block in 10.0.0.0/16');
});

test('Every block is drawn once, and a block is its share of the address space', async ({ page }) => {
  await splitOnce(page);
  await splitOnce(page);
  await openOverview(page);

  const layout = await rects(page);
  // Two splits: the left half split again, so three blocks — two /18s and the right /17. The
  // left /17 is not among them: it was split, so it is not a block any more.
  expect(layout.map((rect) => rect.cidr).sort()).toEqual(['10.0.0.0/18', '10.0.64.0/18', '10.0.128.0/17'].sort());
  for (const rect of layout) {
    // Exactly, not approximately: halving a rectangle halves its area, so the areas agree to
    // the last bit of floating point.
    expect((rect.width * rect.height) / CANVAS).toBeCloseTo(size(rect.cidr) / 65536, 12);
  }
});

test('The rectangles tile the canvas with no gap and no overlap', async ({ page }) => {
  for (let i = 0; i < 3; i++) await splitOnce(page);
  await openOverview(page);
  const layout = await rects(page);
  expect(layout.length).toBe(4);

  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i];
      const b = layout[j];
      const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlaps, `${a.cidr} overlaps ${b.cidr}`).toBe(false);
    }
  }
  const area = layout.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  expect(area).toBeCloseTo(CANVAS, 6);
});

test('A block is drawn in the colour its own cell has in the table', async ({ page }) => {
  await openOverview(page);
  const drawn = await page.evaluate(() => (window as any).treemapRects().rects[0]);
  expect(drawn.cidr).toBe('10.0.0.0/16');
  const fill = await page.locator('#overview_svg rect').first().getAttribute('fill');
  const cell = await page.locator('#calcbody td.split[data-subnet="10.0.0.0/16"]').evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  expect(hexToRgb(fill || '')).toBe(cell);
});

test('A colour set on a block shows up in the overview', async ({ page }) => {
  await page.evaluate(() => {
    const node = (window as any).getSubnetNode('10.0.0.0/16');
    node._cellColors = { block: '#123456' };
  });
  await openOverview(page);
  await expect(page.locator('#overview_svg rect').first()).toHaveAttribute('fill', '#123456');
});

test('Every rectangle names its block, its note and its usable addresses', async ({ page }) => {
  await splitOnce(page);
  await page.evaluate(() => {
    (window as any).getSubnetNode('10.0.0.0/17')._note = 'Sales';
  });
  await openOverview(page);

  const titles = await page.locator('#overview_svg title').evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent || '').trim()),
  );
  expect(titles).toContain('10.0.0.0/17 — Sales · 32766 usable');
  expect(titles).toContain('10.0.128.0/17 · 32766 usable');
});

test('A block is labelled exactly when the label fits', async ({ page }) => {
  await splitOnce(page);
  for (let i = 0; i < 4; i++) await splitOnce(page);
  await openOverview(page);

  // A label goes on every block that can hold one, and on no other: a clipped label is worse
  // than none, and the rule has to hold at every size the halving produces.
  const labelled = await page.evaluate(
    () => [...document.querySelectorAll('#overview_svg g')].filter((group) => group.querySelector('text')).length,
  );
  const roomForOne = await page.evaluate(
    () => (window as any).treemapRects().rects.filter((entry) => entry.box.width >= 74 && entry.box.height >= 16).length,
  );
  expect(roomForOne).toBeGreaterThan(0);
  expect(labelled).toBe(roomForOne);
});

test('A design too fine to draw is counted, not drawn', async ({ page }) => {
  const result = await page.evaluate(() => {
    // Built here rather than in the table, which would try to render every row: a /16 split
    // all the way down is 65,536 blocks, and the view has to survive being handed one.
    const full = (cidr: string, stopAt: number): any => {
      const mask = Number(cidr.split('/')[1]);
      if (mask >= stopAt) return {};
      const start = (window as any).ip2int(cidr.split('/')[0]);
      const step = 2 ** (32 - mask - 1);
      const left = (window as any).int2ip(start) + '/' + (mask + 1);
      const right = (window as any).int2ip(start + step) + '/' + (mask + 1);
      const node: any = {};
      node[left] = full(left, stopAt);
      node[right] = full(right, stopAt);
      return node;
    };
    const slivers = { '10.0.0.0/16': full('10.0.0.0/16', 32) };
    const many = { '10.0.0.0/16': full('10.0.0.0/16', 29) };
    return {
      slivers: (window as any).treemapRects(slivers, '10.0.0.0/16'),
      many: (window as any).treemapRects(many, '10.0.0.0/16'),
    };
  });

  // A /16 down to /32s: every block is under the area a picture can show, and all of them are
  // accounted for rather than silently dropped.
  expect(result.slivers.rects.length).toBe(0);
  expect(result.slivers.skipped).toBe(65536);

  // 8,192 blocks that are each big enough to draw still stop at the ceiling, and the rest are
  // reported rather than left out of the count.
  expect(result.many.rects.length).toBe(2000);
  expect(result.many.skipped).toBe(8192 - 2000);
});

test('The overview shows the design it is opened on', async ({ page }) => {
  await openOverview(page);
  await expect(page.locator('#overview_hint')).toContainText('1 block');
  await page.locator('#overviewModal .btn-close').click();
  await splitOnce(page);
  await splitOnce(page);
  await openOverview(page);
  await expect(page.locator('#overview_hint')).toContainText('3 blocks');
  expect(await page.locator('#overview_svg rect').count()).toBe(3);
});

test('Blocks come out in address order, which is the order the picture places them', async ({ page }) => {
  for (let i = 0; i < 3; i++) await splitOnce(page);
  await openOverview(page);

  // The layout walks the left half before the right half at every level and the halves are
  // sorted by address, so the blocks come out in ascending address order — which is also the
  // order they are drawn in, and the order the table lists them.
  const addresses = await page.evaluate(() =>
    (window as any).treemapRects().rects.map((entry: any) =>
      entry.cidr.split('/')[0].split('.').reduce((sum: number, octet: string) => sum * 256 + Number(octet), 0),
    ),
  );
  expect(addresses.length).toBe(4);
  expect(addresses).toEqual([...addresses].sort((a, b) => a - b));
});