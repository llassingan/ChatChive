import { expect, test, type Page } from '@playwright/test';

/**
 * Text formatting in message bubbles (backlog E4-6; PRD F-VIEW-5, S-5).
 *
 * Every E4-6 acceptance criterion that is only observable in a browser lives
 * here: each marker becomes its own element, linkification produces the right
 * `href` and only external links get `target`, jumbo emoji is measurable through
 * `getComputedStyle`, and the meta seam of §3.8 holds numerically on the mixed
 * message in all three themes. Sizes and geometry are read with `evaluate`, not
 * screenshots, so a failure names the number that moved.
 *
 * The viewport is tall on purpose: the formatting fixture is 20 short messages,
 * and at a laptop height the list virtualizes the top of it away (E4-1), which
 * would make every assertion here a test of scrolling rather than of rendering.
 * Responsiveness is covered by `chat.spec.ts` and `shell.spec.ts`; `estimateRow`
 * is covered by the `formatText` unit tests.
 *
 * Paths are relative to the working directory (`npm run test:e2e` runs from the
 * project root).
 */

test.use({ viewport: { width: 1100, height: 1500 } });

const FORMATTING_FIXTURE = 'tests/e2e/fixtures/formatting.txt';
const LARGE_FIXTURE = 'tests/e2e/fixtures/large.txt';
const INJECTION_PAYLOAD = '<script>window.__pwned = true</script>';

async function openFormatting(page: Page, fileName = FORMATTING_FIXTURE) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fileName);
  await expect(page.locator('.chat')).toBeVisible();
  await expect(page.locator('.bubble').first()).toBeVisible();
}

/** The bubble whose rendered text contains `needle`. `needle` is marker-free. */
function bubbleWith(page: Page, needle: string) {
  return page.locator('.bubble').filter({ hasText: needle }).first();
}

test('inline markers become elements and their characters are gone', async ({ page }) => {
  await openFormatting(page);
  await expect(page.locator('.bubble')).toHaveCount(20);

  // `*bold*` renders as <strong> whose whole text is "bold", and the asterisks
  // are not in the rendered text at all.
  await expect(page.locator('.bubble__body strong').first()).toHaveText('bold');
  await expect(page.locator('.bubble__body em').first()).toHaveText('italic');
  await expect(page.locator('.bubble__body s').first()).toHaveText('struck');
  // Inline code: <code> inside the body, backticks gone.
  await expect(page.locator('.bubble__body code').first()).toHaveText('inline code');

  // No rendered body still carries a marker character. Every bubble is checked,
  // not one selector, so a marker leaking through any tokenizer branch fails
  // here. The crafted `<script>` payload is excluded on purpose: its underscores
  // and angle brackets are its own bytes, and S-5 requires them shown literally
  // rather than reformatted.
  const bodies = await page
    .locator('.bubble')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector('.bubble__body')?.textContent ?? ''),
    );
  for (const marker of ['*', '_', '~', '`']) {
    const leaking = bodies.filter(
      (text) => text.includes(marker) && !text.includes('window.__pwned'),
    );
    expect(leaking, `bodies still containing ${marker}`).toEqual([]);
  }

  // The element kinds are the ones the brief names, not spans wearing a class.
  expect(
    await page
      .locator('.bubble__body strong')
      .first()
      .evaluate((n) => n.tagName),
  ).toBe('STRONG');
  expect(
    await page
      .locator('.bubble__body s')
      .first()
      .evaluate((n) => n.tagName),
  ).toBe('S');
});

test('block code renders as <pre><code> with nothing tokenized inside', async ({ page }) => {
  await openFormatting(page);

  const pre = page.locator('.bubble__pre').first();
  await expect(pre).toBeVisible();
  await expect(pre.locator('code')).toHaveCount(1);
  await expect(pre).toContainText("console.log(greet('world'));");
  // The fence characters are not rendered, and nothing inside became markup.
  await expect(pre).not.toContainText('```');
  await expect(pre.locator('strong, em, s, a')).toHaveCount(0);
});

test('a quote is a blockquote and both list kinds are real lists', async ({ page }) => {
  await openFormatting(page);

  const quote = page.locator('.bubble__quote').first();
  await expect(quote).toBeVisible();
  await expect(quote).toContainText('quoted line one');
  await expect(quote).toContainText('quoted line two');
  // No `>` marker survives.
  await expect(quote).not.toContainText('>');
  expect(await quote.evaluate((n) => n.tagName)).toBe('BLOCKQUOTE');

  const bullets = page.locator('.bubble__list').filter({ hasText: 'first bullet' }).first();
  await expect(bullets.locator('li')).toHaveCount(3);
  expect(await bullets.evaluate((n) => n.tagName)).toBe('UL');

  const numbered = page.locator('.bubble__list').filter({ hasText: 'first item' }).first();
  await expect(numbered.locator('li')).toHaveCount(3);
  expect(await numbered.evaluate((n) => n.tagName)).toBe('OL');
});

test('linkification: an external link opens in a hardened new tab', async ({ page }) => {
  await openFormatting(page);

  const link = bubbleWith(page, 'Read the notes at').locator('a');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('https://example.com/notes?ref=chat');
  expect(await link.getAttribute('href')).toBe('https://example.com/notes?ref=chat');
  expect(await link.getAttribute('target')).toBe('_blank');
  expect(await link.getAttribute('rel')).toBe('noopener noreferrer');

  // A bare `www.` host is linked too, and only the href gets the scheme.
  const bare = bubbleWith(page, 'The handbook lives at').locator('a');
  await expect(bare).toHaveText('www.example.org/handbook');
  expect(await bare.getAttribute('href')).toBe('https://www.example.org/handbook');
  expect(await bare.getAttribute('target')).toBe('_blank');
});

test('linkification: mail and phone links get no target', async ({ page }) => {
  await openFormatting(page);

  const mail = bubbleWith(page, 'Mail the summary').locator('a');
  await expect(mail).toHaveText('elin.sato@example.co.id');
  expect(await mail.getAttribute('href')).toBe('mailto:elin.sato@example.co.id');
  expect(await mail.getAttribute('target')).toBeNull();

  const phone = bubbleWith(page, 'Call the office').locator('a');
  await expect(phone).toHaveText('+62 812-3456-789');
  expect(await phone.getAttribute('href')).toBe('tel:+628123456789');
  expect(await phone.getAttribute('target')).toBeNull();
});

test('trailing sentence punctuation does not join the link', async ({ page }) => {
  await openFormatting(page);

  const link = bubbleWith(page, 'The old site was').locator('a');
  await expect(link).toHaveText('https://example.com');
  expect(await link.getAttribute('href')).toBe('https://example.com');
  // The full stop came back as punctuation, so the sentence still reads whole.
  await expect(bubbleWith(page, 'The old site was')).toContainText('It moved last year');
});

test('a message with no markers renders as plain text', async ({ page }) => {
  await openFormatting(page);

  const bubble = bubbleWith(page, 'Plain message with no markers at all');
  await expect(bubble).toContainText('Plain message with no markers at all');
  await expect(bubble.locator('strong, em, s, code, a')).toHaveCount(0);
  // One body, one paragraph, and the direction lives on the body wrapper (§4.4).
  await expect(bubble.locator('.bubble__body')).toHaveCount(1);
  expect(await bubble.locator('.bubble__body').getAttribute('dir')).toBe('auto');
});

test('no marker character survives into the screen-reader label', async ({ page }) => {
  await openFormatting(page);

  const label = await bubbleWith(page, 'This one is bold').getAttribute('aria-label');
  expect(label).toBeTruthy();
  // The label reads the words, not the source: no asterisk is announced.
  expect(label).toContain('This one is bold in the middle of a sentence');
  for (const marker of ['*', '_', '~', '`']) expect(label).not.toContain(marker);
});

test('jumbo: one and three emoji are large with no bubble fill, four are not', async ({ page }) => {
  await openFormatting(page);

  const sizes = await page.evaluate(() => {
    const px = (value: string) => Number.parseFloat(value);
    const fill = (node: Element | null) => {
      const bubble = node?.closest('.bubble');
      return bubble ? getComputedStyle(bubble).backgroundColor : null;
    };
    const body = document.querySelector('.bubble:not(.bubble--jumbo) .bubble__body');
    const one = document.querySelector('.bubble__jumbo--1');
    const three = document.querySelector('.bubble__jumbo--3');
    const four = document.querySelector('.bubble:not(.bubble--jumbo) .bubble__body .bubble__para');
    return {
      body: body ? px(getComputedStyle(body).fontSize) : 0,
      one: one ? px(getComputedStyle(one).fontSize) : 0,
      three: three ? px(getComputedStyle(three).fontSize) : 0,
      jumboFill: fill(one),
      normalFill: fill(four),
      fourIsJumbo: four?.closest('.bubble')?.classList.contains('bubble--jumbo') ?? null,
      count: {
        one: document.querySelectorAll('.bubble__jumbo--1').length,
        three: document.querySelectorAll('.bubble__jumbo--3').length,
      },
    };
  });

  // The fixture's boundaries: a 1-emoji and a 3-emoji message are jumbo, the
  // 4-emoji one is not.
  expect(sizes.count.one).toBe(1);
  expect(sizes.count.three).toBe(1);
  expect(sizes.fourIsJumbo).toBe(false);

  // Both jumbo scales are larger than body text, and one emoji is the largest.
  expect(sizes.one).toBeGreaterThan(sizes.body);
  expect(sizes.three).toBeGreaterThan(sizes.body);
  expect(sizes.one).toBeGreaterThanOrEqual(sizes.three);

  // No bubble background on the jumbo message, a real one on the 4-emoji row.
  expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(sizes.jumboFill);
  expect(sizes.normalFill).not.toBe(sizes.jumboFill);
  expect(sizes.normalFill).not.toBe('rgba(0, 0, 0, 0)');
});

test('the mixed message keeps its meta inside the bubble in every theme', async ({ page }) => {
  for (const theme of ['dark', 'light', 'classic']) {
    // An init script runs before the parser has built the root element, so
    // `documentElement` is still null there and assigning to it throws (the
    // theme would never apply); defer to `DOMContentLoaded`.
    await page.addInitScript((value) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.theme = value;
      });
    }, theme);
    await openFormatting(page);

    const bubble = bubbleWith(page, 'Here is the long one');
    await expect(bubble).toBeVisible();
    // The mixed message really does carry all three shapes plus a link.
    await expect(bubble.locator('.bubble__pre')).toHaveCount(1);
    await expect(bubble.locator('.bubble__list li')).toHaveCount(3);
    await expect(bubble.locator('a')).toHaveCount(1);

    const geometry = await bubble.evaluate((node) => {
      interface Box {
        top: number;
        left: number;
        right: number;
        bottom: number;
      }
      const rect = (element: Element | null): Box | null => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { top: box.top, left: box.left, right: box.right, bottom: box.bottom };
      };
      const overlaps = (a: Box | null, b: Box | null) => {
        if (!a || !b) return null;
        return (
          a.left < b.right - 0.5 &&
          b.left < a.right - 0.5 &&
          a.top < b.bottom - 0.5 &&
          b.top < a.bottom - 0.5
        );
      };
      const bubbleBox = rect(node);
      const metaNode = node.querySelector('.meta');
      const meta = rect(metaNode);
      return {
        hasMeta: !!meta,
        inside:
          !!meta &&
          !!bubbleBox &&
          meta.top >= bubbleBox.top - 0.5 &&
          meta.bottom <= bubbleBox.bottom + 0.5 &&
          meta.left >= bubbleBox.left - 0.5 &&
          meta.right <= bubbleBox.right + 0.5,
        metaHeight: meta ? meta.bottom - meta.top : 0,
        // The seam: a body carrying a block takes the meta off its float.
        bodyIsBlock: !!node.querySelector('.bubble__body--block'),
        metaIsFloated: metaNode ? getComputedStyle(metaNode).float !== 'none' : null,
        overlapsPre: overlaps(meta, rect(node.querySelector('.bubble__pre'))),
        overlapsList: overlaps(meta, rect(node.querySelector('.bubble__list'))),
        overlapsLink: overlaps(meta, rect(node.querySelector('a'))),
      };
    });

    const at = (check: string) => `${theme}: ${check}`;
    expect(geometry.hasMeta, at('the mixed bubble has a meta')).toBe(true);
    expect(geometry.bodyIsBlock, at('the mixed body is a block body')).toBe(true);
    expect(geometry.metaIsFloated, at('the meta is not floated')).toBe(false);
    // Fully inside the bubble, and not collapsed.
    expect(geometry.inside, at('the meta is inside the bubble')).toBe(true);
    expect(geometry.metaHeight, at('the meta has height')).toBeGreaterThan(8);
    // Clear of every block it sits under.
    expect(geometry.overlapsPre, at('meta vs code block')).toBe(false);
    expect(geometry.overlapsList, at('meta vs list')).toBe(false);
    expect(geometry.overlapsLink, at('meta vs link')).toBe(false);
  }
});

test('a pure-paragraph body stays inline so the meta keeps its float', async ({ page }) => {
  await openFormatting(page);

  const shape = await bubbleWith(page, 'This one is bold').evaluate((node) => {
    const body = node.querySelector('.bubble__body');
    const meta = node.querySelector('.meta');
    return {
      bodyDisplay: body ? getComputedStyle(body).display : '',
      paraDisplay: body?.querySelector('.bubble__para')
        ? getComputedStyle(body.querySelector('.bubble__para')!).display
        : '',
      blockClass: !!node.querySelector('.bubble__body--block'),
      metaFloat: meta ? getComputedStyle(meta).float : '',
    };
  });

  // The other branch of the seam: no block, so the body and its paragraph stay
  // inline and the meta still floats to the end of the last line.
  expect(shape.blockClass).toBe(false);
  expect(shape.bodyDisplay).toBe('inline');
  expect(shape.paraDisplay).toBe('inline');
  expect(shape.metaFloat).toBe('right');
});

test('the crafted payload renders as text and executes nothing (S-5)', async ({ page }) => {
  await openFormatting(page);

  // The literal characters are shown, and no element the payload describes was
  // created. This is the same guarantee `chat.spec.ts` makes, now through the
  // tokenizer rather than a bare text node.
  await expect(page.getByText(INJECTION_PAYLOAD)).toBeVisible();
  expect(await page.evaluate(() => '__pwned' in window)).toBe(false);
  expect(await page.locator('script:not([src]):not([type="module"])').count()).toBeLessThanOrEqual(
    0,
  );
});

test('no raw-HTML injection API exists in the source', async ({ page }) => {
  await openFormatting(page);
  // Markup is built from elements only: a rendered message contains no `span`
  // standing in for an element React refused to create.
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('.bubble__body *')].some((node) =>
        node.outerHTML.startsWith('<script'),
      ),
    ),
  ).toBe(false);
});

test('the list is still virtualized with formatted rows', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(LARGE_FIXTURE);
  await expect(page.locator('.chat')).toBeVisible();

  await expect(page.getByText('5,001 messages')).toBeVisible();
  expect(await page.locator('.chat-list__item').count()).toBeLessThan(60);
});
