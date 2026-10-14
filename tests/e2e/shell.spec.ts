import { expect, test, type Page } from '@playwright/test';

/**
 * The two-column shell and the mobile verification pass (E6-1, E6-2; PRD
 * F-RES-1/F-RES-2/F-RES-4/F-RES-5). These specs are the observable half of the
 * sprint's Delivery Gate evidence: frame geometry, the single 768px boundary,
 * zero horizontal overflow at every shipped width, and a browser Back that
 * returns to the landing screen without stacking history.
 *
 * Paths are relative to the working directory (`npm run test:e2e` runs from the
 * project root).
 */

const ZIP_FIXTURE = 'tests/e2e/fixtures/export.zip';

/** Open a chat on the zip fixture and wait for the message view to be up. */
async function openChat(page: Page) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(ZIP_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();
}

/** The landing screen's heading is the app's only `<h1>` (§6.4, risk 10). */
const landingHeading = (page: Page) => page.getByRole('heading', { name: 'ChatChive' });

test.describe('desktop shell: two columns at 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the panel sits to the left of the pane and the wallpaper is drawn', async ({ page }) => {
    await openChat(page);

    const panel = page.locator('.chat-panel');
    await expect(panel).toBeVisible();

    // The frame is a real two-column layout, asserted geometrically rather than
    // by reading a class: the panel's right edge is at or left of the pane's
    // left edge (E6-2's acceptance wording).
    const [panelBox, paneBox] = await Promise.all([
      panel.evaluate((node) => node.getBoundingClientRect().toJSON()),
      page.locator('.chat-shell__pane').evaluate((node) => node.getBoundingClientRect().toJSON()),
    ]);
    expect(panelBox).not.toBeNull();
    expect(paneBox).not.toBeNull();
    expect(panelBox.right).toBeLessThanOrEqual(paneBox.left + 1);

    // The pane takes the rest of the frame, and the two columns cover it.
    expect(paneBox.width).toBeGreaterThan(900);
    expect(panelBox.left).toBeCloseTo(0, 0);

    // The wallpaper layer exists in the pane and resolves a real image (DESIGN
    // §6). The computed style is `url("...")`; `none` would mean the bundler
    // dropped the asset.
    const wallpaper = await page
      .locator('.chat-shell__wallpaper')
      .evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(wallpaper).not.toBe('none');
    expect(wallpaper).toContain('url(');
  });

  test('the panel row is present, reachable, and carries the real chat', async ({ page }) => {
    await openChat(page);

    const row = page.locator('.chat-panel__row');
    await expect(row).toBeVisible();

    // The row names the open chat, which is what Amendment A2 ruled: the title
    // is real and the preview is the newest message said the way the bubble
    // says it. Scoped to the row, because the pane header renders the title too.
    await expect(row.locator('.chat-panel__title')).toHaveText('Nadia Rush');
    await expect(row.locator('.chat-panel__preview')).toHaveText('Got it');
    await expect(row.locator('.chat-panel__time')).toHaveText(/\d{2}[:.]\d{2}/);

    // Focusability, asserted with a retrying matcher rather than a one-shot read
    // of `activeElement`: headless WebKit does not move focus until the page
    // itself is focused, which made a bare read flaky here.
    await page.locator('.chat-shell__pane').click();
    await row.focus();
    await expect(row).toBeFocused();
  });
});

test.describe('the single 768px boundary', () => {
  test('at 360x640 the panel is gone and the pane fills the width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openChat(page);

    await expect(page.locator('.chat-panel')).toBeHidden();

    const pane = await page
      .locator('.chat-shell__pane')
      .evaluate((node) => node.getBoundingClientRect().toJSON());
    expect(pane.left).toBeCloseTo(0, 0);
    expect(pane.width).toBeCloseTo(360, 0);
  });

  test('at 767px the panel is still gone, and at 768px it is there', async ({ page }) => {
    // One test asserts the pair, so a later `<` vs `<=` slip fails loudly: 767
    // must be mobile and 768 must be desktop, in the same run.
    await page.setViewportSize({ width: 767, height: 900 });
    await openChat(page);
    await expect(page.locator('.chat-panel')).toBeHidden();
    // Polled: the read races the viewport resize, and a one-shot measurement
    // taken in that window was intermittently flaky.
    await expect
      .poll(() =>
        page.locator('.chat-shell__pane').evaluate((node) => node.getBoundingClientRect().width),
      )
      .toBeCloseTo(767, 0);

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.locator('.chat-panel')).toBeVisible();
  });

  test('at 768px the panel is 340px and the pane gets the rest', async ({ page }) => {
    // DESIGN §1.4: the web chat list is 30% of the window, min 340px, max 470px,
    // so at the 768px boundary the floor wins.
    await page.setViewportSize({ width: 768, height: 900 });
    await openChat(page);

    const [panelBox, paneBox] = await Promise.all([
      page.locator('.chat-panel').evaluate((node) => node.getBoundingClientRect().toJSON()),
      page.locator('.chat-shell__pane').evaluate((node) => node.getBoundingClientRect().toJSON()),
    ]);
    expect(panelBox.width).toBeCloseTo(340, 0);
    expect(paneBox.width).toBeCloseTo(428, 0);
    expect(panelBox.right).toBeLessThanOrEqual(paneBox.left + 1);
  });
});

// The panel row's text assertions (and any rescoped `getByText` call) land with
// Amendment A's ruling; the row's presence and frame are asserted above.

test.describe('no horizontal overflow in the shell', () => {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 767, height: 900 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    test(`fits at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openChat(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('browser back', () => {
  test('page.goBack() leaves the chat and shows the landing heading', async ({ page }) => {
    await openChat(page);

    await page.goBack();

    await expect(landingHeading(page)).toBeVisible();
    await expect(page.locator('.chat')).toHaveCount(0);
  });

  test('the Back button does the same and history does not grow without bound', async ({
    page,
  }) => {
    await openChat(page);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(landingHeading(page)).toBeVisible();
    await expect(page.locator('.chat')).toHaveCount(0);

    // The close path consumes the entry it pushed, so repeated open/close
    // cycles do not stack entries (risk 9, §7). Each cycle re-imports into the
    // same document, so the only history growth a cycle could add is the shell's
    // own push; measured in Chromium, the length is flat across five cycles.
    const lengths: number[] = [];
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await page.locator('input[type="file"]').setInputFiles(ZIP_FIXTURE);
      await expect(page.locator('.chat')).toBeVisible();
      lengths.push(await page.evaluate(() => window.history.length));
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(landingHeading(page)).toBeVisible();
    }

    const base = lengths[0];
    expect(Math.max(...lengths)).toBe(base);
    expect(await page.evaluate(() => window.history.length)).toBe(base);
  });

  test('the shell pushes exactly one entry per open', async ({ page }) => {
    // A push loop would show up here first: the app's own entry plus the
    // shell's one, and nothing more.
    await page.goto('/');
    const before = await page.evaluate(() => window.history.length);

    await openChat(page);

    expect(await page.evaluate(() => window.history.length)).toBe(before + 1);
  });

  test('the landing screen still has the only <h1> while the panel is mounted', async ({
    page,
  }) => {
    // The panel adds no `<h1>` (§6.4): the heading role still resolves to the
    // landing brand, which eight assertions depend on.
    await openChat(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    expect(await page.getByRole('heading', { name: 'ChatChive' }).count()).toBe(0);
    expect(await page.locator('h1').count()).toBe(0);

    await page.goBack();
    await expect(landingHeading(page)).toBeVisible();
    expect(await page.locator('h1').count()).toBe(1);
  });

  test('tab order reaches the panel row and the pane Back button', async ({ page }) => {
    // §5.2 asks for the desktop tab order and a visible focus ring. Measured in
    // Chromium with the shell mounted, the order is: the panel row, then the
    // pane's Back button, then the header menu summary. The landing screen is
    // unmounted while a chat is open, so its file input is not in this order.
    // DOM order follows the visual order, so no `tabindex` is needed.
    await openChat(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.chat-panel')).toBeVisible();

    // Reset the sequential-focus starting point to the top of the document. A
    // `body.click()` is not that reset: since E5-1 `export.zip` carries a real
    // JPEG and voice note, the click lands on the pane's media, and a mouse
    // click moves the starting point to the clicked element (measured: the
    // first Tab then resumed at `.voice__toggle`). Focusing the body puts the
    // starting point ahead of every control, which is what "first Tab" means
    // here. This is a test-harness fix; the tab order itself is unchanged.
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.className)).toContain(
      'chat-panel__row',
    );
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');

    // The row is a real focus stop with a visible ring, not just focusable.
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const style = el ? getComputedStyle(el) : null;
      return style ? `${style.outlineStyle} ${style.outlineWidth}` : '';
    });
    expect(outline).not.toBe('none 0px');
    // Tab forward until the pane's Back button takes focus; it must be a real
    // control, so activating it closes the chat. The scan is bounded so a
    // regression that drops Back out of the order fails instead of hanging.
    const back = page.getByRole('button', { name: 'Back' });
    let reachedBack = false;
    for (let step = 0; step < 12 && !reachedBack; step += 1) {
      await page.keyboard.press('Tab');
      reachedBack = await back.evaluate((el) => el === document.activeElement);
    }
    expect(reachedBack).toBe(true);

    await page.keyboard.press('Enter');
    await expect(landingHeading(page)).toBeVisible();
  });
});

test.describe('mobile shell verification (E6-1)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('header, list and footer are all present with no page scroll', async ({ page }) => {
    await openChat(page);

    await expect(page.locator('.chat__header')).toBeVisible();
    await expect(page.locator('.chat-list')).toBeVisible();
    await expect(page.locator('.chat__footer')).toBeVisible();

    // The view fills the viewport and the page itself does not scroll.
    const layout = await page.evaluate(() => ({
      chat: document.querySelector('.chat')?.getBoundingClientRect().height ?? 0,
      inner: window.innerHeight,
      docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(layout.chat).toBeCloseTo(layout.inner, 0);
    expect(layout.docScroll).toBeLessThanOrEqual(0);
  });

  test('every header control, the menu rows included, is at least a 44px target', async ({
    page,
  }) => {
    await openChat(page);

    // 44px is the touch-target floor (R-32, F-RES-4) and E6-1's acceptance
    // criterion, so it covers the header controls and the dropdown's rows
    // alike. Both icon controls: the header Back button and the menu summary,
    // which is a `<summary>` and so has no button role. Measured with polled
    // assertions rather than one-shot `boundingBox()` reads, because the
    // header's layout settles a frame or two after the chat mounts and a single
    // measurement taken in that window was intermittently flaky on WebKit.
    // Three header controls since E7-1: Back, Search and the menu summary.
    const icons = page.locator('.chat__header .icon-button');
    await expect(icons).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect
        .poll(async () => {
          const box = await icons.nth(index).boundingBox();
          return box ? Math.min(box.width, box.height) : 0;
        })
        .toBeGreaterThanOrEqual(44);
    }

    // The rows only have a box while the dropdown is open. They used to measure
    // 42px, which QA recorded as F-1 against this floor; they now carry a
    // `min-height: 44px` (ChatView.css) and so assert the same 44 as the icons.
    // Four rows since E7 (search, who-you-are, jump to date, close).
    await page.locator('.chat__header summary').click();
    const menuItems = page.locator('.chat__header .chat__menu-item');
    await expect(menuItems).toHaveCount(4);
    for (const item of await menuItems.all()) {
      await expect
        .poll(async () => {
          const box = await item.boundingBox();
          return box ? Math.min(box.width, box.height) : 0;
        })
        .toBeGreaterThanOrEqual(44);
    }
  });
});
