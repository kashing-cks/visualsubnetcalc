import { test, expect, type Page } from '@playwright/test';

// A list of requirements and a design out. The numbers the planner shows have to be the
// numbers the table then shows, or the plan is worthless: it is sized by the same reserved
// counts the Usable column is computed from, per operating mode.

const SALES = 'Sales, 120\nEngineering, 60\nLink to branch, 2';

async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: `Mode - ${name}`, exact: true }).click();
}

async function openPlanner(page: Page) {
  await page.getByRole('button', { name: 'Plan Subnets (VLSM)' }).click();
  await expect(page.getByRole('textbox', { name: 'Subnets to plan' })).toBeVisible();
}

async function planRows(page: Page) {
  return page.locator('#vlsmResult tbody tr').evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll('td')].map((cell) => (cell.textContent || '').trim())),
  );
}

// Every leaf of the built tree, in the order it is laid out.
async function builtLeaves(page: Page) {
  return page.evaluate(() => {
    const leaves: string[][] = [];
    const walk = (node, cidr) => {
      const keys = Object.keys(node).filter((key) => !key.startsWith('_'));
      if (!keys.length) {
        leaves.push([cidr, node._note || '']);
        return;
      }
      keys.forEach((key) => walk(node[key], key));
    };
    const subnets = (window as any).exportConfig(false).subnets;
    walk(subnets['10.0.0.0/16'], '10.0.0.0/16');
    return leaves;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('The planner says what it wants instead of planning nothing', async ({ page }) => {
  await openPlanner(page);
  await expect(page.locator('#vlsmResult')).toContainText('a name and a host count');
  // Nothing to build from, so the button stays off.
  await expect(page.getByRole('button', { name: 'Build design' })).toBeDisabled();
});

test('A list is planned largest first, and every block holds its count', async ({ page }) => {
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill(SALES);

  const rows = await planRows(page);
  expect(rows.map((row) => row[0])).toEqual(['Sales', 'Engineering', 'Link to branch']);
  // Blocks come out in descending size, which is what makes the layout fit without waste.
  expect(rows.map((row) => row[2])).toEqual(['10.0.0.0/25', '10.0.0.128/26', '10.0.0.192/31']);
  expect(rows.map((row) => row[3])).toEqual(['126', '62', '2']);
  // And each of them holds what was asked for.
  for (const row of rows) {
    expect(Number(row[3])).toBeGreaterThanOrEqual(Number(row[1]));
  }
});

test('The usable counts the planner shows are the ones the table shows', async ({ page }) => {
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill(SALES);
  const planned = await planRows(page);
  await page.getByRole('button', { name: 'Build design' }).click();

  for (const [, , block, usable] of planned) {
    const row = page.locator('#calcbody tr').filter({ has: page.locator(`.row_address:text-is("${block}")`) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.row_hosts')).toHaveText(usable);
  }
});

test('Blocks are sized for the operating mode, reserved addresses included', async ({ page }) => {
  await mode(page, 'AWS');
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill('Sales, 120\nLink, 2');

  const rows = await planRows(page);
  // AWS gives up five addresses per subnet, so 120 hosts needs a /25 (123 usable) and the
  // smallest block the mode allows is a /28 (11 usable) — not a /31, which it would reject.
  expect(rows.map((row) => row[2])).toEqual(['10.0.0.0/25', '10.0.0.128/28']);
  expect(rows.map((row) => row[3])).toEqual(['123', '11']);

  await page.getByRole('button', { name: 'Build design' }).click();
  const built = page.locator('#calcbody tr').filter({ has: page.locator('.row_address:text-is("10.0.0.0/25")') });
  await expect(built.locator('.row_hosts')).toHaveText('123');
});

test('Two hosts is the smallest block the mode allows, not the smallest possible', async ({ page }) => {
  await mode(page, 'Huawei Cloud');
  await openPlanner(page);
  // Huawei Cloud reserves two at the front and three at the back and will not go below a /28.
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill('Link, 2');
  const rows = await planRows(page);
  expect(rows[0][2]).toBe('10.0.0.0/28');
  expect(rows[0][3]).toBe('11');
});

test('A request that cannot fit is reported instead of placed', async ({ page }) => {
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill('Huge, 70000');

  const result = page.locator('#vlsmResult');
  await expect(result).toContainText('0 of 1 placed');
  await expect(result).toContainText('needs a bigger block than 10.0.0.0/16');
  await expect(page.getByRole('button', { name: 'Build design' })).toBeDisabled();
});

test('A list too long for the base network fills it exactly and says the rest does not fit', async ({ page }) => {
  await openPlanner(page);
  const many = Array.from({ length: 260 }, (_, index) => `Team ${index + 1}, 200`).join('\n');
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill(many);

  const result = page.locator('#vlsmResult');
  // A /16 holds exactly 256 /24s, and every one of them is handed out before giving up.
  await expect(result).toContainText('256 of 260 placed');
  await expect(result).toContainText('no room left in 10.0.0.0/16');
  const rows = await planRows(page);
  expect(rows).toHaveLength(256);
  expect(rows[255][2]).toBe('10.0.255.0/24');
});

test('An unreadable line is reported with the line it is on', async ({ page }) => {
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill('Sales, 120\nno number here\nLink, 2');

  const result = page.locator('#vlsmResult');
  await expect(result).toContainText('line 2');
  await expect(result).toContainText('expected a name and a host count');
  // Nothing is planned from a list that was not read in full.
  await expect(page.getByRole('button', { name: 'Build design' })).toBeDisabled();
});

test('A subnet pasted into the list is called out rather than read as a name', async ({ page }) => {
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill('Sales, 120\n10.0.0.0/24');
  await expect(page.locator('#vlsmResult')).toContainText('that looks like a subnet');
});

test('The blocks a bad line sits between are still planned once it is fixed', async ({ page }) => {
  await openPlanner(page);
  const input = page.getByRole('textbox', { name: 'Subnets to plan' });
  await input.fill('Sales, 120\nbroken\nLink, 2');
  await expect(page.getByRole('button', { name: 'Build design' })).toBeDisabled();
  // Correcting it is enough; nothing has to be re-entered.
  await input.fill('Sales, 120\nSupport, 40\nLink, 2');
  const rows = await planRows(page);
  expect(rows.map((row) => row[0])).toEqual(['Sales', 'Support', 'Link']);
});

test('The plan is a complete partition: what is left over is free, and nothing is unaccounted for', async ({ page }) => {
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill(SALES);
  await page.getByRole('button', { name: 'Build design' }).click();

  const leaves = await builtLeaves(page);
  expect(leaves[0]).toEqual(['10.0.0.0/25', 'Sales']);
  expect(leaves[1]).toEqual(['10.0.0.128/26', 'Engineering']);
  expect(leaves[2]).toEqual(['10.0.0.192/31', 'Link to branch']);
  // Everything else is free space, and it is labelled as much.
  expect(leaves.slice(3).every(([, note]) => note === 'free')).toBe(true);

  // The leaves tile the base network exactly: sizes add up to the whole /16, and laid end to
  // end they are contiguous with no gap and no overlap.
  const toInt = (ip) => ip.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  let expectedStart = toInt('10.0.0.0');
  let total = 0;
  for (const [cidr] of leaves) {
    const [address, maskText] = cidr.split('/');
    const size = 2 ** (32 - Number(maskText));
    expect(toInt(address)).toBe(expectedStart);
    expectedStart += size;
    total += size;
  }
  expect(total).toBe(2 ** 16);
});

test('Building replaces the design, and one undo brings the previous one back', async ({ page }) => {
  // A silent exception inside the planner would leave the build button disabled forever, so
  // it is worth failing on rather than waiting out the click timeout.
  const pageErrors: string[] = [];
  page.on('pageerror', (error: Error) => pageErrors.push(error.message));

  const before = await page.evaluate(() => JSON.stringify((window as any).exportConfig(false).subnets));
  await openPlanner(page);
  await page.getByRole('textbox', { name: 'Subnets to plan' }).fill(SALES);
  const buildButton = page.getByRole('button', { name: 'Build design' });
  await expect(buildButton).toBeEnabled();
  await buildButton.click();
  expect(pageErrors).toEqual([]);

  const built = await page.evaluate(() => JSON.stringify((window as any).exportConfig(false).subnets));
  expect(built).not.toBe(before);
  // One step, named for what it was.
  await expect(page.locator('#btn_undo_design')).toHaveAttribute('title', 'Undo the VLSM plan for 10.0.0.0/16');

  await page.locator('#btn_undo_design').click();
  const restored = await page.evaluate(() => JSON.stringify((window as any).exportConfig(false).subnets));
  expect(restored).toBe(before);
});