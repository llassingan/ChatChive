import { expect, test, type Page } from '@playwright/test';

/**
 * The media path in a real browser (backlog E5-2, E5-3, E5-4, E5-6, E5-7).
 *
 * Every assertion here runs against `tests/e2e/fixtures/media.zip`, whose bytes
 * are real and decodable (VP8 WebM, not MP4: Playwright's bundled Chromium has
 * no H.264, so an mp4 fixture would fail for a reason that says nothing about
 * the app). The one exception is `AUDIO-20260706-WA0008.mp3`, which is junk on
 * purpose: it is the "Can't play here" path.
 *
 * The spec doubles as antislop Delivery Gate evidence. Four of its tests are
 * gate items rather than feature checks and are labelled as such:
 *
 * - no console error anywhere in this file (an unhandled rejected `extract`
 *   after a close would surface here),
 * - no focusable control inside an `aria-hidden` subtree (R-32, axe
 *   `aria-hidden-focus`),
 * - the scrim band's flat `rgba(0, 0, 0, 0.6)` (R-25),
 * - zero network requests during a media import (PRD S-2).
 */

const MEDIA_ZIP = 'tests/e2e/fixtures/media.zip';
const TXT_ONLY = 'src/parser/fixtures/txt-only.txt';

/**
 * Median gap between animation frames, in ms, optionally while scrolling.
 * `perf.spec.ts` has the same helper for the 100k export; it is duplicated
 * deliberately, because neither spec is allowed to import the other's file.
 *
 * The median, not the mean: one long frame (a GC pause, a slow op on a loaded
 * runner) moves an average and says nothing about the row cost under test.
 */
async function medianFrameMs(page: Page, scrollPx: number, frames = 60): Promise<number> {
  const gaps: number[] = await page.evaluate(
    ({ px, count }) =>
      new Promise<number[]>((resolve) => {
        const list = document.querySelector<HTMLElement>('.chat-list');
        const samples: number[] = [];
        let last = performance.now();
        let frame = 0;
        const step = () => {
          const now = performance.now();
          samples.push(now - last);
          last = now;
          if (list && px > 0) list.scrollTop += px;
          if (++frame < count) requestAnimationFrame(step);
          else resolve(samples);
        };
        requestAnimationFrame(step);
      }),
    { px: scrollPx, count: frames },
  );
  const sorted = gaps.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Collect console errors and page errors for the whole test. Every test in this
 * file calls it: an unhandled rejection from a closed session is exactly the
 * class of bug it exists to catch, and it cannot be asserted after the fact.
 */
function failOnConsoleError(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function importMediaZip(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(MEDIA_ZIP);
  // The parse runs in a Worker and the zip's media bytes are real, so this is
  // slower than the text fixtures; the suite's own 5s default is tight when
  // several workers unpack at once (`perf.spec.ts` allows 60s for its 100k
  // file for the same reason).
  await expect(page.locator('.chat')).toBeVisible({ timeout: 30_000 });
}

/**
 * Wait for an entry's real body rather than its pending box. The pending box is
 * a static `--card-inner` rectangle, so a test that only waits for `.media-frame`
 * would pass against a box that never resolves.
 */
async function waitReady(page: Page, selector: string): Promise<void> {
  // `.first()`: `media.zip` carries three images, so a bare locator is a strict
  // mode violation here.
  await expect(page.locator(`${selector}[data-state="ready"]`).first()).toBeVisible();
  await expect(page.locator(`${selector}[data-state="pending"]`)).toHaveCount(0);
}

test.describe('E5-2: image and video', () => {
  test('a JPEG renders at its real size, inside the bubble', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const image = page.locator('.media-frame--image[data-state="ready"] img').first();
    await expect(image).toBeVisible();

    // The bytes are real, so the natural size is the fixture's own: 400x300.
    const natural = await image.evaluate((node) => ({
      width: (node as HTMLImageElement).naturalWidth,
      height: (node as HTMLImageElement).naturalHeight,
    }));
    expect(natural).toEqual({ width: 400, height: 300 });

    // The rendered image stays inside its bubble, and its ratio came from the
    // element rather than staying at the 4:3 reservation.
    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    const ratio = await image.evaluate(
      (node) => node.getBoundingClientRect().width / node.getBoundingClientRect().height,
    );
    expect(ratio).toBeGreaterThan(400 / 300 - 0.05);
    expect(ratio).toBeLessThan(400 / 300 + 0.05);

    const bubble = await image.evaluate(
      (node) => node.closest('.bubble')?.getBoundingClientRect().width ?? 0,
    );
    expect(box && box.width).toBeLessThanOrEqual(bubble + 1);

    expect(errors).toEqual([]);
  });

  test('the tall image is clamped to 440px', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    // 200x1500 would be 4:1 in a 300px column; the clamp is what stops it.
    const frames = page.locator('.media-frame--image[data-state="ready"]');
    await expect(frames).toHaveCount(3);

    const heights: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const height = await frames
        .nth(index)
        .evaluate((node) => node.getBoundingClientRect().height);
      heights.push(height);
    }
    // At least one image is the tall one, and none of them exceeds the clamp.
    expect(Math.max(...heights)).toBeLessThanOrEqual(441);
    expect(Math.max(...heights)).toBeGreaterThan(400);

    expect(errors).toEqual([]);
  });

  test('a captioned image keeps the meta on the caption line', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    // The second image carries a caption, so its bubble must NOT take the
    // overlay branch: the meta shares a line box with the caption's last line.
    const caption = page.getByText('Späti an der Ecke', { exact: false });
    await expect(caption).toBeVisible();

    // `overlay` on a visual means "ready, no caption" (MessageRow.tsx), so a
    // captioned bubble must NOT take the class: the meta shares the caption's
    // line box instead of sitting on the scrim.
    const bubble = page.locator('.bubble', { has: caption });
    await expect(bubble).not.toHaveClass(/bubble--meta-overlay/);

    const [captionBox, metaBox] = await Promise.all([
      caption.boundingBox(),
      bubble.locator('.meta').boundingBox(),
    ]);
    expect(captionBox).not.toBeNull();
    expect(metaBox).not.toBeNull();
    if (captionBox && metaBox) {
      // Same line box: vertical overlap, and the meta to the right of the text.
      const overlap = captionBox.y + captionBox.height - metaBox.y;
      expect(overlap).toBeGreaterThan(0);
      expect(metaBox.x).toBeGreaterThan(captionBox.x);
    }

    expect(errors).toEqual([]);
  });

  test('the uncaptioned image puts its meta on the scrim, over a flat 0.6 band (R-25)', async ({
    page,
  }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const overlay = page.locator('.bubble--meta-overlay').first();
    await expect(overlay).toBeVisible();

    // The scrim: a 40px band whose colour is the flat `rgba(0, 0, 0, 0.6)` where
    // the text sits. A gradient that reached 0.5 only at the last pixel would
    // measure 3.95:1 under 12px white; this is 5.74:1 (plan §4.3).
    const scrim = await overlay.evaluate((node) => {
      const style = getComputedStyle(node.querySelector('.bubble__content') as Element, '::after');
      return { height: style.height, background: style.backgroundImage };
    });
    expect(scrim.height).toBe('40px');
    expect(scrim.background).toContain('rgba(0, 0, 0, 0.6)');

    const metaColor = await overlay
      .locator('.meta')
      .evaluate((node) => getComputedStyle(node).color);
    expect(metaColor).toBe('rgb(255, 255, 255)');

    expect(errors).toEqual([]);
  });

  test('the video plays from an overlay button and then shows native controls', async ({
    page,
  }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const video = page.locator('.media-frame--video video');
    await expect(video).toBeVisible();
    await expect(video).not.toHaveAttribute('autoplay', /.*/);
    await expect(video).toHaveAttribute('playsinline', /.*/);
    expect(await video.evaluate((node) => (node as HTMLVideoElement).controls)).toBe(false);

    const play = page.locator('.media-frame--video .media-frame__play');
    await expect(play).toBeVisible();
    // A real accessible name, not an aria-hidden glyph.
    await expect(play).toHaveAttribute('aria-label', /Play video/);

    await play.click();
    await expect
      .poll(async () => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0);
    expect(await video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(false);
    // The overlay steps aside once playback owns the frame.
    await expect(play).toHaveCount(0);
    expect(await video.evaluate((node) => (node as HTMLVideoElement).controls)).toBe(true);

    expect(errors).toEqual([]);
  });
});

test.describe('E5-3: sticker', () => {
  test('the animated WebP has no bubble, caps at 160px, and keeps its time pill', async ({
    page,
  }) => {
    const errors = failOnConsoleError(page);
    // Mobile is where the 160px cap applies (190px on web).
    await page.setViewportSize({ width: 390, height: 844 });
    await importMediaZip(page);

    const sticker = page.locator('.bubble--sticker .sticker img');
    await expect(sticker).toBeVisible();

    const box = await sticker.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(160);
      expect(box.height).toBeLessThanOrEqual(160);
      // The animated fixture is 120x120, so it renders at its own size.
      expect(box.width).toBeGreaterThan(100);
    }

    const bubbleBackground = await page
      .locator('.bubble--sticker')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bubbleBackground);

    // The time pill below it, at the sender's edge, reusing the jumbo rules.
    await expect(page.locator('.bubble--sticker .meta')).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('E5-4: voice and audio', () => {
  test('the voice note plays, pauses, and its slider seeks with arrow keys (R-32)', async ({
    page,
  }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const toggle = page.locator('.voice__toggle').first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', /Play/);

    const audio = page.locator('.voice audio').first();

    await toggle.click();
    await expect
      .poll(async () => audio.evaluate((node) => (node as HTMLAudioElement).currentTime))
      .toBeGreaterThan(0);
    // The button becomes Pause while it plays.
    await expect(toggle).toHaveAttribute('aria-label', /Pause/);
    // Pause reaches the element, not just the label. This comes first, while the
    // clip is definitely still running: the fixture's note is 1.0065s, so every
    // round-trip between here and a later click (a poll, a focus, a keypress)
    // can outlast it under parallel load. If the clip ends first, that later
    // click becomes a *play* click and `paused` reads false: the product being
    // right and the test racing a one-second clip.
    await toggle.click();
    expect(await audio.evaluate((node) => (node as HTMLAudioElement).paused)).toBe(true);
    await expect(toggle).toHaveAttribute('aria-label', /Play/);

    // A real slider with `aria-valuetext` in DESIGN's `0:03 of 0:06` shape. Its
    // own claims need no playback, so they are asserted while the note is paused
    // and nothing here depends on elapsed audio.
    const seek = page.locator('.voice__seek').first();
    await expect(seek).toHaveAttribute('aria-label', /Seek/);
    await expect
      .poll(async () => seek.getAttribute('aria-valuetext'))
      .toMatch(/^\d+:\d\d of \d+:\d\d$/);

    // Arrow keys seek. This runs on the finished note because of the engine,
    // not for convenience: the fixture's voice note is Opus in an Ogg
    // container, and WebKit refuses an arrow-key seek on that stream until it
    // has been played through. Measured on this fixture, one ArrowRight on a
    // paused element that has never played traces `seeking t=0.100` and then
    // snaps back with `seeked t=0.000`, so the slider reads no change at all
    // (0.2 -> 0). Neighbouring controls rule out the app as the cause: the
    // fixture's MP3 row, same component and same slider, seeks fine while
    // paused (0 -> 0.1), and a bare <audio> given these same Opus bytes
    // accepts the seek at `readyState` 4 (preload="auto") and refuses it at 3
    // (preload="metadata", which is what this component sets).
    //
    // Play the note through first and the same keypress lands: the slider goes
    // 1 -> 0.9 and the element's own `currentTime` follows to 0.9, 5/5 per
    // engine. Stepping backward is also the honest gesture, because a paused
    // element cannot advance on its own, so the assertion cannot be satisfied
    // by playback drifting forward under it.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', /Pause/);
    await page.waitForFunction(
      () => (document.querySelector('.voice audio') as HTMLAudioElement | null)?.ended === true,
      undefined,
      { timeout: 30_000 },
    );
    await expect(toggle).toHaveAttribute('aria-label', /Play/);
    const endPosition = await audio.evaluate((node) => (node as HTMLAudioElement).currentTime);
    const endSlider = await seek.inputValue();

    await seek.focus();
    await expect(seek).toBeFocused();
    await seek.press('ArrowLeft');
    await expect.poll(async () => Number(await seek.inputValue())).toBeLessThan(Number(endSlider));
    // The element itself moved back, not only the slider's own value.
    await expect
      .poll(async () => audio.evaluate((node) => (node as HTMLAudioElement).currentTime))
      .toBeLessThan(endPosition);

    // The clock shape survives the seek.
    await expect
      .poll(async () => seek.getAttribute('aria-valuetext'))
      .toMatch(/^\d+:\d\d of \d+:\d\d$/);

    // Seeking a finished note never starts it again.
    expect(await audio.evaluate((node) => (node as HTMLAudioElement).paused)).toBe(true);

    expect(errors).toEqual([]);
  });

  test('a finished note replays when play is pressed again', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const toggle = page.locator('.voice__toggle').first();
    const audio = page.locator('.voice audio').first();

    // Play it through to the end. The fixture's note is 1.0065s, and `ended` is
    // the state under test, so this waits for the element's own state rather
    // than for a duration.
    await toggle.click();
    await page.waitForFunction(
      () => (document.querySelector('.voice audio') as HTMLAudioElement | null)?.ended === true,
      undefined,
      { timeout: 30_000 },
    );
    await expect(toggle).toHaveAttribute('aria-label', /Play/);

    // Press play again. `play()` cannot revive an element whose playback has
    // ended, and that is the state a listener creates by letting the note
    // finish, so reach this state by *playing* to the end and never by seeking
    // there: the two are different engine states, and only the natural end
    // exposes the bug.
    //
    // `play()` is asynchronous, so `paused` must be polled rather than read in
    // the same tick as the click.
    await toggle.click();
    await expect
      .poll(async () => audio.evaluate((node) => (node as HTMLAudioElement).paused))
      .toBe(false);
    await expect
      .poll(async () => audio.evaluate((node) => (node as HTMLAudioElement).ended))
      .toBe(false);

    // Running from a playable position, not parked at the end. Polled rather
    // than read once: the replay path calls `load()`, which resets the element,
    // so `duration` is NaN for a frame or two after the click (measured, 1-2
    // frames on both engines) and a one-shot `currentTime < duration` read
    // asserts `0 < NaN`, which is false against a perfectly good replay. The
    // not-ready sentinel has to be `Infinity` and not a small number, because
    // `-1 < 1` is true: a sentinel below the bound would let the reset frame
    // satisfy the assertion instead of waiting it out.
    await expect
      .poll(async () =>
        audio.evaluate((node) => {
          const element = node as HTMLAudioElement;
          return Number.isFinite(element.duration)
            ? element.currentTime / element.duration
            : Number.POSITIVE_INFINITY;
        }),
      )
      .toBeLessThan(1);

    // The toggle reads Pause while it plays again.
    await expect(toggle).toHaveAttribute('aria-label', /Pause/);

    await toggle.click(); // leave nothing playing for the next test
    expect(errors).toEqual([]);
  });

  test('one player at a time: starting a voice note stops the video', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const video = page.locator('.media-frame--video video');
    await page.locator('.media-frame--video .media-frame__play').click();
    await expect
      .poll(async () => video.evaluate((node) => (node as HTMLVideoElement).paused))
      .toBe(false);

    await page.locator('.voice__toggle').first().click();

    // The video gave up playback: "one player at a time" is a page-level fact.
    await expect
      .poll(async () => video.evaluate((node) => (node as HTMLVideoElement).paused))
      .toBe(true);

    expect(errors).toEqual([]);
  });

  test('the junk audio says "Can\'t play here" and still offers the bytes', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    // The junk file never enters a loading state forever: the engine's refusal
    // has to become the fallback tile.
    const broken = page.locator('.media--broken', { hasText: "Can't play here" });
    await expect(broken).toBeVisible();

    const download = broken.getByRole('link', { name: /Download AUDIO-20260706-WA0008\.mp3/ });
    await expect(download).toHaveAttribute('download', 'AUDIO-20260706-WA0008.mp3');
    await expect(download).toHaveAttribute('href', /^blob:/);

    expect(errors).toEqual([]);
  });
});

test.describe('E5-6: document', () => {
  test('the PDF tile names the file, its size, and downloads with the real name', async ({
    page,
  }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const tile = page.locator('.media--document');
    await expect(tile).toBeVisible();
    await expect(tile.getByText('Rechnung 2026.pdf')).toBeVisible();
    await expect(tile.locator('.doc-tile[data-tone="pdf"]')).toBeVisible();
    await expect(tile.locator('.media__sub')).toHaveText(/^PDF · \d+(\.\d)? KB$/);

    const download = tile.getByRole('link', { name: 'Download Rechnung 2026.pdf' });
    await expect(download).toHaveAttribute('download', 'Rechnung 2026.pdf');

    const [event] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(event.suggestedFilename()).toBe('Rechnung 2026.pdf');

    expect(errors).toEqual([]);
  });
});

test.describe('E5-7: the three not-there states', () => {
  test('a reference the archive lacks says so, with the filename and no control', async ({
    page,
  }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);

    const missing = page.locator('.media--missing');
    await expect(missing).toBeVisible();
    await expect(missing).toContainText('Photo not included in export');
    await expect(missing).toContainText('IMG-20260707-WA0009.jpg');
    // Nothing to hand over, so nothing to click.
    await expect(missing.locator('a')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('a tile that replaces a frame keeps its Download control clickable', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/broken-image.zip');
    await expect(page.locator('.chat')).toBeVisible({ timeout: 30_000 });

    // The bytes were extracted (the store said `ready`) and the decoder rejected
    // them, so the body painted a tile. The row must not move the meta onto a
    // scrim that does not exist: with `bubble--meta-overlay` the meta is
    // absolutely positioned over the Download control, which then cannot be
    // clicked at all (QA, Sprint 5).
    const tile = page.locator('.media--broken');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText("Photo can't be shown here");
    await expect(page.locator('.bubble--meta-overlay')).toHaveCount(0);

    // The claim is the hit test, not presence: what is actually on top at the
    // control's centre.
    const hit = await page.evaluate(() => {
      const control = document.querySelector<HTMLElement>('.media--broken .media__download');
      if (!control) return null;
      const box = control.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return {
        topTag: top?.tagName ?? null,
        topClass: (top as HTMLElement | null)?.className ?? null,
        isControl: top === control || control.contains(top),
      };
    });
    expect(hit).not.toBeNull();
    expect(hit?.isControl, `topmost at the control is ${hit?.topTag}.${hit?.topClass}`).toBe(true);

    // And a real click reaches it: handing the bytes over is the one thing this
    // tile can still do, so losing the click would lose the sprint's own control.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      tile.getByRole('link', { name: /Download/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('IMG-20260609-WA0001.jpg');

    expect(errors).toEqual([]);
  });

  test('a text-only export still shows the same tile (unchanged from Sprint 4)', async ({
    page,
  }) => {
    const errors = failOnConsoleError(page);
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(TXT_ONLY);
    await expect(page.locator('.chat')).toBeVisible();

    await expect(page.getByText('Photo not included in export')).toBeVisible();
    await expect(page.getByText('Message not included in export')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('a location is a real link and a contact is not (§3.2)', async ({ page }) => {
    const errors = failOnConsoleError(page);

    // An inline text export, not the zip: a location is a bare maps line in the
    // chat text, and the zip's media bytes are irrelevant to this question. It
    // also means this test runs as soon as the tree compiles.
    const export_ = [
      '13/07/2026, 15.02 - Marcus Vane: Where should we meet?',
      '13/07/2026, 15.03 - Elin Sato: https://maps.google.com/?q=-6.2088,106.8456',
      '13/07/2026, 15.04 - Marcus Vane: Elin.vcf (file attached)',
      '13/07/2026, 15.05 - Elin Sato: See you there',
    ].join('\n');

    await page.goto('/');
    await page.setInputFiles('input[type="file"]', {
      name: 'location.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(export_, 'utf8'),
    });
    await expect(page.locator('.chat')).toBeVisible();

    // The maps URL is an anchor with the app's one outbound treatment. It is
    // NOT "Location not included in export": a location is always
    // `resolved: false`, so the order of the branches in `MediaBody` is the
    // thing under test here.
    const link = page.getByRole('link', { name: 'https://maps.google.com/?q=-6.2088,106.8456' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://maps.google.com/?q=-6.2088,106.8456');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByText('not included in export')).toHaveCount(0);

    // A link is a control, so the row is exposed rather than hidden: an anchor
    // inside an `aria-hidden` subtree is the axe bug the gate test hunts.
    const buriedLinks = await page.evaluate(() => {
      let count = 0;
      for (const hidden of document.querySelectorAll('[aria-hidden="true"]')) {
        count += hidden.querySelectorAll('a[href], button, input').length;
      }
      return count;
    });
    expect(buriedLinks).toBe(0);

    // The `.vcf` next to it keeps the plain tile: no anchor, no bytes.
    const contact = page.locator('.media', { hasText: 'Elin.vcf' });
    await expect(contact).toBeVisible();
    await expect(contact.locator('a')).toHaveCount(0);
    await expect(contact).toContainText('Contact');

    expect(errors).toEqual([]);
  });
});

test.describe('gate evidence', () => {
  test('no focusable control sits inside an aria-hidden subtree (R-32)', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);
    await waitReady(page, '.media-frame--image');

    // The whole tree, not just the bubbles: a helper, a dialog or the sticky
    // pill could hide a control just as easily.
    const buried = await page.evaluate(() => {
      const selector = '[tabindex], button, input, a[href], select, textarea';
      const found: string[] = [];
      for (const hidden of document.querySelectorAll('[aria-hidden="true"]')) {
        for (const control of hidden.querySelectorAll(selector)) {
          const tag = control.tagName.toLowerCase();
          const name =
            control.getAttribute('aria-label') ?? control.textContent?.trim().slice(0, 40) ?? '';
          found.push(`${tag}[${name}] inside hidden`);
        }
      }
      return found;
    });
    expect(buried).toEqual([]);

    // Only ready media rows lose the attribute, and they do so because they
    // hold a real control. React omits the attribute entirely when it is
    // undefined, so the test is "not exactly true", never a bare `:not()` that
    // an `aria-hidden="false"` would also satisfy.
    const exposedWithoutMedia = await page
      .locator('.bubble__content')
      .evaluateAll(
        (nodes) =>
          nodes
            .filter((node) => node.getAttribute('aria-hidden') !== 'true')
            .filter((node) => node.querySelector('.media-frame, .media, .voice, .sticker') === null)
            .length,
      );
    expect(exposedWithoutMedia).toBe(0);

    // Every control is reachable by Tab and ends up focused.
    const toggle = page.locator('.voice__toggle').first();
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveCSS('outline-style', 'solid');

    expect(errors).toEqual([]);
  });

  test('a media import makes zero network requests (PRD S-2)', async ({ page, baseURL }) => {
    const appOrigin = new URL(baseURL ?? 'http://localhost:4173').origin;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const offending: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      // `blob:`/`data:` are same-document sources the app builds in memory.
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      if (new URL(url).origin !== appOrigin) offending.push(`${request.method()} ${url}`);
    });

    const errors = failOnConsoleError(page);
    await page.locator('input[type="file"]').setInputFiles(MEDIA_ZIP);
    await expect(page.locator('.chat')).toBeVisible();
    await waitReady(page, '.media-frame--image');
    await page.waitForTimeout(500);

    expect(offending, `Unexpected network requests: ${offending.join(', ')}`).toEqual([]);
    expect(errors).toEqual([]);
  });

  test.describe('every shipped theme renders the media', () => {
    for (const theme of ['dark', 'light', 'classic']) {
      test(`${theme} theme: player, tile and scrim`, async ({ page }) => {
        // An init script runs at `document_start`, before the parser has built
        // the root element, so `document.documentElement` is still null there
        // and assigning to it throws. Deferring to `DOMContentLoaded` sets the
        // attribute before the assertions below read computed styles.
        await page.addInitScript((value) => {
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.dataset.theme = value;
          });
        }, theme);

        const errors = failOnConsoleError(page);
        await importMediaZip(page);
        await waitReady(page, '.media-frame--image');

        // The scrim is the same flat 0.6 in every theme: a white photo under
        // white 12px text is a contrast question, not a theme question.
        const background = await page
          .locator('.bubble--meta-overlay .bubble__content')
          .first()
          .evaluate((node) => getComputedStyle(node, '::after').backgroundImage);
        expect(background).toContain('rgba(0, 0, 0, 0.6)');

        // The document tile's PDF color is a local value, and it is the measured
        // one, not DESIGN §3.15's failing `#E2574C` (plan §4.2).
        const tileBackground = await page
          .locator('.doc-tile[data-tone="pdf"]')
          .evaluate((node) => getComputedStyle(node).backgroundColor);
        expect(tileBackground).toBe('rgb(192, 57, 43)');

        // The player's bars read the per-theme tokens: an unplayed bar takes
        // `--text-secondary` and a played one the new `--wave-played` (plan
        // §4.1). A note at rest shows no played bars, so play it first: the
        // assertion is on a rendered bar, not on a token lookup.
        const unplayed = await page
          .locator('.voice__bar[data-played="false"]')
          .first()
          .evaluate((node) => getComputedStyle(node).backgroundColor);
        expect(unplayed).not.toBe('rgba(0, 0, 0, 0)');

        await page.locator('.voice__toggle').first().click();
        const playedBar = page.locator('.voice__bar[data-played="true"]').first();
        await expect(playedBar).toBeVisible();
        const played = await playedBar.evaluate((node) => getComputedStyle(node).backgroundColor);
        expect(played).not.toBe(unplayed);
        expect(played).not.toBe('rgba(0, 0, 0, 0)');
        expect(errors).toEqual([]);
      });
    }
  });

  test.describe('responsive: media causes no horizontal overflow', () => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      test(`fits at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const errors = failOnConsoleError(page);
        await importMediaZip(page);
        await waitReady(page, '.media-frame--image');

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        // Every image stays inside its own bubble.
        const escaping = await page.locator('.media-frame--image img').evaluateAll(
          (nodes) =>
            nodes.filter((node) => {
              const bubble = node.closest('.bubble');
              if (!bubble) return true;
              const image = node.getBoundingClientRect();
              const box = bubble.getBoundingClientRect();
              return image.right > box.right + 1 || image.left < box.left - 1;
            }).length,
        );
        expect(escaping).toBe(0);

        expect(errors).toEqual([]);
      });
    }
  });

  test('the media chat scrolls inside the idle frame budget', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);
    await waitReady(page, '.media-frame--image');
    await page.waitForTimeout(300);

    await page.locator('.chat-list').evaluate((node: HTMLElement) => {
      node.scrollTop = node.scrollHeight * 0.4;
    });
    await page.waitForTimeout(150);

    // Median frame gap while scrolling, against the same run's idle gap, using
    // the shape `perf.spec.ts` established. The median, not the mean: one long
    // frame (a GC pause, a slow op on a loaded runner) moves an average and
    // says nothing about the row, which is the thing under test.
    const idle = await medianFrameMs(page, 0);
    await page.locator('.chat-list').evaluate((node: HTMLElement) => {
      node.scrollTop = node.scrollHeight * 0.6;
    });
    const scrolling = await medianFrameMs(page, 30);

    console.log(`media perf: idle=${idle.toFixed(1)}ms scroll=${scrolling.toFixed(1)}ms`);
    // The regression this guards (a mounted row re-rendering on every scroll
    // frame) is a scroll-versus-idle ratio, so the budget is relative to the
    // same run's idle gap. `perf.spec.ts` uses this exact 2.5x/+12ms shape for
    // the 100k export; it is duplicated rather than imported because neither
    // spec owns the other.
    expect(scrolling).toBeLessThan(Math.max(idle * 2.5, idle + 12));

    expect(errors).toEqual([]);
  });
});

test.describe('closing the chat with media in the window', () => {
  test('Back leaves no console error and no worker complaint', async ({ page }) => {
    const errors = failOnConsoleError(page);
    await importMediaZip(page);
    await waitReady(page, '.media-frame--image');

    // A voice note playing when the chat closes is the case where an unhandled
    // rejected `extract` would reach the console (plan §7.8).
    await page.locator('.voice__toggle').first().click();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
    await page.waitForTimeout(400);

    expect(errors).toEqual([]);
  });
});
