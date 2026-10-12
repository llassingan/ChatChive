/**
 * Tokenizer rules (E4-6). Every rule in `formatText.ts`'s header is asserted
 * here, plus the invariant that keeps the S-5 test green: the tokenizer never
 * escapes, strips or invents a character.
 *
 * Two readings of the brief needed a decision, both recorded in the sprint
 * report and asserted below:
 *
 * - `* text*` at the start of a line is a list bullet, not a bold run: rule 6
 *   says `* ` at line start takes precedence over `*bold*`, and `* ` is the
 *   first two characters of `* text*`. Rule 2's "WhatsApp allows the leading
 *   space" is asserted mid-line, where no bullet can compete.
 * - Rule 8's literal "plain text is a substring" cannot hold once a marker
 *   between two words is dropped (`*bold* and` reads `bold and`, which is not a
 *   substring). The two checkable forms kept here are stricter than a substring
 *   test in the ways that matter: every token value IS a raw substring of the
 *   input, and the plain text is a subsequence of it.
 */
import { describe, expect, it } from 'vitest';
import { formatText, isJumboEmoji, toPlainText, type TextToken } from './formatText.ts';

/** The first paragraph's tokens, for the inline-marker tests. */
function paragraphOf(text: string): TextToken[] {
  const block = formatText(text).blocks[0];
  if (block.kind !== 'paragraph') throw new Error(`expected a paragraph, got ${block.kind}`);
  return block.tokens;
}

/** Every inline token in the message, blocks flattened. */
function allTokens(text: string): TextToken[] {
  const out: TextToken[] = [];
  for (const block of formatText(text).blocks) {
    if (block.kind === 'paragraph' || block.kind === 'quote') out.push(...block.tokens);
    if (block.kind === 'list') for (const item of block.items) out.push(...item);
  }
  return out;
}

function blockKinds(text: string): string[] {
  return formatText(text).blocks.map((block) => block.kind);
}

/** Whether `needle`'s characters appear in `haystack` in order. */
function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return needle.length === 0;
}

describe('inline markers', () => {
  it('turns each paired marker into its own token kind, value without markers', () => {
    expect(paragraphOf('*bold*')).toEqual([{ kind: 'bold', value: 'bold' }]);
    expect(paragraphOf('_italic_')).toEqual([{ kind: 'italic', value: 'italic' }]);
    expect(paragraphOf('~strike~')).toEqual([{ kind: 'strike', value: 'strike' }]);
    expect(paragraphOf('`code`')).toEqual([{ kind: 'code', value: 'code' }]);
  });

  it('keeps the literal text around and between runs', () => {
    expect(paragraphOf('a *b* c')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'bold', value: 'b' },
      { kind: 'text', value: ' c' },
    ]);
  });

  it('allows the leading space WhatsApp allows inside a run', () => {
    expect(paragraphOf('say * text*')).toEqual([
      { kind: 'text', value: 'say ' },
      { kind: 'bold', value: ' text' },
    ]);
  });
});

describe('rule 1: markers do not nest', () => {
  it('leaves the inner marker of `*a _b_*` as literal characters', () => {
    // v1 carries no stack: the bold run is the whole span, underscores and all.
    expect(paragraphOf('*a _b_*')).toEqual([{ kind: 'bold', value: 'a _b_' }]);
  });

  it('scans an italic run the same way, inner asterisks staying literal', () => {
    expect(paragraphOf('_a *b*_')).toEqual([{ kind: 'italic', value: 'a *b*' }]);
  });
});

describe('rule 2: a marker must be paired and hug real text', () => {
  it.each([
    ['*bold*', 'bold'],
    ['say * text*', ' text'],
  ])('%s is a run', (input, value) => {
    expect(paragraphOf(input).find((token) => token.kind === 'bold')).toEqual({
      kind: 'bold',
      value,
    });
  });

  it('reads `say * text *` as a run: there is real text between the markers', () => {
    expect(paragraphOf('say * text *')).toEqual([
      { kind: 'text', value: 'say ' },
      { kind: 'bold', value: ' text ' },
    ]);
  });

  it.each([['say  **  '], ['a * b'], ['**']])('%s stays literal', (input) => {
    expect(paragraphOf(input)).toEqual([{ kind: 'text', value: input }]);
  });

  it.each([['*'], ['_'], ['~'], ['`']])('a lone %s is literal text', (marker) => {
    expect(paragraphOf(`before ${marker}`)).toEqual([{ kind: 'text', value: `before ${marker}` }]);
  });

  // A marker inside a word is part of an identifier, not emphasis: both markers
  // have to sit on a word boundary (QA finding F-2, extended by the shell
  // track's probe). These bodies must round-trip unchanged, because a viewer
  // that drops the underscores from `order_id_4512.pdf` shows something the
  // export does not say.
  //
  // The leading-underscore group is the shape a one-sided check misses: the
  // opening `_` of `_private_var` is on a boundary, so it opens a run, and only
  // a boundary test on the closing side stops the characters being eaten.
  it.each([
    ['order_id_4512.pdf'],
    ['snake_case_name.txt'],
    ['the file is report_final_v2.docx'],
    ['backup_2026_07_13.zip'],
    ['IMG_20260602_WA0010_1.jpg'],
    ['my_file_2026.txt'],
    ['DEBUG_MODE_AND_THEN_SOME'],
    ['2*3*4 = 24'],
    ['3~4~5 range'],
    ['_private_var'],
    ['obj._field_name'],
    ['_id_4512.pdf'],
    ['__init__'],
    ['/api/v1/user_id'],
  ])('%s keeps its characters (a mid-word marker is not markup)', (input) => {
    expect(paragraphOf(input)).toEqual([{ kind: 'text', value: input }]);
    expect(toPlainText(input)).toBe(input);
  });

  // The inverse of the group above: here both underscores really are on
  // boundaries, so this is emphasis and the name between them survives inside
  // the italics rather than being deleted.
  it('italicises a boundary-paired name without losing its characters', () => {
    expect(paragraphOf('_protected_name_')).toEqual([{ kind: 'italic', value: 'protected_name' }]);
    expect(toPlainText('_protected_name_')).toBe('protected_name');
  });

  // The same boundary rule must not stop the ordinary forms, including a run
  // that opens at index 0 and one that closes on the final character.
  it.each([
    ['*bold*', { kind: 'bold', value: 'bold' }],
    ['_italic_', { kind: 'italic', value: 'italic' }],
    ['~strike~', { kind: 'strike', value: 'strike' }],
    ['`code`', { kind: 'code', value: 'code' }],
  ])('%s still formats with the boundary rule in place', (input, token) => {
    expect(paragraphOf(input)).toEqual([token]);
  });

  it('formats a run that starts the message and one that ends it', () => {
    expect(paragraphOf('*bold at the front* and text')).toEqual([
      { kind: 'bold', value: 'bold at the front' },
      { kind: 'text', value: ' and text' },
    ]);
    expect(paragraphOf('text and *bold at the end*')).toEqual([
      { kind: 'text', value: 'text and ' },
      { kind: 'bold', value: 'bold at the end' },
    ]);
  });

  // Under the word-boundary rule the inner close of `*one *two*` is not a
  // boundary (a space follows the second `*`, but `two*` leaves the marker
  // glued to the closing text), so the run continues to the final marker. Both
  // readings keep every character; this one keeps the emphasis intact.
  it('takes the last boundary close: `*one *two*` bolds `one *two`', () => {
    expect(paragraphOf('*one *two*')).toEqual([{ kind: 'bold', value: 'one *two' }]);
  });

  it('skips a mid-word close and keeps looking: `_a_b_` italicises `a_b`', () => {
    expect(paragraphOf('_a_b_')).toEqual([{ kind: 'italic', value: 'a_b' }]);
  });

  it('stays literal when no closing marker sits on a boundary', () => {
    expect(paragraphOf('_a_b_c')).toEqual([{ kind: 'text', value: '_a_b_c' }]);
  });
});

describe('unmatched markers stay literal', () => {
  it.each([
    ['an unmatched *asterisk'],
    ['an unmatched _underscore'],
    ['an unmatched ~tilde'],
    ['an unmatched `backtick'],
    ['a > after the start of a line'],
    ['2 > 1'],
  ])('%s', (input) => {
    expect(paragraphOf(input)).toEqual([{ kind: 'text', value: input }]);
  });

  it.each([['-'], ['1.'], ['1.5 dollars'], ['-1 degree']])(
    '%s is not a list on its own',
    (input) => {
      expect(blockKinds(input)).toEqual(['paragraph']);
    },
  );
});

describe('rule 3: block code', () => {
  it('reads a fenced block and tokenizes nothing inside it', () => {
    const blocks = formatText('before\n```\n*bold* _still code_\n```\nafter').blocks;
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'code', 'paragraph']);
    const code = blocks[1];
    expect(code.kind === 'code' && code.value).toBe('*bold* _still code_');
  });

  it('swallows the rest of the message when the fence is never closed', () => {
    const blocks = formatText('intro\n```\nline one\nline two *still*').blocks;
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'code']);
    const code = blocks[1];
    expect(code.kind === 'code' && code.value).toBe('line one\nline two *still*');
  });

  it('keeps blank lines inside the block but trims them from the edges', () => {
    expect(formatText('```\n\ncode here\n\n```').blocks).toEqual([
      { kind: 'code', value: 'code here' },
    ]);
  });

  it('accepts an indented fence line', () => {
    expect(blockKinds('  ```\ncode\n  ```')).toEqual(['code']);
  });
});

describe('rules 4-6: block code wins, quotes and lists', () => {
  it('does not tokenize inline code inside a block', () => {
    expect(formatText('```\n`not a run`\n```').blocks).toEqual([
      { kind: 'code', value: '`not a run`' },
    ]);
  });

  it('merges consecutive quote lines into one block', () => {
    const blocks = formatText('> line one\n> line two').blocks;
    expect(blocks.map((block) => block.kind)).toEqual(['quote']);
    const quote = blocks[0];
    expect(quote.kind === 'quote' && quote.tokens).toEqual([
      { kind: 'text', value: 'line one\nline two' },
    ]);
  });

  it('reads a bare `>` as an empty quote line', () => {
    expect(blockKinds('>')).toEqual(['quote']);
  });

  it.each([
    ['- one\n- two', false],
    ['* one\n* two', false],
    ['1. one\n2. two', true],
  ])('%s is a list (ordered: %s)', (input, ordered) => {
    const blocks = formatText(input).blocks;
    expect(blocks.map((block) => block.kind)).toEqual(['list']);
    const list = blocks[0];
    if (list.kind !== 'list') throw new Error('expected a list');
    expect(list.ordered).toBe(ordered);
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toEqual([{ kind: 'text', value: 'one' }]);
  });

  it('gives `* ` as a bullet precedence over *bold* at the start of a line', () => {
    const list = formatText('* bold looking item').blocks[0];
    if (list.kind !== 'list') throw new Error('expected a list');
    expect(list.items[0]).toEqual([{ kind: 'text', value: 'bold looking item' }]);
  });

  it('takes even `* text*` at the start of a line as a bullet, not a bold run', () => {
    const list = formatText('* text*').blocks[0];
    if (list.kind !== 'list') throw new Error('expected a list');
    expect(list.items[0]).toEqual([{ kind: 'text', value: 'text*' }]);
  });

  it('still bolds a closed `*run*` that is not followed by a space', () => {
    expect(paragraphOf('*bold* not a bullet')).toEqual([
      { kind: 'bold', value: 'bold' },
      { kind: 'text', value: ' not a bullet' },
    ]);
  });

  it('separates a paragraph, a list and a quote into blocks in order', () => {
    expect(blockKinds('intro\n- item\n> quoted')).toEqual(['paragraph', 'list', 'quote']);
  });

  it('tokenizes markers inside a list item', () => {
    const list = formatText('- *bold* item').blocks[0];
    if (list.kind !== 'list') throw new Error('expected a list');
    expect(list.items[0]).toEqual([
      { kind: 'bold', value: 'bold' },
      { kind: 'text', value: ' item' },
    ]);
  });
});

describe('rule 7: linkification', () => {
  it('links an https URL as external with the URL as its href', () => {
    expect(paragraphOf('see https://example.com/a?b=1')).toEqual([
      { kind: 'text', value: 'see ' },
      {
        kind: 'link',
        value: 'https://example.com/a?b=1',
        href: 'https://example.com/a?b=1',
        external: true,
      },
    ]);
  });

  it('links a bare www. host and gives it an https href', () => {
    expect(paragraphOf('www.example.com')).toEqual([
      { kind: 'link', value: 'www.example.com', href: 'https://www.example.com', external: true },
    ]);
  });

  it.each([
    ['https://example.com.', 'https://example.com'],
    ['https://example.com,', 'https://example.com'],
    ['https://example.com:', 'https://example.com'],
    ['(https://example.com)', 'https://example.com'],
  ])('%s links %s without the trailing punctuation', (input, value) => {
    expect(allTokens(input).find((token) => token.kind === 'link')?.value).toBe(value);
  });

  it('keeps a balanced closing bracket that is part of the URL', () => {
    expect(allTokens('https://en.wikipedia.org/wiki/Foo_(bar)')[0]).toMatchObject({
      kind: 'link',
      value: 'https://en.wikipedia.org/wiki/Foo_(bar)',
    });
  });

  it('renders an email as a mailto link with the external flag false', () => {
    expect(paragraphOf('mail me at ana@example.co.id')).toEqual([
      { kind: 'text', value: 'mail me at ' },
      {
        kind: 'link',
        value: 'ana@example.co.id',
        href: 'mailto:ana@example.co.id',
        external: false,
      },
    ]);
  });

  it.each([
    ['+62 812-3456-789', 'tel:+628123456789'],
    ['0812-3456-789', 'tel:08123456789'],
    ['0812 3456 7890', 'tel:081234567890'],
  ])('renders the phone shape %s as a tel link over its digits', (input, href) => {
    expect(allTokens(input).find((token) => token.kind === 'link')).toEqual({
      kind: 'link',
      value: input,
      href,
      external: false,
    });
  });

  it.each([['2026'], ['19.99'], ['harga 20000 rupiah'], ['1.2.3'], ['+62'], ['0']])(
    'leaves the bare number %s as text',
    (input) => {
      expect(allTokens(input).some((token) => token.kind === 'link')).toBe(false);
    },
  );

  it('links an email once, not the fragment of it that looks like a URL', () => {
    const links = allTokens('write to ana@example.com now').filter(
      (token) => token.kind === 'link',
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.value).toBe('ana@example.com');
  });

  it('links a URL that sits right after a marker boundary', () => {
    expect(paragraphOf('*see* https://example.com')).toEqual([
      { kind: 'bold', value: 'see' },
      { kind: 'text', value: ' ' },
      { kind: 'link', value: 'https://example.com', href: 'https://example.com', external: true },
    ]);
  });
});

describe('rule 8: nothing is escaped, stripped or normalized', () => {
  const inline = [
    '*bold* and _italic_ and ~strike~ and `code`',
    '- one\n- two\n1. three',
    '```\ncode *not bold*\n```',
    'visit https://example.com/x. or www.example.com, or ana@example.com',
    'call +62 812-3456-789',
    'plain text with no markers at all',
    '<script>window.__pwned = true</script>',
    'a & b < c > d "quoted" \'single\'',
    '',
  ];

  it.each(inline)('%j: every token value is a raw substring of the input', (input) => {
    for (const token of allTokens(input)) {
      expect(input).toContain(token.value);
    }
  });

  it.each([...inline, '> a quote\n> more quote'])(
    '%j: the plain text is a subsequence of the input',
    (input) => {
      expect(isSubsequence(toPlainText(input).replace(/\s+/g, ''), input.replace(/\s+/g, ''))).toBe(
        true,
      );
    },
  );

  it('leaves entity-looking characters alone rather than escaping them', () => {
    // A tokenizer that "escaped to be safe" would turn these into `&lt;`.
    expect(toPlainText('<script>')).toBe('<script>');
    expect(toPlainText('a & b')).toBe('a & b');
  });

  it('adds, drops and reorders nothing beyond the markers themselves', () => {
    expect(
      allTokens('*bold* and `code`')
        .map((token) => token.value)
        .join(''),
    ).toBe('bold and code');
  });
});

describe('toPlainText', () => {
  it('collapses block boundaries to single spaces', () => {
    expect(toPlainText('intro\n- item\n> quoted')).toBe('intro item quoted');
  });

  it('has no marker characters left for a formatted message', () => {
    expect(toPlainText('*bold* _italic_ ~strike~ `code`')).toBe('bold italic strike code');
  });

  it('drops only the block marker, leaving the quoted words intact', () => {
    expect(toPlainText('> a quote\n> more quote')).toBe('a quote more quote');
  });

  it('leaves a link as its visible text, not its href', () => {
    expect(toPlainText('go to https://example.com now')).toBe('go to https://example.com now');
    expect(toPlainText('call +62 812-3456-789')).toBe('call +62 812-3456-789');
  });

  it('returns an empty string for an empty message', () => {
    expect(toPlainText('')).toBe('');
  });

  it('keeps the literal script payload exactly as written', () => {
    const payload = '<script>window.__pwned = true</script>';
    expect(toPlainText(payload)).toBe(payload);
  });
});

describe('rule 9: nothing throws, empty in gives a paragraph out', () => {
  it.each([
    [''],
    ['\n'],
    ['   '],
    ['```'],
    ['>'],
    ['- '],
    ['*'],
    ['https://'],
    ['\u0000'],
    ['a'.repeat(20000)],
    ['\u{1F44D}'.repeat(500)],
    ['*'.repeat(5000)],
  ])('%j does not throw and always yields at least one block', (input) => {
    expect(formatText(input).blocks.length).toBeGreaterThan(0);
  });

  it('returns one empty paragraph for an empty string', () => {
    expect(formatText('')).toEqual({
      blocks: [{ kind: 'paragraph', tokens: [] }],
      jumbo: false,
      emojiCount: 0,
    });
  });

  it('reports no jumbo for an empty string', () => {
    expect(isJumboEmoji('')).toBe(false);
  });
});

describe('jumbo emoji (§3.9)', () => {
  it.each([['\u{1F44D}'], ['\u{1F44D} '], [' \u{2764}\u{FE0F} '], ['\u{1F44D}\u{1F389}']])(
    '%j is jumbo',
    (input) => {
      expect(isJumboEmoji(input)).toBe(true);
      expect(formatText(input).jumbo).toBe(true);
    },
  );

  it.each([
    ['\u{1F44D}\u{1F389}\u{1F600}\u{1F525}'],
    ['hello'],
    ['\u{1F44D} hello'],
    ['x\u{1F44D}'],
  ])('%j is not jumbo', (input) => {
    expect(isJumboEmoji(input)).toBe(false);
    expect(formatText(input).jumbo).toBe(false);
  });

  it('reports the emoji count so the renderer can pick a scale', () => {
    expect(formatText('\u{1F44D}').emojiCount).toBe(1);
    expect(formatText('\u{1F44D}\u{1F389}').emojiCount).toBe(2);
    expect(formatText('\u{1F44D}\u{1F389}\u{1F600}').emojiCount).toBe(3);
    expect(formatText('\u{1F44D}\u{1F389}\u{1F600}\u{1F525}').emojiCount).toBe(0);
  });

  it('counts a ZWJ sequence, a skin tone and a flag pair as one emoji each', () => {
    expect(formatText('\u{1F469}\u200D\u{1F4BB}').emojiCount).toBe(1);
    expect(formatText('\u{1F44D}\u{1F3FD}').emojiCount).toBe(1);
    expect(formatText('\u{1F1EE}\u{1F1E9}').emojiCount).toBe(1);
  });

  it('counts a keycap sequence as one emoji', () => {
    expect(formatText('1\u{FE0F}\u{20E3}').emojiCount).toBe(1);
  });

  it('does not call a 4-emoji message jumbo', () => {
    expect(formatText('\u{1F44D}\u{1F44D}\u{1F44D}\u{1F44D}')).toMatchObject({
      jumbo: false,
      emojiCount: 0,
    });
  });

  it('reports jumbo false when the message is only whitespace', () => {
    expect(formatText('   \n  ').jumbo).toBe(false);
  });
});
