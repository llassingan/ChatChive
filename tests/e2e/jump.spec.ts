/**
 * Jump to date (E7-2, F-NAV-3).
 *
 * Two fixtures, because the feature has two halves and they need different
 * shapes:
 *
 *   - `large.txt` is 5,000 messages over three days (6/27, 6/28, 6/29 of 2026).
 *     It is the only fixture tall enough to scroll, so it is the one that can
 *     prove a *jump*: on a chat shorter than the viewport the sticky pill never
 *     changes and "scrolled to the day" is untestable (Sprint 7, the first draft
 *     of this file made exactly that mistake).
 *   - `export.zip` is the small dated fixture, used only for the calendar's own
 *     content rules (which days exist, which are disabled, the dot).
 *
 * The clock is pinned so day labels and "today" are fixed.
 */
import { expect, test, type Page } from '@playwright/test';

const LARGE = 'tests/e2e/fixtures/large.txt';
const ZIP = 'tests/e2e/fixtures/export.zip';

/** Day labels for the pinned clock below, in `en-US` + UTC. */
const JUNE_27 = 'June 27, 2026';
const JUNE_28 = 'June 28, 2026';
const JUNE_29 = 'June 29, 2026';
/** The calendar opens on the newest message's month, `large.txt`'s June. */
const MONTH = 'June 2026';
/** First message of each day in `large.txt`, to prove where a jump landed. */
const FIRST_OF_27 = 'Synthetic message number 0 for the virtualization check';

test.use({ locale: 'en-US', timezoneId: 'UTC' });

async function openChat(page: Page, fixture: string): Promise<void> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.chat')).toBeVisible();
  // Let the arrival pin settle before a test measures the list, so a jump is
  // measured against a still page rather than the loading burst.
  await expect(page.locator('.chat-list__sticky .day__pill')).toBeVisible();
  await page.waitForTimeout(400);
}

/**
 * Opens the header menu and clicks the entry that opens the calendar. The
 * trigger is a `<summary>`, so it is reached by label, not by role.
 */
async function openCalendar(page: Page): Promise<void> {
  await page.getByLabel('Chat options').click();
  await page.locator('.chat__menu-item', { hasText: 'Jump to date' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** The day the sticky pill currently names, i.e. the day at the top of the list. */
function pill(page: Page): Promise<string> {
  return page.locator('.chat-list__sticky .day__pill').innerText();
}

/**
 * How far below the top of the scroll container a piece of text sits.
 * `scrollToIndex(row, { align: 'start' })` promises the day's first row is at the
 * top; "visible somewhere" would also pass on an overshoot.
 */
async function offsetFromListTop(page: Page, text: string): Promise<number> {
  const target = page.locator('.chat-list').getByText(text).first();
  await expect(target).toBeVisible();
  const targetBox = await target.boundingBox();
  const listBox = await page.locator('.chat-list').boundingBox();
  if (targetBox === null || listBox === null) throw new Error('no box for the target or the list');
  return targetBox.y - listBox.y;
}

/**
 * The offset of the day separator for `label`, relative to the list's top.
 *
 * A "jump to date" lands on the day's separator row, which is the row the
 * virtualizer is asked to align to `start`, so the separator sits at the top of
 * the viewport (its own top padding puts it a couple of pixels above). The first
 * message of the day follows it.
 */
async function daySeparatorOffset(page: Page, label: string): Promise<number> {
  const separator = page.locator('.chat-list .day', { hasText: label }).first();
  await expect(separator).toBeVisible();
  const box = await separator.boundingBox();
  const listBox = await page.locator('.chat-list').boundingBox();
  if (box === null || listBox === null) throw new Error('no box for the separator or the list');
  return box.y - listBox.y;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-07-13T12:00:00Z'));
});

test('marks the days that have messages and greys out the days that do not', async ({ page }) => {
  await openChat(page, ZIP);
  await openCalendar(page);

  // The calendar opens on the newest message's month.
  await expect(page.locator('.jump__month')).toHaveText('July 2026');

  // Today is marked, and says so in its accessible name rather than by colour
  // alone (WCAG 1.4.1).
  await expect(page.locator('button[data-day="2026-07-13"]')).toHaveAttribute('data-today', 'true');
  expect(await page.locator('button[data-day="2026-07-13"]').getAttribute('aria-label')).toContain(
    'Today',
  );

  // An in-month day the chat is silent on cannot be chosen, and says so to
  // assistive tech: the cell is a real button (arrow keys may pass over it) but
  // carries `aria-disabled`. A natively disabled button could not be focused.
  await expect(page.locator('button[data-day="2026-07-16"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // One month back: the notice-only day is enabled, because the list draws a
  // separator for it, so the calendar must agree that the day exists. Note the
  // export's date order is M/D, so `6/2/26` in the file is *February* 6, and the
  // days that exist in June are the ones the separators name.
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.locator('.jump__month')).toHaveText('June 2026');
  await expect(page.locator('button[data-day="2026-06-27"]')).toHaveAttribute(
    'data-has-messages',
    'true',
  );
  await expect(page.locator('button[data-day="2026-06-28"]')).toHaveAttribute(
    'data-has-messages',
    'true',
  );
  // An in-month day with no message is disabled.
  await expect(page.locator('button[data-day="2026-06-15"]')).toHaveAttribute(
    'data-has-messages',
    'false',
  );

  // The dot is the non-colour signal for "this day has messages" (WCAG 1.4.1).
  await expect(page.locator('button[data-day="2026-06-27"] .jump__dot')).toHaveCount(1);
  await expect(page.locator('button[data-day="2026-06-15"] .jump__dot')).toHaveCount(0);
});

test('picking a day scrolls the list to its first message row', async ({ page }) => {
  await openChat(page, LARGE);

  // The list opens pinned to the newest message (F-VIEW-13), so the pill names
  // the day the export ends on. This is the baseline the jump has to move.
  expect(await pill(page)).toBe(JUNE_29);

  await openCalendar(page);
  await expect(page.locator('.jump__month')).toHaveText(MONTH);
  await page.locator('button[data-day="2026-06-27"]').click();

  // The dialog steps out of the way…
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // …the sticky pill names the day it landed on…
  await expect(page.locator('.chat-list__sticky .day__pill')).toHaveText(JUNE_27);
  // …the day's separator is the row aligned to the top of the viewport (that is
  // what `align: 'start'` promises, and what "jump to date" means)…
  expect(await daySeparatorOffset(page, JUNE_27)).toBeLessThan(4);
  // …and the day's first message is below it, so the jump did not overshoot past
  // the day or land mid-run.
  const first = await offsetFromListTop(page, FIRST_OF_27);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(140);
});

test('the arrival holds instead of snapping back to the newest message', async ({ page }) => {
  await openChat(page, LARGE);
  await openCalendar(page);
  await page.locator('button[data-day="2026-06-28"]').click();
  await expect(page.locator('.chat-list__sticky .day__pill')).toHaveText(JUNE_28);

  // The list pins itself to the bottom for a burst of frames after mount. A jump
  // that did not release that pin would be dragged back to the newest message
  // within a few frames, so waiting is the assertion.
  await page.waitForTimeout(1000);
  expect(await pill(page)).toBe(JUNE_28);
});

test('the calendar is operable from the keyboard', async ({ page }) => {
  await openChat(page, LARGE);
  await openCalendar(page);

  // A day cell holds focus on open, so the calendar is usable without a mouse.
  // The grid opens on the first day the chat has messages on (2026-06-27), which
  // is where a reader paging backwards usually wants to start.
  await expect(page.locator('button[data-day="2026-06-27"]')).toBeFocused();

  // One step right is one calendar day, one step up is one week.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('button[data-day="2026-06-28"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('button[data-day="2026-07-05"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('button[data-day="2026-06-28"]')).toBeFocused();

  // Escape leaves without moving the reader: someone who opened the calendar by
  // accident is not thrown across the chat.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await pill(page)).toBe(JUNE_29);
});

test('Enter on a focused day jumps, and Cancel does not', async ({ page }) => {
  await openChat(page, LARGE);

  // Cancel is the way out that changes nothing.
  await openCalendar(page);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await pill(page)).toBe(JUNE_29);

  await openCalendar(page);
  await page.locator('button[data-day="2026-06-27"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.chat-list__sticky .day__pill')).toHaveText(JUNE_27);
  expect(await daySeparatorOffset(page, JUNE_27)).toBeLessThan(4);
  const first = await offsetFromListTop(page, FIRST_OF_27);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(140);
});

test('the same day can be jumped to twice, and an empty day cannot be chosen', async ({ page }) => {
  await openChat(page, LARGE);
  await openCalendar(page);
  await page.locator('button[data-day="2026-06-27"]').click();
  await expect(page.locator('.chat-list__sticky .day__pill')).toHaveText(JUNE_27);

  // Scroll away, then ask for the same day again. The request carries a sequence
  // number precisely so this second pick is a new request: keyed on the day alone
  // it would compare equal to the first and silently do nothing.
  await page.locator('.chat-list').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator('.chat-list__sticky .day__pill')).toHaveText(JUNE_29);

  await openCalendar(page);
  await page.locator('button[data-day="2026-06-27"]').click();
  await expect(page.locator('.chat-list__sticky .day__pill')).toHaveText(JUNE_27);
  expect(await daySeparatorOffset(page, JUNE_27)).toBeLessThan(4);
  const first = await offsetFromListTop(page, FIRST_OF_27);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(140);

  // Picking an empty day leaves the reader where they were: the cell takes focus
  // (arrow keys must pass over it) but does not act, and the dialog stays open,
  // which is what makes that visible. Reached by focus + Enter, because a click
  // would be a no-op for the wrong reason (Playwright refuses to click an
  // `aria-disabled` control); the keyboard path is the one an arrow key uses.
  await openCalendar(page);
  await page.locator('button[data-day="2026-06-25"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await pill(page)).toBe(JUNE_27);
});
