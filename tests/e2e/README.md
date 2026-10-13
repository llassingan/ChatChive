# tests/e2e: browser tests

What each spec covers, and the two conventions that are easy to get wrong.

| Spec                 | Covers                                                                    |
| -------------------- | ------------------------------------------------------------------------- |
| `flow.spec.ts`       | landing, import, date prompt, error paths: the screens around the chat    |
| `chat.spec.ts`       | the chat view itself: header, bubbles, tails, day separators, media tiles |
| `format.spec.ts`     | inline markers, code blocks, quotes, lists, links, jumbo emoji            |
| `media.spec.ts`      | the media pipeline in a real browser, one test per media kind             |
| `shell.spec.ts`      | the two-column frame, focus order, keyboard navigation                    |
| `perf.spec.ts`       | virtualization cost on the 5,001-message fixture                          |
| `no-network.spec.ts` | the zero-request guarantee (PRD S-2)                                      |
| `visual.spec.ts`     | screenshot baselines for the chat view                                    |

`npm run test:e2e` runs them. The config builds and previews the app on port
4173 first, so a stale dev server cannot answer for the tree under test.

## The visual baselines (`visual.spec.ts`)

Four baselines per engine, at 390x844 and 1440x900, in the light theme and in
the default dark one. The landing page is deliberately **not** covered
(SPRINT-6-PLAN §3.4), so a brand-mark edit does not arrive as a mysterious red
diff beside a baseline change.

**Only the `-linux` baselines are committed.** Playwright's snapshot path carries
the platform in the file name, CI runs `ubuntu-latest`, and `.gitignore` keeps a
laptop's `-darwin` and `-win32` variants out of the repository (§3.3). A visual
failure on macOS against a Linux baseline is a rendering difference between
platforms, not a regression; the fix is not to commit the local file.

```sh
# compare against the committed baselines
npx playwright test visual

# regenerate them (Linux only; do not commit other platforms' files)
npx playwright test visual --update-snapshots
```

**The wait is for arrival, not just stillness.** Before capturing, the suite
requires the list to be at the bottom with the sticky day pill mounted. That
assertion is load-bearing, and it is also the regression guard for a real
defect this suite found: the app's bottom pin used to stop after a fixed 30
frames (`PIN_FRAMES`), so when the image row measured itself and the sticky
pill mounted after that, the list rested 27px short of the newest message and
stayed there. Measured on WebKit at 1440x900: `scrollHeight` went 801 to 828
while `scrollTop` stayed at 23 where the bottom is 50, stable for 180 frames in
roughly half of loads. One baseline had been written from that state, and every
later run disagreed with it by 9,262 pixels.

The pin now ends when the height stops changing rather than on a frame count
(`src/ui/chat/MessageList.tsx`), which is where the behaviour belongs: F-VIEW-13
is the app's job, and a test that produces its own arrival cannot fail on one.
An earlier revision of this wait did exactly that, applying `scrollTop =
scrollHeight` itself, which hid the defect and made the suite unable to fail.
The wait now only observes.

All four cases are byte-stable across repeats on both engines, and this
assertion goes red if the pin is reverted: that is the negative control for this
suite. Chromium's remaining variation is sub-threshold JPEG-resampling noise
(zero pixels above pixelmatch's cutoff, max channel delta 4 of 255).
The `media.spec.ts` wait for a still list reads its geometry the same way, for
the same reason.

A baseline is a claim about what the app looks like, so regenerating one is a
finding to explain, never a way to make a red run green. If a diff appears, look
at `.playwright/output/**/*-diff.png` first: `-actual` is what the app drew now,
`-expected` is the committed baseline. Both are written for every failure.

The suite ships a **negative control** (SPRINT-6-PLAN §3.5) in the same file: it
proves the baseline matches the untouched page, then overrides outgoing bubbles
to a colour nothing else draws and proves the comparison rejects it. If someone
loosens an allowance until the suite cannot fail, that test goes red first.

It skips during `--update-snapshots`, and that guard is load-bearing. A
regeneration run writes back whatever the page drew, and the control's second
capture is the _perturbed_ page, so without the skip it replaces the baseline it
exists to prove can fail. Measured: regenerating wrote the magenta capture into
both `mobile-dark` baselines (25,904 magenta pixels in the chromium file).

The comparison is exact (`maxDiffPixels: 0`, `playwright.config.ts`). The one
allowance is pixelmatch's perceived-colour threshold, left at Playwright's
default 0.2, because two captures of the same frame still differ by about a
hundred pixels of one to three RGB steps, the fixture JPEG's resampling, which
waiting longer does not remove.
