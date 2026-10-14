/**
 * Theme preference (E7-3; PRD F-NAV-5, R-34).
 *
 * The unit tests already prove the state machine — the three-by-two resolution
 * matrix, the storage rules, the adoption rule, live following of the OS under a
 * stubbed `matchMedia`. This spec covers what only a real browser can: that the
 * control is reachable and operable by keyboard, that a choice survives a
 * reload, that System follows a *real* `prefers-color-scheme` change, and that
 * each mode renders measurably differently rather than merely setting an
 * attribute.
 *
 * The fixture is `export.txt`: two messages and a filename naming the other
 * person, so there is no "which one is you?" dialog between the import and the
 * header. The download-free path is deliberate — `export.zip` carries a real
 * JPEG and a voice note, and this spec has no business waiting on either.
 */
import { expect, test, type Page } from '@playwright/test';

const TXT_FIXTURE = 'tests/e2e/fixtures/export.txt';

/**
 * Measured per theme on the built app, read through computed style rather than
 * from `tokens.css`, so a stale token or a selector that never matched fails
 * here rather than in a reader's eyes. `--text-secondary` is the timestamp and
 * menu-legend colour; `--bg-input` is the panel the menu drops onto.
 *
 * The panel value is the *web* one: the default 1280x720 viewport is above the
 * 768px boundary, and dark swaps `--bg-input` to `#242626` there. Light and
 * classic carry no such override, so their values hold at both widths.
 *
 * `dark` is the default theme and so is keyed by the attribute's *absence*.
 */
const THEME_VALUES: Record<string, { secondary: string; panel: string }> = {
  dark: { secondary: 'rgba(255, 255, 255, 0.65)', panel: 'rgb(36, 38, 38)' },
  light: { secondary: 'rgb(84, 100, 109)', panel: 'rgb(255, 255, 255)' },
  classic: { secondary: 'rgb(192, 206, 214)', panel: 'rgb(42, 57, 66)' },
};

const THEME_MODES = ['system', 'light', 'dark'] as const;

async function openChat(page: Page) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(TXT_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();
}

/** Opens the header dropdown, which is a native `<details>`. */
async function openMenu(page: Page) {
  await page.getByLabel('Chat options').click();
  await expect(page.locator('.chat__menu')).toHaveAttribute('open', '');
}

/**
 * Opens the header dropdown the way a keyboard reader does.
 *
 * WebKit does not put a pointer-opened `<details>` panel's children into the tab
 * order, so a keyboard-navigation test has to open it from the summary with
 * Enter rather than clicking it (measured: after a click, Tab never leaves the
 * summary in Safari; after Enter, it walks the rows).
 */
async function openMenuWithKeyboard(page: Page) {
  await page.getByLabel('Chat options').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.chat__menu')).toHaveAttribute('open', '');
}

/**
 * Picks a mode the way a reader does: a click on the row's label, not a
 * programmatic `check()`, so the label's `for`/wrapping behaviour is exercised
 * rather than assumed.
 */
async function pickMode(page: Page, mode: string) {
  await page.locator(`.chat__theme-option:has(input[value="${mode}"])`).click();
  await expect(page.locator(`.chat__theme-option input[value="${mode}"]`)).toBeChecked();
}

/** The attribute on `<html>`; null for the default dark theme. */
function attribute(page: Page) {
  return page.locator('html').getAttribute('data-theme');
}

test.describe('theme control in the chat menu', () => {
  test('offers exactly the three modes, with System selected by default', async ({ page }) => {
    await openChat(page);
    await openMenu(page);

    const labels = page.locator('.chat__theme-option');
    await expect(labels).toHaveCount(3);
    await expect(labels).toHaveText(['System', 'Light', 'Dark']);

    // The default: a fresh document on a light OS follows the OS, and the
    // control says so rather than claiming a mode nobody chose.
    await expect(page.locator('.chat__theme-option input[value="system"]')).toBeChecked();
    await expect(page.locator('.chat__theme-option input[value="dark"]')).not.toBeChecked();
  });

  test('every mode renders its own theme, measured and not merely attributed', async ({ page }) => {
    await openChat(page);
    await openMenu(page);

    for (const mode of THEME_MODES) {
      await pickMode(page, mode);

      // System here follows a light OS (nothing in this spec pins
      // `colorScheme`, and Playwright's default is light), so it resolves to
      // the same theme Light does — that is the whole meaning of System.
      // Dark is the attribute's *absence*, not the string "dark": no rule in
      // `tokens.css` matches `[data-theme='dark']`. The cause is asserted
      // before the effect (SPRINT-5.MD §4.4 H1): an attribute that never
      // landed is what made three earlier "every theme" loops vacuous while
      // passing anyway.
      const resolved = mode === 'dark' ? 'dark' : 'light';
      expect(await attribute(page)).toBe(resolved === 'dark' ? null : 'light');

      const expected = THEME_VALUES[resolved];
      expect(expected, `no measured values recorded for theme ${resolved}`).toBeDefined();
      if (!expected) return;

      await expect(page.locator('.chat__menu-panel')).toHaveCSS('background-color', expected.panel);
      await expect(page.locator('.meta').first()).toHaveCSS('color', expected.secondary);
    }
  });

  test('a chosen mode survives a reload, which is the point of storing it', async ({ page }) => {
    await openChat(page);
    await openMenu(page);
    await pickMode(page, 'light');
    expect(await attribute(page)).toBe('light');

    await page.reload();
    // Set before the app paints, so the first frame after reload is already
    // light rather than a flash of dark.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.locator('input[type="file"]').setInputFiles(TXT_FIXTURE);
    await expect(page.locator('.chat')).toBeVisible();
    expect(await attribute(page)).toBe('light');

    await openMenu(page);
    await expect(page.locator('.chat__theme-option input[value="light"]')).toBeChecked();
  });

  test('only the preference is stored, never chat content (PRD S-3)', async ({ page }) => {
    await openChat(page);
    await openMenu(page);
    await pickMode(page, 'dark');

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys).toEqual(['chatchive:theme']);
    expect(await page.evaluate(() => window.localStorage.getItem('chatchive:theme'))).toBe('dark');
  });

  test('a first visit that chooses nothing writes nothing', async ({ page }) => {
    await openChat(page);
    await openMenu(page);

    // Opening the menu and reading the control is not a choice. The key stays
    // absent, so the next visit follows the OS again instead of pinning
    // whatever this machine happened to be.
    expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([]);
  });

  test('System follows the OS live, both ways', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openChat(page);
    await openMenu(page);
    await pickMode(page, 'light');
    expect(await attribute(page)).toBe('light');

    // Back to System: it adopts the OS as it is now, not as it was at boot.
    await pickMode(page, 'system');
    expect(await attribute(page)).toBeNull();

    // And it keeps following, with no reload and no further interaction.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  });

  test('an explicit mode stops following the OS', async ({ page }) => {
    await openChat(page);
    await openMenu(page);
    await pickMode(page, 'light');

    await page.emulateMedia({ colorScheme: 'dark' });

    // A reader who chose Light keeps it when the OS flips: that is what
    // overriding the system means.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('a theme already on the document is left exactly as found', async ({ page }) => {
    // `media.spec.ts` and the two-theme loops seed the attribute this way, and
    // `classic` — which no OS setting can express — arrives only this way. The
    // app must not clobber it on boot.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.theme = 'classic';
      });
    });

    await openChat(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic');
    const classic = THEME_VALUES.classic;
    expect(classic, 'no measured values recorded for classic').toBeDefined();
    if (classic) await expect(page.locator('.meta').first()).toHaveCSS('color', classic.secondary);

    await openMenu(page);
    // Nothing is checked: the control does not offer classic, and it does not
    // pretend System is selected while the document shows something else.
    for (const mode of THEME_MODES) {
      await expect(page.locator(`.chat__theme-option input[value="${mode}"]`)).not.toBeChecked();
    }
    // Still nothing written: adopting is not choosing.
    expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([]);

    // And the reader can leave it for one of the three modes.
    await pickMode(page, 'light');
    expect(await attribute(page)).toBe('light');
  });

  test('the group is one tab stop and the arrow keys move between modes', async ({ page }) => {
    await openChat(page);
    await openMenuWithKeyboard(page);

    const checked = page.locator('.chat__theme-option input[value="system"]');
    await checked.focus();
    await expect(checked).toBeFocused();

    // Native radio semantics: an arrow key selects as it moves. The modes are
    // System, Light, Dark in that order, so two ArrowDowns from System reach
    // Dark. Wrapping at the ends is deliberately NOT asserted: Chromium wraps and
    // WebKit does not, and that difference is the browser's, not the app's (the
    // group is a plain native `<input type=radio>`, so each engine implements
    // its own radio arrow behaviour).
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.chat__theme-option input[value="light"]')).toBeChecked();
    expect(await attribute(page)).toBe('light');

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.chat__theme-option input[value="dark"]')).toBeChecked();
    expect(await attribute(page)).toBeNull();

    // One tab stop covers the whole group: the next Tab leaves it entirely
    // rather than stepping to the second radio.
    await page.keyboard.press('Tab');
    const inGroup = await page.evaluate(
      () => document.activeElement?.closest('.chat__theme') !== null,
    );
    expect(inGroup).toBe(false);
  });

  test('the focused row shows a visible ring (R-32)', async ({ page }) => {
    await openChat(page);

    // Reached by real keyboard navigation, not `element.focus()`: only a
    // keyboard-driven focus matches `:focus-visible`, so a programmatic focus
    // would assert a ring the reader never sees.
    //
    // The menu is opened with the keyboard, not a mouse click, and that is
    // load-bearing on WebKit: a `<details>` opened by a pointer click does not
    // put its panel's children into the tab order until the summary is
    // re-activated, so a mouse-opened menu is not Tab-reachable at all in Safari.
    // Opening it the way a keyboard reader does is both the realistic path and
    // the one WebKit honours.
    await openMenuWithKeyboard(page);
    let inGroup = false;
    for (let step = 0; step < 6 && !inGroup; step += 1) {
      await page.keyboard.press('Tab');
      inGroup = await page.evaluate(() => document.activeElement?.closest('.chat__theme') !== null);
    }
    expect(inGroup, 'Tab never reached the theme group').toBe(true);

    // The ring is on the row, not on the 20px dot: the row is what the reader
    // aims at. A ring drawn on the dot alone would satisfy "has an outline"
    // while being nearly invisible.
    const focusedRow = page.locator('.chat__theme-option:has(input:focus-visible)');
    await expect(focusedRow).toHaveCount(1);
    await expect(focusedRow).toHaveCSS('outline-style', 'solid');
    const width = await focusedRow.evaluate((node) => getComputedStyle(node).outlineWidth);
    expect(Number.parseFloat(width)).toBeGreaterThan(0);
    const offset = await focusedRow.evaluate((node) => getComputedStyle(node).outlineOffset);
    expect(Number.parseFloat(offset)).toBeGreaterThan(0);
  });

  test('every row clears the 44px touch floor (R-32, F-RES-4)', async ({ page }) => {
    await openChat(page);
    await openMenu(page);

    for (const row of await page.locator('.chat__theme-option').all()) {
      await expect
        .poll(async () => {
          const box = await row.boundingBox();
          return box ? Math.min(box.width, box.height) : 0;
        })
        .toBeGreaterThanOrEqual(44);
    }
  });

  test('Escape closes the menu from inside the panel and returns focus', async ({ page }) => {
    await openChat(page);
    await openMenu(page);

    // Measured in Chromium: the native `<details>` handler only closes while
    // focus is on the `<summary>`, so a reader who has tabbed into the panel
    // gets nothing without the explicit handler.
    await page.locator('.chat__theme-option input[value="light"]').focus();
    await page.keyboard.press('Escape');

    await expect(page.locator('.chat__menu')).not.toHaveAttribute('open', '');
    // Focus comes back to the summary, not to a hidden element inside a closed
    // panel, which would strand the reader's next Tab in a subtree nobody sees.
    await expect(page.getByLabel('Chat options')).toBeFocused();
  });

  test('adding the toggle leaves the existing menu intact', async ({ page }) => {
    await openChat(page);
    await openMenu(page);

    // The regression this guards: the theme control is a new row in a menu
    // whose existing rows are counted by `shell.spec.ts` (which asserts exactly
    // 2), so it must not be built out of that class or it would read there as a
    // menu change rather than a new tool. Asserted as the invariant that
    // survives other agents' edits — the theme group contributes no menu item —
    // rather than as a pinned total, which E7-1's "Search messages" row has
    // already moved from 2 to 3 (updating *that* count is the lead's call, not
    // this spec's).
    await expect(page.locator('.chat__theme .chat__menu-item')).toHaveCount(0);
    await expect(page.locator('.chat__theme-option')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Close chat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search messages' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Close chat' }).click();
    await expect(page.locator('.chat')).toHaveCount(0);
  });
});

test.describe('theme on the landing screen', () => {
  test('a stored choice paints the landing screen before any chat exists', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('chatchive:theme', 'light');
    });
    await page.goto('/');
    await expect(page.locator('.landing')).toBeVisible();

    // The landing has no control of its own — the drop zone is the one action
    // there (RHYTHM 1) — but it must still paint the reader's chosen theme, or
    // a Light reader sees a dark first screen and a light chat.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the drop zone still owns the first Tab, and the theme is still applied', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: 'ChatChive' }).click();
    await page.keyboard.press('Tab');

    // `flow.spec.ts` owns this contract; asserted here because E7-3 is what
    // could have broken it by adding a control to this screen.
    await expect(page.locator('input[type="file"]')).toBeFocused();
    expect(await attribute(page)).toBe('light');
  });
});
