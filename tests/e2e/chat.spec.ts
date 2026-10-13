import { expect, test, type Page } from '@playwright/test';

/**
 * The chat view path in a real browser (backlog E3-4, E4-1, E4-2, E4-3, E4-5,
 * E4-7; PRD §6 flow). These specs double as antislop Delivery Gate evidence:
 * every interactive control is clicked and its effect asserted (R-26, R-35).
 *
 * Paths are relative to the working directory (`npm run test:e2e` runs from the
 * project root).
 */

const ZIP_FIXTURE = 'tests/e2e/fixtures/export.zip';
const AMBIGUOUS_FIXTURE = 'src/parser/fixtures/group-android-en.txt';
const LARGE_FIXTURE = 'tests/e2e/fixtures/large.txt';
const INJECTION_FIXTURE = 'tests/e2e/fixtures/script-injection.txt';

async function openZip(page: Page) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(ZIP_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();
}

test('a personal chat opens at the newest message with real values', async ({ page }) => {
  await openZip(page);

  // Header: the contact from the filename, and the subtitle.
  await expect(
    page.locator('.chat__header').getByText('Nadia Rush', { exact: true }),
  ).toBeVisible();

  // No picker for a personal chat: the filename already named the other person,
  // so the guess is applied without interrupting (E3-4).
  await expect(page.getByRole('dialog')).toBeHidden();

  // The newest message is in view on arrival (F-VIEW-13).
  await expect(page.locator('.chat-list').getByText('Got it')).toBeVisible();

  // The read-only footer reports real counts (F-RES-5).
  await expect(page.getByText('7 messages')).toBeVisible();
  await expect(page.getByText('Feb 6, 2026 to Jul 13, 2026')).toBeVisible();
  await expect(page.getByText('Read only')).toBeVisible();
});

test('bubbles align by sender and the newest message is at the bottom', async ({ page }) => {
  await openZip(page);

  // Outgoing bubbles sit to the right of incoming ones (F-VIEW-1). Nadia is "me"
  // in this export, so her bubbles are outgoing.
  const outgoing = page.locator('.bubble--out').first();
  const incoming = page.locator('.bubble--in').first();
  const [outBox, inBox] = [await outgoing.boundingBox(), await incoming.boundingBox()];
  expect(outBox && inBox && outBox.x > inBox.x).toBe(true);
  expect(await outgoing.getAttribute('data-outgoing')).toBe('true');

  // The list is scrolled to the bottom (F-VIEW-13).
  const distance = await page
    .locator('.chat-list')
    .evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
  expect(distance).toBeLessThanOrEqual(4);
});

test('date separators appear per day and group the messages', async ({ page }) => {
  await openZip(page);

  const days = page.locator('.day[role="separator"]');
  await expect(days).toHaveCount(4);
  // Real dates from the fixture, rendered in full because they are older than a week.
  await expect(days.first()).toHaveText('February 6, 2026');
});

test('a group asks "Which one is you?", and the answer re-aligns instantly', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(AMBIGUOUS_FIXTURE);

  // Resolve the ambiguous date order first (E3-3).
  await expect(page.getByRole('heading', { name: 'Which date is this?' })).toBeVisible();
  await page.getByRole('button', { name: 'Month first' }).click();

  // A group has no filename signal, so the picker opens on arrival (E3-4).
  const picker = page.getByRole('dialog');
  await expect(page.getByRole('heading', { name: 'Which one is you?' })).toBeVisible();
  await expect(picker.getByText('Nadia Rush')).toBeVisible();
  await expect(picker.getByText('+1 555 019 2834')).toBeVisible();

  // Choosing a participant moves only their bubbles to the right.
  await picker.getByRole('button', { name: /Nadia Rush/ }).click();
  await expect(picker).toBeHidden();
  expect(await page.locator('.bubble--out').count()).toBeGreaterThan(0);
  const aligned = await page.locator('.bubble--out').first().getAttribute('data-outgoing');
  expect(aligned).toBe('true');

  // The header menu reopens the picker, and "Nobody" puts everyone on the left.
  await page.getByLabel('Chat options').click();
  await page.getByRole('button', { name: 'Change who you are' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Nobody' }).click();
  await expect(page.locator('.bubble--out')).toHaveCount(0);
});

test('the group sender header and avatar show once per run', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(AMBIGUOUS_FIXTURE);
  await page.getByRole('button', { name: 'Month first' }).click();
  await page.getByRole('button', { name: 'Nobody' }).click();

  // One sender header per incoming run, with the name in a sender color (E4-4).
  const headers = page.locator('.sender__name');
  expect(await headers.count()).toBeGreaterThan(0);
  const color = await headers.first().evaluate((node) => getComputedStyle(node).color);
  expect(color).not.toBe('rgba(0, 0, 0, 0)');

  // Phone-only participants show the number as their identifier.
  await expect(page.locator('.sender__phone')).toHaveCount(1);
});

test('the scroll-to-bottom button appears after scrolling up and works', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(LARGE_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();

  // At the bottom there is no button.
  await expect(page.locator('.chat-list__to-bottom')).toHaveCount(0);

  // Scroll up the way a reader does. The list pins itself to the newest message
  // for a burst of frames after mount and only releases on a real input event
  // (wheel/touch/pointer/key), not on a scroll event. Assigning `scrollTop` from
  // script fires a scroll event but no input, so the burst re-pins the list and
  // the button never appears (F-VIEW-13). A real wheel releases it. With 5,001
  // messages the list is long, so one screen of wheel is a decisive move.
  const list = page.locator('.chat-list');
  const box = await list.boundingBox();
  if (!box) throw new Error('the message list has no box to scroll');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -(box.height + 100));

  // The scroll bookkeeping is throttled to one pass per animation frame, so wait
  // until the gesture has actually registered as "scrolled up" before asserting.
  await page.waitForFunction(() => {
    const node = document.querySelector('.chat-list');
    return !!node && node.scrollHeight - node.scrollTop - node.clientHeight > 80;
  });

  const button = page.getByRole('button', { name: 'Scroll to bottom' });
  await expect(button).toBeVisible();
  await button.click();

  await expect
    .poll(() =>
      page
        .locator('.chat-list')
        .evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight),
    )
    .toBeLessThanOrEqual(4);
  await expect(page.locator('.chat-list__to-bottom')).toHaveCount(0);
});

test('the sticky date pill tracks the day and fades out once scrolling stops (E4-5)', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(LARGE_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();
  await page.waitForTimeout(400);

  const pill = page.locator('.chat-list__sticky');
  const box = await page.locator('.chat-list').boundingBox();
  if (!box) throw new Error('the message list has no box to scroll');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600);

  // While scrolling, a floating copy of the current day's pill is up.
  await expect(pill).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('.chat-list__sticky .day__pill')).not.toBeEmpty();
  // `opacity` is a transitioned property (`.chat-list__sticky` animates it over
  // 200ms, MessageList.css), so a single read can land mid-animation and see a
  // value between 0 and 1. The claim is that it reaches 1 while the pill is up,
  // which is what polling asserts; the one-shot read asserted the incidental
  // timing of the wheel-to-read gap instead. The fade-out check below has always
  // polled, for the same reason.
  await expect.poll(() => pill.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');

  // DESIGN §3.5: it fades out about 1.5s after scrolling stops.
  await expect(pill).toHaveAttribute('data-visible', 'false', { timeout: 4000 });
  await expect.poll(() => pill.evaluate((node) => getComputedStyle(node).opacity)).toBe('0');
});

test('a crafted export renders as text, never as HTML (S-5)', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(INJECTION_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();

  // The literal characters are shown.
  await expect(page.getByText('<script>window.__pwned = true</script>')).toBeVisible();

  // Nothing executed: no injected global, and no element the payload would create.
  expect(await page.evaluate(() => '__pwned' in window)).toBe(false);
  expect(await page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.locator('script:not([src]):not([type="module"])').count()).toBeLessThanOrEqual(
    0,
  );
});

test('the list is virtualized: a 5k-message export keeps the DOM small', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(LARGE_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();

  // The footer counts every message (5,000 plus the encryption notice), while
  // only a window is in the DOM (E4-1).
  await expect(page.getByText('5,001 messages')).toBeVisible();
  const rendered = await page.locator('.chat-list__item').count();
  expect(rendered).toBeLessThan(60);
  expect(rendered).toBeGreaterThan(0);
});

test('a system notice and an empty body render as their own styles (E4-7)', async ({ page }) => {
  await openZip(page);

  // The encryption notice gets the lock-tinted style, not a bubble.
  await expect(page.locator('.pill--encryption')).toHaveCount(1);
  await expect(page.locator('.pill--encryption')).toContainText('end-to-end encrypted');
});

test('media renders real media, and missing media says so (F-VIEW-12)', async ({ page }) => {
  await openZip(page);

  // The zip carries a real 400x300 JPEG and a real 1.0 s Ogg Opus, so the image
  // renders at its natural size (no placeholder tile, and no "· 70 B" line) and
  // the voice note is a player rather than a file tile.
  const image = page.locator('.media-frame--image[data-state="ready"] img').first();
  await expect(image).toBeVisible();
  const natural = await image.evaluate((node) => ({
    width: (node as HTMLImageElement).naturalWidth,
    height: (node as HTMLImageElement).naturalHeight,
  }));
  expect(natural).toEqual({ width: 400, height: 300 });
  await expect(page.locator('.voice__toggle').first()).toBeVisible();

  // A text-only export references media that is not in the file, and carries an
  // omitted-media notice; both get an honest placeholder (F-VIEW-12).
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles('src/parser/fixtures/txt-only.txt');
  await expect(page.locator('.chat')).toBeVisible();
  await expect(page.getByText('Photo not included in export')).toBeVisible();
  await expect(page.getByText('Message not included in export')).toBeVisible();
});

test('the header back button and the menu "Close chat" both return home', async ({ page }) => {
  await openZip(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();

  await openZip(page);
  await page.getByLabel('Chat options').click();
  await page.getByRole('button', { name: 'Close chat' }).click();
  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
});

test('every message bubble carries a screen-reader label (DESIGN §5)', async ({ page }) => {
  await openZip(page);
  const label = await page.locator('.bubble').first().getAttribute('aria-label');
  expect(label).toMatch(/Nadia Rush|Felix Dorn/);
  expect(label).toMatch(/\d{2}[:.]\d{2}/);
});

test.describe('responsive: the chat fits with no horizontal overflow', () => {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    test(`fits at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openZip(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test('the run tail moves from the bottom edge on mobile to the top edge on web', async ({
  page,
}) => {
  // Mobile: the tail is on the last bubble of the run, at the bottom (DESIGN §3.2).
  await page.setViewportSize({ width: 390, height: 844 });
  await openZip(page);
  expect(
    await page.locator('.bubble--last .tail--last .tail__shape').first().boundingBox(),
  ).not.toBeNull();
  expect(await page.locator('.bubble--first .tail--first .tail__shape').first().isVisible()).toBe(
    false,
  );

  // Web: it moves to the first bubble, at the top.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles(ZIP_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();
  expect(await page.locator('.bubble--first .tail--first .tail__shape').first().isVisible()).toBe(
    true,
  );
  expect(await page.locator('.bubble--last .tail--last .tail__shape').first().isVisible()).toBe(
    false,
  );
});

test.describe('every shipped theme renders the chat', () => {
  for (const theme of ['light', 'classic']) {
    test(`${theme} theme opens the chat with no overflow`, async ({ page }) => {
      // No theme toggle is shipped yet (PRD puts it in v0.2), so the attribute
      // is set the way E7-3 will set it. An init script runs before the parser
      // has built the root element, so `documentElement` is still null there and
      // assigning to it throws (it does not apply the theme); defer to
      // `DOMContentLoaded`, which lands before the app renders.
      await page.addInitScript((value) => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.dataset.theme = value;
        });
      }, theme);

      await openZip(page);

      // Establish that the theme actually applied before asserting anything
      // about how it looks. Without this line the two assertions below are
      // theme-invariant: measured, "7 messages" is visible and the overflow is 0
      // with the theme applied, with the wrong theme, and with no `data-theme`
      // at all, which is the state SPRINT-5.MD §4.4's H1 left behind, where a
      // loop named "every shipped theme" ran against the default for two
      // sprints while passing.
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      await expect(page.getByText('7 messages')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);

      // And the theme is visible, not merely set: the timestamp takes
      // `--text-secondary`, whose three values (measured on the built app with
      // `export.zip`) are all different. A loop that asserts only overflow and a
      // message count cannot tell one theme from another; this can.
      const secondary = { light: 'rgb(84, 100, 109)', classic: 'rgb(192, 206, 214)' }[theme];
      expect(secondary, `no measured --text-secondary for theme ${theme}`).toBeDefined();
      if (secondary) {
        await expect(page.locator('.meta').first()).toHaveCSS('color', secondary);
      }
    });
  }
});
