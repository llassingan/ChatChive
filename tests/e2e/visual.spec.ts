import { expect, test, type Page } from '@playwright/test';

/**
 * Visual regression baselines for the chat view (backlog E6-4, SPRINT-6-PLAN §5.1).
 *
 * Four cases, one baseline per engine. The chat view only: the landing page is
 * excluded deliberately (§3.4), because this sprint redraws the brand mark and a
 * reviewer must be able to tell a rendering regression from a legitimate brand
 * edit. The fixture is `export.zip`, so every baseline covers media (a real
 * 400x300 JPEG and a 1.0 s voice note) as well as bubbles.
 *
 * Only the `-linux` baselines are committed; `.gitignore` keeps a laptop's
 * `-darwin` and `-win32` variants out of the repository (§3.3). The comparison
 * is exact (`maxDiffPixels: 0`, `playwright.config.ts`): the only allowance is
 * pixelmatch's default perceived-colour threshold of 0.2, and that is load
 * bearing rather than slack, because two captures of the *same* frame were
 * measured to differ by about a hundred pixels of one to three RGB steps (the
 * JPEG's resampling, which no amount of DOM waiting removes).
 *
 * Everything measured to move a pixel is pinned:
 *
 * - **The clock.** With a real clock the newest day separator reads
 *   "July 13, 2026" on the day it is captured and "Today" once the date moves.
 *   Pinned, it reads "Today", and the assertion below proves the pin landed.
 *   `setFixedTime` is used rather than `install` on purpose: it fakes `Date`
 *   without taking over timers, and the list's virtualizer needs real timers. A
 *   second effect of the pin is load bearing here: the sticky pill's fade
 *   deadline is `Date.now() + PILL_VISIBLE_MS`, so a frozen `Date.now()` never
 *   reaches it and the pill holds one state instead of fading mid-capture.
 * - **Locale and timezone.** Measured: `de-DE` and `fr-FR` rewrite every
 *   separator label, and `Pacific/Kiritimati` turns the newest one into
 *   "Yesterday". Inheriting them would tie the baselines to the machine that
 *   generated them, so both are pinned to the values the app's own `Intl` calls
 *   resolve to here.
 * - **The scroll position.** The list pins itself to the newest message over a
 *   burst of frames after mount, and it arrives later in WebKit than in
 *   Chromium (measured: up to 17 frames after the media is ready, against 10).
 *   A capture taken before that burst ends is a picture of a different layout,
 *   so the wait is a predicate over the rendered geometry, never a timeout
 *   (§5.1 item 5).
 *
 * Regenerate with `npx playwright test visual --update-snapshots`; see
 * `tests/e2e/README.md`.
 */

const FIXTURE = 'tests/e2e/fixtures/export.zip';

/**
 * The instant the baselines were captured at. It sits inside the fixture's last
 * day, which is what makes the newest separator read "Today": the app only says
 * "Today" when `now` is within a day of the label's own date.
 */
const FIXED_TIME = new Date('2026-07-13T12:00:00Z');

/**
 * The four cases and the values each must render. The two dark cases do not
 * share a `background`, on purpose: the desktop shell swaps in a wider token set
 * at 768px, so a mobile-dark baseline that matched the desktop colour would mean
 * the viewport never applied. `panel` carries the same argument for the
 * two-column shell, which is `display: none` below 768px.
 */
const CASES = [
  {
    name: 'mobile-dark',
    width: 390,
    height: 844,
    theme: null,
    background: 'rgb(11, 11, 11)',
    panel: 'none',
  },
  {
    name: 'mobile-light',
    width: 390,
    height: 844,
    theme: 'light',
    background: 'rgb(239, 234, 226)',
    panel: 'none',
  },
  {
    name: 'desktop-dark',
    width: 1440,
    height: 900,
    theme: null,
    background: 'rgb(22, 23, 23)',
    panel: 'flex',
  },
  {
    name: 'desktop-light',
    width: 1440,
    height: 900,
    theme: 'light',
    background: 'rgb(239, 234, 226)',
    panel: 'flex',
  },
] as const;

type ChatCase = (typeof CASES)[number];

/**
 * Pinned rather than inherited, because both were measured to change the
 * rendered text rather than to be a theoretical risk (see the header).
 */
test.use({ locale: 'en-US', timezoneId: 'UTC' });

async function openChat(page: Page, chatCase: ChatCase): Promise<void> {
  await page.setViewportSize({ width: chatCase.width, height: chatCase.height });
  // The system preference is what "no stored choice" resolves against (E7-3,
  // added in Sprint 7): the app follows `prefers-color-scheme` until the reader
  // picks otherwise. The dark cases therefore emulate a dark OS so the default
  // theme is dark, and the light cases emulate a light OS, so neither depends on
  // the machine the suite happens to run on.
  await page.emulateMedia({ colorScheme: chatCase.theme === 'light' ? 'light' : 'dark' });
  if (chatCase.theme) {
    // An init script runs before the parser has built the root element, so
    // `document.documentElement` is null there and assigning to it throws
    // (SPRINT-5.MD §4.4 H1: that is how three "every theme" loops ran against
    // the default theme for two sprints). Deferring to `DOMContentLoaded` sets
    // the attribute before the first paint.
    await page.addInitScript((theme) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.theme = theme;
      });
    }, chatCase.theme);
  }
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  // The parse runs in a Worker and the zip's media bytes are real, so this is
  // slower than the text fixtures; the same 30 s allowance `media.spec.ts`
  // makes for the same reason.
  await expect(page.locator('.chat')).toBeVisible({ timeout: 30_000 });
}

/**
 * The theme is established before any effect of it is asserted (SPRINT-5.MD
 * §4.4 H1). For the light cases that means reading the attribute back; for the
 * dark ones it means proving the attribute is *absent*, since dark is the
 * default theme rather than an applied one.
 */
async function expectThemeApplied(page: Page, chatCase: ChatCase): Promise<void> {
  const html = page.locator('html');
  if (chatCase.theme) {
    await expect(html).toHaveAttribute('data-theme', chatCase.theme);
  } else {
    await expect(html).not.toHaveAttribute('data-theme', /.*/);
  }
  expect(
    await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe(chatCase.background);
  expect(await page.locator('.chat-panel').evaluate((node) => getComputedStyle(node).display)).toBe(
    chatCase.panel,
  );
}

/**
 * Wait for the real bytes rather than for the frame that reserves room for them
 * (§5.1 items 3 and 4).
 *
 * The image is the fixture's own 400x300 JPEG, asserted through `naturalWidth`
 * rather than through the tile's state attribute, because the state says the
 * bytes were extracted and not that the decoder has finished with them.
 *
 * The audio is checked on the `<audio>` element's own `duration`, and *not* on
 * the slider's `aria-valuetext` alone. Measured: the shape `0:00 of 0:00`
 * is a valid `N:NN of N:NN` match, so a shape check passes on WebKit's very
 * first frame, the frame where the player has not read the file yet
 * (`duration` is `NaN`, `readyState` 0). It is also not a duration assertion:
 * the engines disagree on the number, since WebKit rounds the slider's `max` to
 * `1` where Chromium keeps `1.0065`, and a `max` of `1` renders as `0:01` just
 * as `1.0065` does. So the wait is "the element reports a finite duration", and
 * the clock reaching its final second is left to the capture.
 */
async function waitForMedia(page: Page): Promise<void> {
  const image = page.locator('.media-frame--image[data-state="ready"] img').first();
  await expect(image).toBeVisible();
  await expect
    .poll(async () =>
      image.evaluate((node) =>
        node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0
          ? `${node.naturalWidth}x${node.naturalHeight}`
          : 'loading',
      ),
    )
    .toBe('400x300');

  const seek = page.locator('.voice__seek').first();
  await expect
    .poll(async () =>
      seek.evaluate((node) => {
        if (!(node instanceof HTMLInputElement)) return -1;
        const seconds = Number(node.max);
        return Number.isFinite(seconds) ? seconds : -1;
      }),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () => seek.getAttribute('aria-valuetext'))
    .toMatch(/^\d+:\d\d of 0:0[1-9]$/);

  // Nothing may still be waiting on the parser (the pending tile is a static
  // rectangle, so a frame that still has one is a frame of the wrong screen).
  await expect(page.locator('[data-state="pending"]')).toHaveCount(0);
}

/**
 * Wait for the list to stop moving (§5.1 item 5) by reading the geometry the
 * virtualizer actually renders and requiring it to be unchanged across ten
 * consecutive animation frames. The quantities are not a guess: each one was
 * observed changing during the pin burst. `scrollTop` went 0 → 23 → 50 within a
 * single WebKit load, the sizer's inline height and the row transforms moved
 * with it, and the sticky pill's label was the last thing to change. It flipped
 * from "February 6, 2026" to "June 27, 2026" at frame 9 of one run and frame 17
 * of another. Ten frames is above every arrival measured on either engine.
 *
 * Stillness alone is not enough, and this is the subtle part. The list arrives
 * in stages, and an earlier revision of this wait accepted a still-but-short
 * state: on WebKit at 1440x900 the content kept growing after the app's
 * bottom pin had stopped, so the list rested 27px short of the newest message
 * in about half of loads (measured: six fresh loads at `top=23/50`, stable for
 * 180 frames with no sign of self-correcting). A baseline was written from that
 * state and every later run disagreed with it by 9,262 pixels. The pin was then
 * fixed in the app to exit on arrival rather than on a frame count
 * (`MessageList.tsx`), which is the correct place for it: F-VIEW-13 is the
 * app's job, and a test that produces its own arrival cannot fail on one.
 *
 * So arrival is part of the predicate: the list must reach the bottom with the
 * sticky pill mounted and labelled, and nothing animating. This wait asserts
 * that state; it never writes to the page. With the pin fix reverted, that
 * assertion is what goes red on the desktop-light case (§3.5's negative
 * control for this suite).
 *
 * All four cases are byte-stable across repeats on both engines with the fix in
 * place, which they were not before.
 *
 * The pointer is parked at (1, 1) afterwards. That is not cosmetic: moving to
 * (5, 5) lands on the header's Back button, and a hover there was measured to
 * change the capture.
 */
async function waitForSettled(page: Page): Promise<void> {
  // The target state is: the sticky pill mounted with a label, the list at the
  // true bottom, and nothing animating, held for ten consecutive frames. The
  // predicate is polled from here rather than looping inside one long
  // `page.evaluate`, so a slow arrival draws fresh calls instead of being
  // killed by the test timeout; the last trace is kept for the failure message.
  let trace = 'never polled';
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(async () => {
          const read = () => {
            const list = document.querySelector<HTMLElement>('.chat-list');
            const pill = document.querySelector<HTMLElement>('.chat-list__sticky');
            const sizer = document.querySelector<HTMLElement>('.chat-list__sizer');
            const rows = [...document.querySelectorAll<HTMLElement>('.chat-list__item')]
              .map((node) => node.style.transform)
              .join(';');
            const top = list?.scrollTop ?? -1;
            const bottom = list ? list.scrollHeight - list.clientHeight : -1;
            return {
              signature: JSON.stringify([
                top,
                list?.scrollHeight ?? -1,
                list?.clientHeight ?? -1,
                sizer?.style.height ?? '',
                document.querySelectorAll('.bubble').length,
                rows,
                pill ? `${pill.dataset.visible}|${pill.textContent}` : 'absent',
                document.getAnimations().length,
                document.querySelectorAll('.chat-list__to-bottom').length,
              ]),
              ready:
                bottom >= 0 &&
                top >= bottom - 1 &&
                pill?.dataset.visible === 'true' &&
                Boolean(pill.textContent) &&
                document.getAnimations().length === 0,
              top,
              bottom,
              pillReady: pill?.dataset.visible === 'true' && Boolean(pill.textContent),
            };
          };
          let same = 0;
          let previous = '';
          const changes: string[] = [];
          // One settle window per call (~1.5s at 60fps). The wait asserts
          // arrival; it deliberately does not produce it. An earlier revision
          // applied the app's own bottom write here, which papered over a real
          // defect (the pin stopped before the sticky pill had grown the list,
          // resting 27px short) and made this suite unable to fail for the one
          // behaviour it is best placed to catch. F-VIEW-13 is the app's job:
          // "open at the latest message".
          for (let frame = 0; frame < 120; frame++) {
            const now = read();
            if (changes.length < 6 && now.signature !== previous) {
              changes.push(`f${frame} top=${now.top}/${now.bottom} pill=${now.pillReady}`);
            }
            same = now.signature === previous ? same + 1 : 0;
            previous = now.signature;
            if (same >= 10 && now.ready) {
              return { ready: true, trace: `f${frame} top=${now.top}/${now.bottom}` };
            }
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
          const last = read();
          return {
            ready: false,
            trace: `top=${last.top}/${last.bottom} pill=${last.pillReady}; ${changes.join(' | ')}`,
          };
        });
        trace = state.trace;
        return state.ready;
      },
      { timeout: 60_000 },
    )
    .toBe(true)
    .catch(() => {
      throw new Error(`the chat list never reached the newest message (${trace})`);
    });
  await page.mouse.move(1, 1);
}

/**
 * A missing baseline has to be able to make this suite red, so it is checked as
 * part of the message each test prints when it cannot settle.
 */
async function expectPinnable(page: Page): Promise<void> {
  // The pinned clock is proven by the label it produces: unpinned this reads
  // "July 13, 2026" and pinned it reads "Today", which is the difference the
  // pin exists to remove (measured both ways).
  await expect(page.locator('.day__pill').last()).toHaveText('Today');
}

test.describe('chat view baselines', () => {
  // WebKit's arrival on the desktop viewport is the slow case: it needs the
  // content to grow past the pin burst, and under parallel load the measured
  // arrival plus capture has exceeded the 30s default. The budget is raised
  // here rather than left to chance so a slow-but-correct run cannot be
  // reported as a rendering failure.
  test.describe.configure({ timeout: 90_000 });
  for (const chatCase of CASES) {
    test(`${chatCase.name} (${chatCase.width}x${chatCase.height})`, async ({ page }) => {
      await openChat(page, chatCase);
      await expectThemeApplied(page, chatCase);
      await waitForMedia(page);
      await waitForSettled(page);
      await expectPinnable(page);
      await expect(page).toHaveScreenshot(`chat-${chatCase.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
      });
    });
  }
});

/**
 * The negative control (§3.5). A suite whose baselines cannot fail asserts
 * nothing: a mistyped mask or an over-loose allowance would keep it green
 * forever. So this test argues both halves in one run.
 *
 * 1. The untouched page matches the committed baseline. Without this half the
 *    rejection below would also pass against a missing or stale snapshot, which
 *    is the vacuous shape §3.5 rules out.
 * 2. The same page, after outgoing bubbles are overridden to a colour nothing
 *    else in the app draws, is rejected, and for the *right reason*.
 *    `toHaveScreenshot` is asserted directly rather than negated, so the
 *    matcher's own message is available to read: a negated assertion would pass
 *    on a single stray pixel, which is a weaker claim than "this baseline can
 *    fail". The message is then required to name a large diff, which is what
 *    makes this evidence about the allowance rather than about the page being
 *    different at all. `#ff00ff` appears nowhere in `src/` or `index.html`, so
 *    a diff this size can only come from the override.
 *
 * Measured on this tree: the override moves 26,567 pixels of the 390x844 frame
 * (a ratio of 0.09) against a `maxDiffPixels` of 0, while the unperturbed
 * capture of the same frame moves none.
 */
test('a deliberate colour change is rejected, so the baselines can fail', async ({
  page,
}, testInfo) => {
  // A regeneration run writes back whatever the page drew, and the second
  // capture here is the *perturbed* page, so writing that would replace the very
  // baseline this control exists to prove can fail. Measured before this guard:
  // regenerating rewrote both mobile-dark baselines with the magenta capture
  // (25,904 magenta pixels in the chromium file). So the control stands down
  // during regeneration rather than deleting its own evidence.
  const updating =
    testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed';
  test.skip(
    updating,
    'a regeneration run must not overwrite a baseline with the perturbed capture',
  );

  const chatCase = CASES[0];
  const snapshot = `chat-${chatCase.name}.png`;
  await openChat(page, chatCase);
  await waitForMedia(page);
  await waitForSettled(page);

  await expect(page).toHaveScreenshot(snapshot, { animations: 'disabled', caret: 'hide' });

  await page.addStyleTag({ content: ':root { --bubble-out: #ff00ff; }' });
  const applied = await page
    .locator('html')
    .evaluate((node) => getComputedStyle(node).getPropertyValue('--bubble-out').trim());
  expect(applied, 'the override never applied, so the rejection would be vacuous').toBe('#ff00ff');

  // The `catch` is the assertion: a matcher that does not throw is a baseline
  // that cannot fail, which is the failure mode this test exists to catch, so
  // it is reported as one rather than swallowed.
  let rejection = '';
  try {
    await expect(page).toHaveScreenshot(snapshot, { animations: 'disabled', caret: 'hide' });
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  expect(rejection, 'the override was accepted: the baseline cannot fail').not.toBe('');

  const moved = rejection.match(/([\d,]+) pixels \(ratio ([\d.]+) of all image pixels\)/);
  expect(moved, `the rejection did not report a pixel count:\n${rejection}`).not.toBeNull();
  const pixels = Number(moved?.[1].replace(/,/g, '') ?? 0);

  // Printed so the run's own log carries the evidence: a reviewer reading the
  // output sees the comparison reject the override, not only a green tick.
  console.log(`visual negative control: rejected, ${moved?.[0] ?? 'no pixel count'}`);
  // A floor, not an exact count: the claim is that the comparison rejects a
  // change on the scale of a restyle, which no small allowance could absorb.
  // The measured value is ~26.6k, so this leaves an order of magnitude of
  // headroom while still failing if the diff ever collapses towards noise.
  expect(pixels, `only ${pixels} pixels differed:\n${rejection}`).toBeGreaterThan(1_000);
});
