/**
 * Search in chat (E7-1; PRD F-NAV-2, F-NAV-3).
 *
 * The unit tests already prove the matcher (accents, emoji, markers, ranges), so
 * this spec covers what only a browser can: that a query reaches the panel, that
 * the highlights land *inside* the rendered text, that prev/next moves the
 * selection and the scroll position, and that ending the search leaves nothing
 * of it behind.
 *
 * The fixture is the same one the rest of the suite uses: seven messages from
 * `WhatsApp Chat with Nadia Rush.txt`, with captions and a group of two senders.
 */
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ZIP = join(here, 'fixtures/export.zip');

async function openChat(page: Page) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await expect(page.locator('.chat')).toBeVisible();
}

test.describe('search in chat', () => {
  // Desktop: the panel is a column beside the list, and its field drives search.
  test.use({ viewport: { width: 1100, height: 900 } });

  test('highlights the matches and counts them', async ({ page }) => {
    await openChat(page);

    await page.locator('.chat__search-open').click();

    const field = page.locator('.search-field__input');
    await field.fill('deck');
    await expect(field).toHaveValue('deck');

    // Exactly one message in this export carries "deck" (a photo caption), and
    // the highlight must land on the word itself rather than the whole message.
    const marks = page.locator('.bubble__mark');
    await expect(marks).toHaveCount(1);
    await expect(marks.first()).toHaveText('deck');
    await expect(page.locator('.search-field__counter')).toHaveText('1 of 1');
  });

  test('says so honestly when nothing matches', async ({ page }) => {
    await openChat(page);
    await page.locator('.chat__search-open').click();
    await page.locator('.search-field__input').fill('zzzz-no-such-thing');

    await expect(page.locator('.search-panel__empty')).toContainText('No messages match');
    await expect(page.locator('.search-field__counter')).toHaveText('No matches');
    await expect(page.locator('.bubble__mark')).toHaveCount(0);
  });

  test('steps between matches and moves the reader', async ({ page }) => {
    await openChat(page);
    await page.locator('.chat__search-open').click();
    // A vowel that appears in several messages, so `N of M` has an N above 1.
    await page.locator('.search-field__input').fill('the');

    const counter = page.locator('.search-field__counter');
    await expect(counter).toHaveText(/^1 of \d+$/);
    const total = Number((await counter.textContent())!.split(' of ')[1]);
    expect(total).toBeGreaterThan(1);

    // The list scrolls to the active match and each step moves on to a different
    // one. The word itself is "the" every time, so the signal is the row: the
    // active mark has to live in a different message's row after a step.
    const activeRow = page.locator('.chat-list__item[data-match="active"]');
    const active = activeRow.locator('.bubble__mark[data-active="true"]');
    await expect(active).toHaveCount(1);
    const firstRow = await activeRow.getAttribute('data-index');

    await page.locator('.search-field__step').nth(1).click();
    await expect(counter).toHaveText(`2 of ${total}`);
    await expect(active).toHaveCount(1);
    await expect(activeRow).not.toHaveAttribute('data-index', firstRow ?? '');

    // The jump itself: the active row has to be inside the list's viewport, which
    // is the point of scrolling by virtualizer index rather than by node.
    await expect(activeRow).toBeInViewport();
    // And the panel marks the same message, so the two halves of the UI agree on
    // where the selection is.
    await expect(page.locator('.search-panel__row[data-active="true"]')).toHaveCount(1);

    // Backwards past the start wraps to the last match rather than stopping.
    await page.locator('.search-field__step').first().click();
    await expect(counter).toHaveText(`1 of ${total}`);
    await page.locator('.search-field__step').first().click();
    await expect(counter).toHaveText(`${total} of ${total}`);
  });

  test('closing search clears every trace of it', async ({ page }) => {
    await openChat(page);
    await page.locator('.chat__search-open').click();
    const field = page.locator('.search-field__input');
    await field.fill('deck');
    await expect(page.locator('.bubble__mark')).toHaveCount(1);

    await page.locator('.search-field__close').click();

    await expect(page.locator('.chat__search-panel')).toHaveCount(0);
    await expect(page.locator('.bubble__mark')).toHaveCount(0);
    await expect(page.locator('.chat__menu')).toBeVisible();

    // Nothing was remembered: reopening starts empty.
    await page.locator('.chat__search-open').click();
    await expect(page.locator('.search-field__input')).toHaveValue('');
  });

  test('Escape closes the search', async ({ page }) => {
    await openChat(page);
    await page.locator('.chat__search-open').click();
    const field = page.locator('.search-field__input');
    await field.fill('deck');
    await expect(page.locator('.bubble__mark')).toHaveCount(1);

    await field.press('Escape');

    await expect(page.locator('.chat__search-panel')).toHaveCount(0);
    await expect(page.locator('.bubble__mark')).toHaveCount(0);
  });

  test('the field reaches the mobile header below 768px', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 800 });
    await openChat(page);

    // The panel is the field alone on a phone: the result list is hidden there
    // because the results are the highlighted messages underneath it.
    await page.locator('.chat__search-open').click();
    const field = page.locator('.search-field__input');
    await expect(field).toBeVisible();
    await expect(page.locator('.search-panel__body')).toBeHidden();
    await field.fill('deck');
    await expect(page.locator('.bubble__mark')).toHaveCount(1);
    await expect(page.locator('.search-field__counter')).toHaveText('1 of 1');
  });
});
