import { expect, test, type Page } from '@playwright/test';

/**
 * The E3 user path in a real browser (PRD §6 flow, backlog E3-1/E3-2). These
 * specs also double as the antislop Delivery Gate evidence for E3: every
 * control is clicked and its effect asserted (R-26, R-35).
 *
 * Paths are relative to the working directory (`npm run test:e2e` runs from the
 * project root). `src/parser/fixtures/group-android-en.txt` is reused because
 * its dates are ambiguous, which is what triggers the date-order prompt.
 */

const ZIP_FIXTURE = 'tests/e2e/fixtures/export.zip';
const AMBIGUOUS_FIXTURE = 'src/parser/fixtures/group-android-en.txt';
const NOT_AN_EXPORT = 'tests/e2e/fixtures/README.md';

async function chooseFile(page: Page, path: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(path);
}

test('landing: a real file input, the privacy dialog, and the export help open and close', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
  await expect(page.getByText('Open chat export')).toBeVisible();

  // "How we know" opens a dialog that explains the DevTools check, and Escape closes it.
  await page.getByRole('button', { name: 'How we know' }).click();
  const privacy = page.getByRole('dialog');
  await expect(privacy).toBeVisible();
  await expect(privacy.getByText('Network tab')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(privacy).toBeHidden();

  // Export help lists real Android and iPhone steps.
  await page.getByRole('button', { name: 'How to export a chat from WhatsApp' }).click();
  const help = page.getByRole('dialog');
  await expect(help.getByRole('heading', { name: 'Android' })).toBeVisible();
  await expect(help.getByRole('heading', { name: 'iPhone' })).toBeVisible();
  await help.getByRole('button', { name: 'Close' }).click();
  await expect(help).toBeHidden();
});

test('rejects a file that is not a chat export, then recovers', async ({ page }) => {
  await page.goto('/');
  await chooseFile(page, NOT_AN_EXPORT);

  await expect(page.getByRole('heading', { name: 'Not a chat export' })).toBeVisible();

  // "Choose another file" returns to the drop zone, which then accepts a real export.
  await page.getByRole('button', { name: 'Choose another file' }).click();
  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
});

test('asks for the date order when the export is ambiguous, then opens the chat', async ({
  page,
}) => {
  await page.goto('/');
  await chooseFile(page, AMBIGUOUS_FIXTURE);

  await expect(page.getByRole('heading', { name: 'Which date is this?' })).toBeVisible();
  await expect(page.getByText(/or /)).toBeVisible();

  // Choosing an order re-parses the same file and opens the chat. The group has
  // no filename signal, so "Which one is you?" arrives (E3-4).
  await page.getByRole('button', { name: 'Day first' }).click();
  await expect(page.getByRole('heading', { name: 'Which one is you?' })).toBeVisible();
  await page.getByRole('button', { name: 'Nobody' }).click();
  await expect(page.locator('.chat')).toBeVisible();
});

test('cancel from the date prompt returns to the drop zone', async ({ page }) => {
  await page.goto('/');
  await chooseFile(page, AMBIGUOUS_FIXTURE);
  await expect(page.getByRole('heading', { name: 'Which date is this?' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
});

test('the chat opens with the real title, count and date range', async ({ page }) => {
  await page.goto('/');
  await chooseFile(page, ZIP_FIXTURE);

  await expect(page.getByText('Nadia Rush', { exact: true })).toBeVisible();
  // 7 messages: the caption line is folded into the image message, not counted
  // as its own (F-PAR-4).
  await expect(page.getByText('7 messages')).toBeVisible();
  await expect(page.getByText(/Feb 6, 2026 to Jul 13, 2026/)).toBeVisible();

  // The header back button is a real control that frees the session and returns home.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
});

test.describe('responsive: no horizontal overflow', () => {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`landing and chat fit at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );

      expect(await overflow()).toBeLessThanOrEqual(0);

      await chooseFile(page, ZIP_FIXTURE);
      await expect(page.locator('.chat')).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  }
});

test('the drop zone has a visible keyboard focus ring', async ({ page }) => {
  await page.goto('/');

  // Click a non-interactive element first: WebKit in headless mode does not move
  // focus with Tab until the page itself is focused, which made this racy.
  await page.getByRole('heading', { name: 'ChatChive' }).click();
  await page.keyboard.press('Tab');

  // Tab reaches the file input (the zone is a label bound to it), so the zone
  // shows a real outline rather than a removed one (R-32).
  await expect(page.locator('input[type="file"]')).toBeFocused();

  const ring = await page.locator('.dropzone').evaluate((node) => {
    const style = getComputedStyle(node);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(ring.style).not.toBe('none');
  expect(Number.parseFloat(ring.width)).toBeGreaterThan(0);
});

test.describe('every shipped theme renders the flow', () => {
  for (const theme of ['light', 'classic']) {
    test(`${theme} theme opens a chat with no overflow`, async ({ page }) => {
      // No theme toggle is shipped yet (PRD puts it in v0.2), so the attribute
      // is set the way E7-3 will set it.
      await page.addInitScript((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);

      await page.goto('/');
      await chooseFile(page, ZIP_FIXTURE);

      await expect(page.getByText('7 messages')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    });
  }
});
