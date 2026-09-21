import { test, expect, type Page } from '@playwright/test';

async function downloadExcel(page: Page, filename: string) {
  await page.getByRole('button', { name: 'Tools' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export to Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(filename);
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  return page.evaluate(data => {
    const XLSX = (window as any).XLSX;
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellStyles: true });
    const sheet = workbook.Sheets.Subnets;
    return {
      rows: XLSX.utils.sheet_to_json(sheet, { header: 1 }).map((row: any[]) => row.slice(0, 5)),
      note: sheet.E2, hosts: sheet.D2, sheet,
      hierarchy: XLSX.utils.sheet_to_json(workbook.Sheets['Hierarchy Notes'], { header: 1 }),
    };
  }, Array.from(bytes));
}

test('Default Export Content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Import / Export' }).click();
  await expect(page.locator('#importExportModalLabel')).toContainText('Import/Export');
  await expect(page.getByLabel('Import/Export', { exact: true })).toContainText('Close');
  await expect(page.locator('#importBtn')).toContainText('Import');
  await expect(page.getByLabel('Import/Export Content')).toHaveValue('{\n  "config_version": "2",\n  "base_network": "10.0.0.0/16",\n  "subnets": {\n    "10.0.0.0/16": {}\n  }\n}');
});

test('Default (AWS) Export Content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Mode - AWS' }).click();
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Import / Export' }).click();
  await expect(page.getByLabel('Import/Export Content')).toHaveValue('{\n  "config_version": "2",\n  "operating_mode": "AWS",\n  "base_network": "10.0.0.0/16",\n  "subnets": {\n    "10.0.0.0/16": {}\n  }\n}');
});

test('Default (Azure) Export Content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Mode - Azure' }).click();
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Import / Export' }).click();
  await expect(page.getByLabel('Import/Export Content')).toHaveValue('{\n  "config_version": "2",\n  "operating_mode": "AZURE",\n  "base_network": "10.0.0.0/16",\n  "subnets": {\n    "10.0.0.0/16": {}\n  }\n}');
  await page.getByLabel('Import/Export', { exact: true }).getByText('Close').click();
});

test('Default (OCI) Export Content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Mode - OCI' }).click();
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Import / Export' }).click();
  await expect(page.getByLabel('Import/Export Content')).toHaveValue('{\n  "config_version": "2",\n  "operating_mode": "OCI",\n  "base_network": "10.0.0.0/16",\n  "subnets": {\n    "10.0.0.0/16": {}\n  }\n}');
  //await page.getByLabel('Import/Export', { exact: true }).getByText('Close').click();
});

test('Import 192.168.0.0/24', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Import / Export' }).click();
  await page.getByLabel('Import/Export Content').click();
  await page.getByLabel('Import/Export Content').fill('{\n  "config_version": "2",\n  "base_network": "192.168.0.0/24",\n  "subnets": {\n    "192.168.0.0/24": {}\n  }\n}');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByLabel('Network Address')).toHaveValue('192.168.0.0');
  await expect(page.getByLabel('Network Size')).toHaveValue('24');
  await expect(page.getByLabel('192.168.0.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('192.168.0.0/24');
});

test('Export to Excel', async ({ page }) => {
  await page.goto('/');
  const result = await downloadExcel(page, '10.0.0.0_16.xlsx');
  expect(result.rows).toEqual([
    ['Subnet Address', 'Range of Addresses', 'Usable IPs', 'Hosts', 'Note'],
    ['10.0.0.0/16', '10.0.0.0 - 10.0.255.255', '10.0.0.1 - 10.0.255.254', 65534, ''],
  ]);
  expect(result.hosts.t).toBe('n');
  expect(result.sheet['!ref']).toBe('A1:F2');
  expect(result.sheet.F2.v).toBe('Split /16');
  expect(result.sheet['!merges'] || []).toEqual([]);
});

test('Excel exports split subnets and latest Unicode notes as text', async ({ page }) => {
  await page.goto('/');
  await page.locator('#calcbody td.split .subnet-action').first().click();
  const note = '=1+1 中文 & <備註> "測試"';
  await page.locator('#calcbody td.note input').first().fill(note);
  // Change the input without applying it: filename must still describe the displayed network.
  await page.locator('#network').fill('192.168.0.0');
  const result = await downloadExcel(page, '10.0.0.0_16.xlsx');
  expect(result.rows).toEqual([
    ['Subnet Address', 'Range of Addresses', 'Usable IPs', 'Hosts', 'Note'],
    ['10.0.0.0/17', '10.0.0.0 - 10.0.127.255', '10.0.0.1 - 10.0.127.254', 32766, note],
    ['10.0.128.0/17', '10.0.128.0 - 10.0.255.255', '10.0.128.1 - 10.0.255.254', 32766, ''],
  ]);
  expect(result.note.t).toBe('s');
  expect(result.note.f).toBeUndefined();
  expect(result.sheet['!ref']).toBe('A1:G3');
  expect(result.sheet.F2.v).toBe('Split /17\n' + note);
  expect(result.sheet.F3.v).toBe('Split /17');
  expect(result.sheet.G2.v).toBe('Join /16');
  expect(result.sheet['!merges']).toContainEqual({ s: { r: 1, c: 6 }, e: { r: 2, c: 6 } });
  expect(result.sheet['!merges'].filter((merge: any) => merge.s.r > 0 && merge.s.c !== merge.e.c)).toEqual([]);
});

for (const [mode, first, hosts] of [['AWS', '10.0.0.4', 65531], ['Azure', '10.0.0.4', 65531], ['OCI', '10.0.0.2', 65533]] as const) {
  test(`Excel uses ${mode} reserved addresses`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('link', { name: `Mode - ${mode}` }).click();
    const result = await downloadExcel(page, '10.0.0.0_16.xlsx');
    expect(result.rows[0][2]).toBe(`Usable IPs (${mode})`);
    expect(result.rows[1][2]).toBe(`${first} - 10.0.255.254`);
    expect(result.rows[1][3]).toBe(hosts);
  });
}

for (const size of [31, 32]) {
  test(`Excel handles /${size} subnets`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#netsize').fill(String(size));
    await page.locator('#btn_go').click();
    const result = await downloadExcel(page, `10.0.0.0_${size}.xlsx`);
    const range = size === 32 ? '10.0.0.0' : '10.0.0.0 - 10.0.0.1';
    expect(result.rows[1]).toEqual([`10.0.0.0/${size}`, range, range, size === 32 ? 1 : 2, '']);
  });
}

//test('Test', async ({ page }) => {
//  await page.goto('/');
//});

test('Huawei Excel uses default reserved IPs', async ({ page }) => {
  await page.goto('/');
  await page.locator('#netsize').fill('24');
  await page.locator('#btn_go').click();
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.locator('#dropdown_huawei').click();
  const result = await downloadExcel(page, '10.0.0.0_24.xlsx');
  expect(result.rows[0][2]).toBe('Usable IPs (Huawei Cloud)');
  expect(result.rows[1]).toEqual(['10.0.0.0/24', '10.0.0.0 - 10.0.0.255', '10.0.0.2 - 10.0.0.252', 251, '']);
});

test('Excel preserves Split/Join fills, spans, row colors and parent notes', async ({ page }) => {
  await page.goto('/');
  await page.locator('input.leaf-note').fill('父層 "&<>"');
  await page.locator('#calcbody td.split .subnet-action').click();
  await page.locator('input.leaf-note').first().fill('子層');
  await page.locator('#calcbody td.split .subnet-action').first().click();
  await page.getByText('Change Colors »').click();
  await page.getByLabel('Color 1', { exact: true }).click();
  await page.locator('#calcbody .row_address').first().click();
  await page.getByText('« Stop Changing Colors').click();
  const result = await downloadExcel(page, '10.0.0.0_16.xlsx');
  const cells = Object.values(result.sheet) as any[];
  const split = cells.find(cell => cell?.v === 'Split /18\n子層');
  const join = cells.find(cell => cell?.v === 'Join /16\n父層 "&<>"');
  expect(split.s.fgColor.rgb).toBe('F27F64');
  expect(join.s.fgColor.rgb).toBe('6FB0D6');
  expect(result.sheet.A2.s.fgColor.rgb).toBe('FFADAD');
  expect(result.sheet['!ref']).toBe('A1:H4');
  expect(result.sheet['!merges']).toContainEqual({ s: { r: 1, c: 7 }, e: { r: 3, c: 7 } });
  expect(result.sheet['!merges']).toContainEqual({ s: { r: 3, c: 5 }, e: { r: 3, c: 6 } });
  expect(result.hierarchy).toContainEqual([0, '10.0.0.0/16', '', '父層 "&<>"']);
  expect(result.hierarchy).toContainEqual([1, '10.0.0.0/17', '10.0.0.0/16', '子層']);
});
