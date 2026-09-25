import { test, expect } from '@playwright/test';

// Splits, joins and note edits all go through mutate_subnet_map(), so one snapshot mechanism
// covers all three, and restoring goes back through the same code that loads a design. These
// tests pin the boundaries as much as the behaviour: what a step is, what it is not, and when
// the history belongs to a different design and has to start again.

const UNDO = 'Undo change';

function undoButton(page) {
  return page.getByRole('button', { name: UNDO });
}

async function rowLabels(page) {
  return page.locator('#calcbody tr').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('aria-label'))
  );
}

// A top-level const lives in the global lexical scope rather than on window, so it has to be
// read as a bare identifier.
async function undoDepth(page) {
  return page.evaluate(() => (typeof undoDesignStack === 'undefined' ? -1 : undoDesignStack.length));
}

async function splitFirstRow(page) {
  await page.locator('#calcbody td.split .subnet-action').first().click();
}

async function joinFirstRow(page) {
  await page.locator('#calcbody td.join .subnet-action').first().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Nothing to undo is disabled and says so', async ({ page }) => {
  await expect(undoButton(page)).toBeDisabled();
  await expect(undoButton(page)).toHaveAttribute('title', 'Nothing to undo yet');
});

test('A split can be undone', async ({ page }) => {
  await splitFirstRow(page);
  expect(await rowLabels(page)).toEqual(['10.0.0.0/17', '10.0.128.0/17']);
  await expect(undoButton(page)).toBeEnabled();
  await undoButton(page).click();
  expect(await rowLabels(page)).toEqual(['10.0.0.0/16']);
  await expect(undoButton(page)).toBeDisabled();
});

test('The button names the change it will undo', async ({ page }) => {
  await splitFirstRow(page);
  await expect(undoButton(page)).toHaveAttribute('title', 'Undo the split of 10.0.0.0/16');
  // Split one of the halves as well, and the top step is the newest split.
  await page.locator('#calcbody td.split .subnet-action').first().click();
  await expect(undoButton(page)).toHaveAttribute('title', 'Undo the split of 10.0.0.0/17');
});

test('Two splits undo one step at a time', async ({ page }) => {
  await splitFirstRow(page);
  await page.locator('#calcbody td.split .subnet-action').first().click();
  expect(await rowLabels(page)).toEqual(['10.0.0.0/18', '10.0.64.0/18', '10.0.128.0/17']);

  await undoButton(page).click();
  expect(await rowLabels(page)).toEqual(['10.0.0.0/17', '10.0.128.0/17']);
  await expect(undoButton(page)).toBeEnabled();

  await undoButton(page).click();
  expect(await rowLabels(page)).toEqual(['10.0.0.0/16']);
  await expect(undoButton(page)).toBeDisabled();
});

test('A join can be undone', async ({ page }) => {
  await splitFirstRow(page);
  await joinFirstRow(page);
  expect(await rowLabels(page)).toEqual(['10.0.0.0/16']);
  await expect(undoButton(page)).toHaveAttribute('title', 'Undo the join of 10.0.0.0/16');
  await undoButton(page).click();
  expect(await rowLabels(page)).toEqual(['10.0.0.0/17', '10.0.128.0/17']);
});

test('A note is one step per field, not one per keystroke', async ({ page }) => {
  const note = page.getByRole('textbox', { name: '10.0.0.0/16 Split Note', exact: true });
  await note.click();
  await note.pressSequentially('site-1', { delay: 20 });
  // Six keystrokes, six input events, one undoable change.
  expect(await undoDepth(page)).toBe(1);
  await expect(undoButton(page)).toHaveAttribute('title', 'Undo the note on 10.0.0.0/16');

  await undoButton(page).click();
  await expect(note).toHaveValue('');
  await expect(undoButton(page)).toBeDisabled();
});

test('Undoing a note does not disturb the rest of the design', async ({ page }) => {
  await splitFirstRow(page);
  const note = page.getByRole('textbox', { name: '10.0.0.0/17 Split Note', exact: true });
  await note.click();
  await note.pressSequentially('first half', { delay: 20 });
  await undoButton(page).click();
  await expect(note).toHaveValue('');
  // The split the note was written on is still there, because it is a separate step.
  expect(await rowLabels(page)).toEqual(['10.0.0.0/17', '10.0.128.0/17']);
});

test('A colour changed after a split survives undoing the split', async ({ page }) => {
  // The palette has its own undo, and a design step must not quietly roll back colour work.
  await splitFirstRow(page);
  await page.evaluate(() => {
    const picker = document.getElementById('split_color');
    picker.value = '#00ff00';
    picker.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await undoButton(page).click();
  expect(await rowLabels(page)).toEqual(['10.0.0.0/16']);
  expect(await page.evaluate(() => exportConfig(false).block_colors)).toEqual({
    split: '#00ff00',
    join: '#6fb0d6',
  });
});

test('A new base network starts a fresh history', async ({ page }) => {
  await splitFirstRow(page);
  await expect(undoButton(page)).toBeEnabled();
  await page.getByLabel('Network Address').fill('172.16.0.0');
  await page.getByLabel('Network Size').fill('20');
  await page.getByRole('button', { name: 'Go' }).click();
  expect(await rowLabels(page)).toEqual(['172.16.0.0/20']);
  // Undoing here would step back into a design that is no longer on screen.
  await expect(undoButton(page)).toBeDisabled();
});

test('Importing a design starts a fresh history', async ({ page }) => {
  await splitFirstRow(page);
  await expect(undoButton(page)).toBeEnabled();
  await page.evaluate(() => {
    document.getElementById('importExportArea').value = JSON.stringify({
      config_version: '1',
      subnets: { '10.0.0.0/24': {} },
    });
    document.getElementById('importBtn').click();
  });
  expect(await rowLabels(page)).toEqual(['10.0.0.0/24']);
  await expect(undoButton(page)).toBeDisabled();
});