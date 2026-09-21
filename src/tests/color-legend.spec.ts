import { test, expect } from '@playwright/test';

test('Applied colors create one editable record each; selection alone does not', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#color_legend')).toBeHidden();
  await page.getByRole('button', { name: 'Change Colors', exact: true }).click();
  await page.getByRole('button', { name: 'Color 1', exact: true }).click();
  await expect(page.locator('#color_legend')).toBeHidden();
  await page.locator('.row_address').click();
  const meaning = page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true });
  await meaning.fill('Production 生產環境');
  await page.locator('.row_hosts').click();
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(1);
  await page.locator('.row_hosts').click({ button: 'right' });
  await page.getByRole('button', { name: 'Quick color 4', exact: true }).click();
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo color', exact: true }).click();
  await expect(meaning).toHaveValue('Production 生產環境');
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(1);
  await page.locator('#split_color').fill('#112233');
  await page.locator('#join_color').fill('#112233');
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Split 10.0.0.0/16', exact: true }).click();
  await expect(meaning).toHaveValue('Production 生產環境');
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(2);
});

test('Legend survives JSON and sharing; older designs collect colors and replace previous records', async ({ page }) => {
  await page.goto('/');
  await page.locator('.row_hosts').click({ button: 'right' });
  await page.getByRole('button', { name: 'Quick color 1', exact: true }).click();
  const meaning = '=Production "香港" <img src=x onerror=alert(1)>\n第二行';
  await page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true }).fill(meaning);
  const config = await page.evaluate(() => (window as any).exportConfig(false));
  expect(config.color_legend).toEqual({ '#ffadad': meaning });
  await page.goto(await page.evaluate(() => (window as any).getConfigUrl()));
  await expect(page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true })).toHaveValue(meaning);
  await expect(page.locator('#color_legend img')).toHaveCount(0);
  await page.evaluate(config => (window as any).importConfig(config), config);
  await expect(page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true })).toHaveValue(meaning);
  await page.evaluate(() => (window as any).importConfig({
    config_version: '2', base_network: '10.0.0.0/16',
    subnets: { '10.0.0.0/16': { _color: '#ABCDEF', _cellColors: { row_hosts: '#abcdef', block: '#123456' } } }
  }));
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Meaning for #ABCDEF', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).importConfig({
    config_version: '2', base_network: '10.0.0.0/16', subnets: { '10.0.0.0/16': { _color: '#abcdef' } },
    color_legend: { 'invalid': 'bad', '#aabbcc': 123, '#ABCDEF': 'valid', '#abcdef': 'updated' }
  }));
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Meaning for #ABCDEF', exact: true })).toHaveValue('updated');
});

test('Repainting and clearing remove unused colors; undo restores their meanings', async ({ page }) => {
  await page.goto('/');
  await page.locator('.row_hosts').click({ button: 'right' });
  await page.getByRole('button', { name: 'Quick color 1', exact: true }).click();
  await page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true }).fill('Production');
  await page.locator('.row_hosts').click({ button: 'right' });
  await page.getByRole('button', { name: 'Quick color 4', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).exportConfig(false).color_legend)).toEqual({ '#caffbf': '' });
  const sheet = await page.evaluate(() => (window as any).buildExcelSubnetSheet());
  expect(sheet.A5.v).toBe('#CAFFBF');
  expect(sheet['!ref']).toBe('A1:E5');
  await page.getByRole('button', { name: 'Change Colors', exact: true }).click();
  await page.getByRole('button', { name: 'Undo color', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true })).toHaveValue('Production');
  await expect(page.getByRole('textbox', { name: 'Meaning for #CAFFBF', exact: true })).toHaveCount(0);
  await page.locator('.row_hosts').click({ button: 'right' });
  await page.getByRole('button', { name: 'Reset cell', exact: true }).click();
  await expect(page.locator('#color_legend')).toBeHidden();
  expect(await page.evaluate(() => (window as any).exportConfig(false).color_legend)).toBeUndefined();
  await page.goto(await page.evaluate(() => (window as any).getConfigUrl()));
  await expect(page.locator('#color_legend')).toBeHidden();
});

test('Only visible effective colors count, including overrides and disappearing Join blocks', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).importConfig({
    config_version: '2', base_network: '10.0.0.0/16', block_colors: { join: '#112233' },
    color_legend: { '#abcdef': 'Covered row', '#ffadad': 'Visible', '#123456': 'Stale' },
    subnets: { '10.0.0.0/16': { _color: '#abcdef', _cellColors: {
      row_address: '#ffadad', row_range: '#ffadad', row_usable: '#ffadad', row_hosts: '#ffadad'
    } } }
  }));
  await expect(page.locator('#color_legend_rows tr')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Meaning for #FFADAD', exact: true })).toHaveValue('Visible');
  await page.getByRole('button', { name: 'Split 10.0.0.0/16', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Meaning for #112233', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Meaning for #ABCDEF', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Join 10.0.0.0/16', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Meaning for #112233', exact: true })).toHaveCount(0);
  await page.locator('.row_hosts').click({ button: 'right' });
  await page.getByRole('button', { name: 'Reset cell', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Meaning for #ABCDEF', exact: true })).toHaveValue('Covered row');
});

test('Excel includes the colored legend and the latest unblurred meaning as text', async ({ page }) => {
  await page.goto('/');
  await page.locator('.row_hosts').click({ button: 'right' });
  await page.locator('#quick_custom_color').fill('#123456');
  const meaning = '=SUM(1,2) 香港\nReserved';
  await page.getByRole('textbox', { name: 'Meaning for #123456', exact: true }).fill(meaning);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to Excel', exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const result = await page.evaluate(bytes => {
    const XLSX = (window as any).XLSX;
    const book = XLSX.read(new Uint8Array(bytes), { type: 'array', cellStyles: true });
    return { names: book.SheetNames, legend: book.Sheets.Subnets };
  }, Array.from(Buffer.concat(chunks)));
  expect(result.names).toEqual(['Subnets', 'Hierarchy Notes']);
  expect(result.legend.A2.v).toBe('10.0.0.0/16');
  expect(result.legend.A4.v).toBe('Color');
  expect(result.legend.A5.v).toBe('#123456');
  expect(result.legend.A5.s.fgColor.rgb).toBe('123456');
  expect(result.legend.B5.v).toBe(meaning);
  expect(result.legend.B5.t).toBe('s');
  expect(result.legend.B5.f).toBeUndefined();
  expect(result.legend['!ref']).toBe('A1:E5');
  expect(result.legend['!merges']).toContainEqual({ s: { r: 4, c: 1 }, e: { r: 4, c: 4 } });
  await page.setViewportSize({ width: 375, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
