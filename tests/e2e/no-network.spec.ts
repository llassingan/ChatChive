import { expect, test, type Page } from '@playwright/test';

/**
 * The product's core promise (PRD §8 S-2, backlog E1-3): after the app shell
 * loads, nothing talks to the network. Sprint 2 extends the original
 * shell-only check to actually IMPORT an export and re-assert zero requests,
 * which is the real test of S-2 (Sprint 1 open thread #4): the whole unzip and
 * parse pipeline runs in the browser, in a worker, with no server involved.
 */

// Playwright resolves these relative to the working directory (`npm run test:e2e`
// runs from the project root). Kept as plain paths so the spec needs no Node API,
// which would otherwise pull Node globals into the browser-only typecheck.
const ZIP_FIXTURE = 'tests/e2e/fixtures/export.zip';
const TXT_FIXTURE = 'tests/e2e/fixtures/export.txt';

/**
 * Start recording outbound requests. `data:`/`blob:` are same-document sources
 * the app builds in memory, so they are not network traffic (PRD §10).
 */
function watchNetwork(page: Page, appOrigin: string): string[] {
  const offending: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).origin !== appOrigin) {
      offending.push(`${request.method()} ${url}`);
    }
  });
  return offending;
}

/** Pick a fixture through the real file input and wait for the chat view. */
async function importFile(page: Page, path: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(page.locator('.chat')).toBeVisible();
}

test('makes zero cross-origin requests after the app shell loads', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL ?? 'http://localhost:4173').origin;
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Only requests made from now on count: the initial shell (HTML/JS/CSS from
  // our own origin) is allowed; anything leaving the device is not.
  const offending = watchNetwork(page, appOrigin);

  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
  await page.waitForTimeout(1000);

  expect(offending, `Unexpected network requests: ${offending.join(', ')}`).toEqual([]);
});

test('imports a .zip export with no network request after load', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL ?? 'http://localhost:4173').origin;
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const offending = watchNetwork(page, appOrigin);

  await importFile(page, ZIP_FIXTURE);

  // The zip's inner text file names the contact, which becomes the chat title.
  await expect(
    page.locator('.chat__header').getByText('Nadia Rush', { exact: true }),
  ).toBeVisible();
  // Importing and rendering the chat must still make no request (S-2).
  await expect(page.getByText('7 messages')).toBeVisible();

  expect(offending, `Unexpected network requests: ${offending.join(', ')}`).toEqual([]);
});

test('imports a .txt export with no network request after load', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL ?? 'http://localhost:4173').origin;
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const offending = watchNetwork(page, appOrigin);

  await importFile(page, TXT_FIXTURE);

  // A .txt export has no filename to name the chat, so the title falls back to
  // the first sender in the file.
  await expect(page.locator('.chat__header').getByText('Elin Sato', { exact: true })).toBeVisible();

  expect(offending, `Unexpected network requests: ${offending.join(', ')}`).toEqual([]);
});
