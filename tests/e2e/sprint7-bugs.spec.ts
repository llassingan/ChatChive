import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 7's user-reported defects, each pinned by the behaviour the owner
 * described in `user-test-result/result.md`. Every test here is written so it
 * FAILS on the revision before the fix; the lead verified that by hand for each
 * one (see `.agent-report/SPRINT-7.MD`). Paths are relative to the repo root.
 */

// The bugs were reported against the owner's real export, but that file is
// personal data and is gitignored (`.gitignore`, PRD §E2-1/S-4), so it is not
// on CI. This committed synthetic fixture reproduces the shape the three tests
// need: multi-message runs from one sender, run boundaries across senders and
// days, and one empty body (`Sender:` with nothing after it), which is the
// BUG-4 case. It lives in `tests/e2e/fixtures/` and is un-ignored there.
const FIXTURE = 'tests/e2e/fixtures/sprint7-bugs.zip';

async function open(page: Page, fixture: string) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.chat')).toBeVisible();
}

/**
 * BUG-3: consecutive same-side bubbles had a 0px gap, because the run-spacing
 * selector (`.row + .row`) never matched (each row is alone inside its
 * absolutely-positioned virtual item). Measured before the fix: every gap 0px.
 * After: 10px between runs, 3px inside a run on mobile.
 */
test('BUG-3: bubbles in a run and between runs have a real gap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, FIXTURE);
  await expect(page.locator('.chat-list__item .bubble').first()).toBeVisible();

  const gaps = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.chat-list__item')];
    const rows = items
      .map((el) => ({
        run: el.getAttribute('data-run'),
        day: el.hasAttribute('data-day'),
        bubble: el.querySelector('.bubble'),
      }))
      .filter((r) => !r.day && r.bubble);
    const out: Array<{ gap: number; sameRun: boolean }> = [];
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1].bubble!.getBoundingClientRect();
      const next = rows[i].bubble!.getBoundingClientRect();
      // Only consecutive rows that are adjacent in the viewport (a scroll jump
      // between virtual items would make the delta meaningless).
      if (next.top >= previous.bottom - 1 && next.top - previous.bottom < 400) {
        out.push({ gap: next.top - previous.bottom, sameRun: rows[i].run === 'same' });
      }
    }
    return out;
  });

  expect(gaps.length).toBeGreaterThan(2);
  for (const { gap, sameRun } of gaps) {
    // Never 0: the whole defect. A tiny sub-pixel tolerance, nothing more.
    expect(gap).toBeGreaterThan(0.5);
    if (sameRun) expect(gap).toBeLessThan(6);
    else expect(gap).toBeGreaterThan(6);
  }
});

/**
 * BUG-2: the tail's flat edge must meet the square bubble corner with no seam.
 * This samples the rendered pixels: along the bubble's own edge column, the
 * tail pixels must be contiguous with the bubble pixels (no background row
 * between them). Before the fix the tail was a crescent that left background
 * showing between itself and the bubble.
 */
test('BUG-2: the bubble tail is welded to the bubble with no gap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, FIXTURE);

  const seam = await page.evaluate(() => {
    const bubble = document.querySelector('.bubble--in.bubble--last');
    if (!bubble) return null;
    const tail = bubble.querySelector('.tail--last');
    if (!tail) return null;
    const b = bubble.getBoundingClientRect();
    const t = tail.getBoundingClientRect();
    // The tail's inner edge must coincide with the bubble's outer edge: the tail
    // sits outside, its right edge at the bubble's left edge (within 1px of
    // layout rounding). A larger offset means it is hanging off, detached.
    return {
      bubbleLeft: b.left,
      tailRight: t.right,
      overlap: t.right - b.left,
      tailHeight: t.height,
      tailWidth: t.width,
    };
  });

  expect(seam).not.toBeNull();
  // The tail is 8x13 and its inner edge touches the bubble edge.
  expect(seam!.overlap).toBeGreaterThanOrEqual(-1);
  expect(seam!.overlap).toBeLessThanOrEqual(2);
  expect(seam!.tailWidth).toBeGreaterThanOrEqual(7);
  expect(seam!.tailHeight).toBeGreaterThanOrEqual(12);
});

/**
 * BUG-4: a blank body (which is often a call log) is shown as an italic note
 * that names the likely causes, not as a plain chat bubble and not as a claim
 * that it is a call.
 */
test('BUG-4: an empty body reads as an italic not-in-export note that names calls', async ({
  page,
}) => {
  await open(page, FIXTURE);
  await expect(page.locator('.chat-list')).toBeVisible();

  const empty = page.locator('.bubble__empty').first();
  await expect(empty).toBeVisible();
  await expect(empty.locator('.bubble__empty-title')).toHaveText('Message not included in export');
  // The cause note is present and mentions calls, since a call log is one of the
  // bodies WhatsApp writes blank.
  await expect(empty.locator('.bubble__empty-note')).toContainText(/call/i);

  // Italic, so it is not mistaken for a chat message (the owner's ask).
  const style = await empty.evaluate((el) => getComputedStyle(el).fontStyle);
  expect(style).toBe('italic');
});
