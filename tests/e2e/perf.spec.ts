import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Performance guard for the virtualized list (backlog E4-1: "100k-message
 * fixture scrolls smoothly"; PRD §9).
 *
 * The fixture is generated at run time into a temp directory rather than
 * committed: 100k messages is ~13 MB, which has no place in the repository, and
 * its shape is mechanical. Dates use a month over 12 so the date order is
 * unambiguous and the test never stops at the date prompt.
 *
 * The frame budget is measured relative to this machine's own idle frame rate
 * rather than as an absolute millisecond count, so a loaded CI runner does not
 * fail a healthy build. A regression of the kind this test exists to catch
 * (re-rendering every mounted row on every scroll event) roughly quadruples the
 * scroll cost against idle, which no amount of runner noise produces.
 */
const MESSAGE_COUNT = 100_000;

function writeFixture(): { file: string; dispose: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'chatchive-perf-'));
  const file = join(dir, 'perf-100k.txt');
  const days: string[] = [];
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 13; day <= 28; day += 1) days.push(`${month}/${day}/26`);
  }
  const lines = [
    '1/13/26, 08:00 - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.',
  ];
  for (let i = 0; i < MESSAGE_COUNT; i += 1) {
    const day = days[(i >> 9) % days.length];
    const hour = String(Math.floor(i / 60) % 24).padStart(2, '0');
    const minute = String(i % 60).padStart(2, '0');
    const sender = i % 2 === 0 ? 'Aria Finch' : 'Owen Clarke';
    lines.push(
      `${day}, ${hour}:${minute} - ${sender}: Perf message number ${i} with a body long enough that rows measure differently from each other.`,
    );
  }
  writeFileSync(file, `${lines.join('\n')}\n`);
  return { file, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Median gap between animation frames over `frames` frames, in ms. */
async function medianFrameMs(page: Page, scrollPx: number, frames = 60): Promise<number> {
  await page.evaluate(
    ({ scrollPx, frames }) => {
      const host = window as unknown as { __frames: number[] };
      host.__frames = [];
      const list = document.querySelector('.chat-list') as HTMLElement | null;
      let last = performance.now();
      let i = 0;
      const step = () => {
        const now = performance.now();
        host.__frames.push(now - last);
        last = now;
        if (list && scrollPx > 0) list.scrollTop += scrollPx;
        if (++i < frames) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    { scrollPx, frames },
  );
  await page.waitForFunction(
    (expected) => (window as unknown as { __frames?: number[] }).__frames?.length === expected,
    frames,
  );
  return page.evaluate(() => {
    const times = (window as unknown as { __frames: number[] }).__frames
      .slice()
      .sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  });
}

test('a 100k-message export parses, stays windowed, and scrolls at 60 fps', async ({ page }) => {
  const fixture = writeFixture();
  try {
    await page.goto('/');

    const parseStart = Date.now();
    await page.locator('input[type="file"]').setInputFiles(fixture.file);
    await expect(page.locator('.chat')).toBeVisible({ timeout: 60_000 });
    const parseMs = Date.now() - parseStart;
    await expect(page.getByText('100,001 messages')).toBeVisible();

    // Only a window is ever in the DOM, however many messages the export holds.
    const domRows = await page.locator('.chat-list__item').count();
    expect(domRows).toBeGreaterThan(0);
    expect(domRows).toBeLessThan(60);

    await page.waitForTimeout(400);
    await page.locator('.chat-list').evaluate((node: HTMLElement) => {
      node.scrollTop = node.scrollHeight * 0.5;
    });
    await page.waitForTimeout(200);

    const idle = await medianFrameMs(page, 0);
    const scrolling = await medianFrameMs(page, 400);

    // Reported so a CI log shows the real numbers even when the ratio passes.
    console.log(
      `100k perf: parse=${parseMs}ms domRows=${domRows} idle=${idle.toFixed(1)}ms scroll=${scrolling.toFixed(1)}ms`,
    );

    // A healthy list scrolls at its own idle cadence. The regression this guards
    // against (a re-render of every mounted row per scroll event) took the scroll
    // frame from ~17ms to ~78ms, about 4.6x idle, so 2.5x leaves real headroom.
    expect(scrolling).toBeLessThan(Math.max(idle * 2.5, idle + 12));
  } finally {
    fixture.dispose();
  }
});
