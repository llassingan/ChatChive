import { expect, test } from '@playwright/test';

/**
 * The product's core promise (PRD §8 S-2, backlog E1-3): after the app shell
 * loads, nothing talks to the network. We let the page settle, then fail if any
 * request leaves for an origin other than our own.
 *
 * This is a baseline check against the placeholder shell. When the drop zone and
 * chat view land, it is extended to load a fixture export and re-assert zero
 * requests after import.
 */
test('makes zero cross-origin network requests after the app shell loads', async ({
  page,
  baseURL,
}) => {
  const appOrigin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const offending: string[] = [];

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Only requests made from now on count: the initial shell (HTML/JS/CSS from
  // our own origin) is allowed; anything leaving the device is not.
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).origin !== appOrigin) {
      offending.push(`${req.method()} ${url}`);
    }
  });

  await expect(page.getByRole('heading', { name: 'ChatChive' })).toBeVisible();
  await page.waitForTimeout(1000);

  expect(offending, `Unexpected network requests: ${offending.join(', ')}`).toEqual([]);
});
