import { test, expect, type Page } from '@playwright/test';

async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: `Mode - ${name}`, exact: true }).click();
}

test('Huawei reserves first two and last three IPs and enforces /28', async ({ page }) => {
  await page.goto('/');
  await mode(page, 'Huawei Cloud');
  await page.locator('#netsize').fill('27');
  await page.locator('#btn_go').click();
  await expect(page.locator('.row_usable')).toHaveText('10.0.0.2 - 10.0.0.28');
  await expect(page.locator('.row_hosts')).toHaveText('27');
  await page.locator('td.split .subnet-action').click();
  await expect(page.locator('.row_usable')).toHaveText(['10.0.0.2 - 10.0.0.12', '10.0.0.18 - 10.0.0.28']);
  await expect(page.locator('.row_hosts')).toHaveText(['11', '11']);
  await page.locator('td.split .subnet-action').first().click();
  await expect(page.locator('#notifyModalDescription')).toContainText('Huawei Cloud is /28');
  await expect(page.locator('#calcbody tr')).toHaveCount(2);
  await page.locator('#notifyModal .btn-close').click();
  await page.locator('#netsize').fill('29');
  await page.locator('#btn_go').click();
  await expect(page.locator('#calcbody tr')).toHaveCount(2);
  await expect(page.locator('#notifyModalDescription')).toContainText('correct the errors');
});

test('Huawei rejects incompatible mode switch and restores Standard', async ({ page }) => {
  await page.goto('/');
  await page.locator('#netsize').fill('29');
  await page.locator('#btn_go').click();
  await mode(page, 'Huawei Cloud');
  await expect(page.locator('#notifyModalDescription')).toContainText('minimum allowed for Huawei Cloud');
  await expect(page.locator('#dropdown_standard')).toHaveClass(/active/);
  await expect(page.locator('.row_hosts')).toHaveText('6');
});

test('Independent notes survive split, URL, JSON, network change and join', async ({ page }) => {
  await page.goto('/');
  await mode(page, 'Huawei Cloud');
  const parentNote = '父層 <網路> "測試" & =1+1';
  await page.locator('input.leaf-note').fill(parentNote);
  await page.locator('td.split .subnet-action').click();
  await page.locator('input.leaf-note').first().fill('子層');
  await page.locator('td.split .subnet-action').first().click();
  await page.locator('input.leaf-note').first().fill('孫層');
  await page.locator('#btn_hierarchy_notes').click();
  const parent = page.getByRole('textbox', { name: '10.0.0.0/16 Hierarchy Note', exact: true });
  await parent.fill(parentNote + ' 更新');
  await expect(parent).toHaveCount(1);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const url = await page.evaluate(() => (window as any).getConfigUrl());
  await page.goto(url);
  await expect(page.locator('#dropdown_huawei')).toHaveClass(/active/);
  await page.locator('#btn_hierarchy_notes').click();
  await expect(parent).toHaveValue(parentNote + ' 更新');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('input.leaf-note').first()).toHaveValue('孫層');
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.locator('#btn_import_export').click();
  const config = await page.locator('#importExportArea').inputValue();
  expect(JSON.parse(config).subnets['10.0.0.0/16']._note).toBe(parentNote + ' 更新');
  await page.locator('#importBtn').click();
  await page.locator('#btn_hierarchy_notes').click();
  await expect(parent).toHaveValue(parentNote + ' 更新');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('#network').fill('192.168.0.0');
  await page.locator('#btn_go').click();
  await page.locator('#btn_hierarchy_notes').click();
  await expect(page.getByRole('textbox', { name: '192.168.0.0/16 Hierarchy Note', exact: true })).toHaveValue(parentNote + ' 更新');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Join 192.168.0.0/17', exact: true }).click();
  await expect(page.locator('input.leaf-note').first()).toHaveValue('子層');
  await page.getByRole('button', { name: 'Join 192.168.0.0/16', exact: true }).click();
  await expect(page.locator('input.leaf-note')).toHaveValue(parentNote + ' 更新');
  await mode(page, 'Standard');
  await expect(page.locator('#dropdown_huawei')).not.toHaveClass(/active/);
});

test('Deep splits keep the main table compact and notes appear once in the panel', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 5; i++) await page.locator('td.split .subnet-action').first().click();
  await expect(page.locator('#calcbody tr')).toHaveCount(6);
  await expect(page.locator('#calcbody td.note input')).toHaveCount(6);
  await expect(page.locator('#calcbody .join input')).toHaveCount(5);
  expect(await page.locator('#calcbody tr').first().evaluate(row => row.getBoundingClientRect().height)).toBeLessThan(65);
  await page.locator('#btn_hierarchy_notes').click();
  await expect(page.locator('#hierarchy_notes_tree input')).toHaveCount(11);
  const root = page.getByRole('textbox', { name: '10.0.0.0/16 Hierarchy Note', exact: true });
  const leaf = page.getByRole('textbox', { name: '10.0.0.0/21 Hierarchy Note', exact: true });
  await root.fill('Root note');
  await leaf.fill('Leaf note');
  await page.getByRole('button', { name: 'Toggle 10.0.0.0/16', exact: true }).click();
  await expect(leaf).toBeHidden();
  await expect(root).toBeVisible();
  await page.getByRole('button', { name: 'Toggle 10.0.0.0/16', exact: true }).click();
  await expect(leaf).toHaveValue('Leaf note');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('input.leaf-note').first()).toHaveValue('Leaf note');
  await page.locator('input.leaf-note').first().fill('Updated from table');
  await page.locator('#btn_hierarchy_notes').click();
  await expect(leaf).toHaveValue('Updated from table');
  await expect(root).toHaveValue('Root note');
  await page.setViewportSize({ width: 600, height: 700 });
  const inputBox = await leaf.boundingBox();
  const modalBox = await page.locator('#hierarchyNotesModal .modal-content').boundingBox();
  expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(modalBox!.x + modalBox!.width);
});

test('Split and Join notes edit in place without changing structure', async ({ page }) => {
  await page.goto('/');
  const root = page.getByRole('textbox', { name: '10.0.0.0/16 Split Note', exact: true });
  await root.fill('VPC');
  await root.press('Enter');
  await expect(page.locator('#calcbody tr')).toHaveCount(1);
  await expect(page.locator('input.leaf-note')).toHaveValue('VPC');
  await page.getByRole('button', { name: 'Split 10.0.0.0/16', exact: true }).click();
  const parent = page.getByRole('textbox', { name: '10.0.0.0/16 Join Note', exact: true });
  await parent.fill('HK "&<>"');
  await parent.press('Enter');
  await expect(page.locator('#calcbody tr')).toHaveCount(2);
  await expect(page.locator('td.join')).toHaveAttribute('rowspan', '2');
  const leaf = page.getByRole('textbox', { name: '10.0.0.0/17 Split Note', exact: true });
  await leaf.fill('Production');
  await expect(page.locator('input.leaf-note').first()).toHaveValue('Production');
  await page.locator('input.leaf-note').first().fill('Updated');
  await expect(leaf).toHaveValue('Updated');
  await expect(page.locator('.join .subnet-action span')).toHaveCSS('writing-mode', 'horizontal-tb');
  await expect(page.locator('.split .subnet-action span').first()).toHaveCSS('writing-mode', 'horizontal-tb');
  const url = await page.evaluate(() => (window as any).getConfigUrl());
  await page.goto(url);
  await expect(parent).toHaveValue('HK "&<>"');
  await expect(leaf).toHaveValue('Updated');
  await page.getByRole('button', { name: 'Join 10.0.0.0/16', exact: true }).click();
  await expect(root).toHaveValue('HK "&<>"');
  await expect(page.locator('#calcbody tr')).toHaveCount(1);
});
