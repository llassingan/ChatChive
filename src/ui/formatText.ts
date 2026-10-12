/**
 * Message-body formatting (backlog E4-6; PRD F-VIEW-5, S-5).
 *
 * A pure tokenizer: text in, blocks and inline runs out. No React, no DOM, no
 * CSS, nothing that escapes, strips or rewrites a character. The renderer
 * (`chat/FormattedText.tsx`) turns the tokens into elements and text nodes, and
 * text nodes are the whole safety story (PRD S-5): a crafted export showing
 * `<script>` keeps every literal character and executes nothing.
 *
 * Rulings this file implements, all of them assertable in `formatText.test.ts`:
 *
 * 1. Markers work per inline run and never nest. `*a _b_*` renders the inner
 *    underscores as literal characters. Nested emphasis is not in E4-6's
 *    checklist, and doing it properly costs a parser with a stack, so v1 does
 *    not have one.
 * 2. A marker must be paired and must hug real text: `*bold*` yes, `a * b` no,
 *    `**` no, `* text*` yes (WhatsApp allows the leading space). A single
 *    unmatched `*` stays literal.
 * 3. Block code is the triple-backtick fence on its own line. Nothing inside it
 *    is tokenized, and an unterminated fence swallows the rest of the message,
 *    which is the honest reading of a message nobody closed.
 * 4. Inline code inside block code is not a thing; the block wins.
 * 5. `> ` at the start of a line starts a quote block and consecutive quote
 *    lines merge. A `>` inside a line is literal.
 * 6. `- `, `* ` and `1. ` at the start of a line start list items, and `* `
 *    as a bullet beats `*bold*` there because that is what the exports write.
 * 7. Links: `https?://`, `www.`, bare emails and the Indonesian phone shape
 *    (`+62 812-3456-789`, `0812-3456-789`). Trailing punctuation does not join
 *    the link. `external` is true for URLs, false for `mailto:`/`tel:`.
 * 8. Nothing is ever escaped, stripped or normalized into HTML: every token
 *    value is a substring of the input, so a screen reader hears the message
 *    and the S-5 test keeps passing.
 * 9. Empty string in, one empty paragraph out. Nothing here throws.
 */

/** One run of text. `kind` decides the element the renderer picks. */
export type TextToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'strike'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; href: string; external: boolean };

/** One block of a message body. */
export type TextBlock =
  | { kind: 'paragraph'; tokens: TextToken[] }
  | { kind: 'quote'; tokens: TextToken[] }
  | { kind: 'code'; value: string }
  | { kind: 'list'; ordered: boolean; items: TextToken[][] };

/** Whole-message result: the blocks, plus the jumbo-emoji verdict. */
export interface FormatResult {
  blocks: TextBlock[];
  /** 1-3 emoji and nothing else (DESIGN §3.1, §3.8). */
  jumbo: boolean;
  /** How many emoji, so the renderer can pick --fs-emoji-jumbo-1 or -3. */
  emojiCount: 0 | 1 | 2 | 3;
}

/** Single-character emphasis markers, and the token kind each one opens. */
const MARKERS: Record<string, 'bold' | 'italic' | 'strike' | 'code'> = {
  '*': 'bold',
  _: 'italic',
  '~': 'strike',
  '`': 'code',
};

/** A line that is only a triple-backtick fence (§2.2 rule 3). */
const FENCE = /^\s*```\s*$/;

/** A quote line: `>` at the start, then a space or nothing (§2.2 rule 5). */
const QUOTE = /^>(?: |$)/;

/** A list item: `- `, `* ` or `1. ` at the start of a line (§2.2 rule 6). */
const BULLET = /^[-*] /;
const NUMBERED = /^\d+\. /;

/** Trailing characters that never belong to a link (§2.2 rule 7). */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/** A URL with a scheme, or the bare `www.` form, matched at one position. */
const URL_AT = /(?:https?:\/\/|www\.)[^\s]+/iy;

/** A bare email address, matched at one position. */
const EMAIL_AT = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/y;

/** A bare phone number: `+62 812-3456-789` or `0812-3456-789` (§2.2 rule 7). */
const PHONE_AT = /(?:\+\d[\d\s-]{6,}\d|0\d[\d\s-]{6,}\d)/y;

/** The whole shape a phone candidate must have once trailing punctuation is off. */
const PHONE = /^(?:\+\d{1,3}[\s-]?|0)\d{2,4}(?:[\s-]\d{3,4}){1,3}$/;

/** The whole shape an email candidate must have. */
const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;

/**
 * A character a link may start after: line start, whitespace, or an opening
 * bracket or quote. Anything else means the "link" is glued to a word, which is
 * how a URL inside an email address or an identifier looks.
 */
function linkBoundaryBefore(value: string, index: number): boolean {
  if (index === 0) return true;
  return /[\s([{<"'*>_~`]/.test(value[index - 1]);
}

/** True when `index` sits on a word character, so no link may end there. */
function isWordAt(value: string, index: number): boolean {
  return index < value.length && /[\w@]/.test(value[index]);
}

/**
 * Strip the punctuation a sentence borrows from the end of a link. A closing
 * bracket only comes off when it is unbalanced, so a URL that really ends in
 * `)` (a Wikipedia article, say) keeps it.
 */
function trimTrailingPunctuation(candidate: string): string {
  let value = candidate.replace(TRAILING_PUNCTUATION, '');
  while (value.endsWith(')')) {
    const opens = (value.match(/\(/g) ?? []).length;
    const closes = (value.match(/\)/g) ?? []).length;
    if (closes <= opens) break;
    value = value.slice(0, -1);
  }
  return value;
}

interface LinkMatch {
  token: TextToken;
  end: number;
}

/** Try to read a link starting at `index`, or null when none starts there. */
function matchLink(value: string, index: number): LinkMatch | null {
  if (!linkBoundaryBefore(value, index)) return null;

  URL_AT.lastIndex = index;
  const url = URL_AT.exec(value);
  if (url) {
    const text = trimTrailingPunctuation(url[0]);
    if (text !== '') {
      return {
        token: {
          kind: 'link',
          value: text,
          href: text.startsWith('www.') ? `https://${text}` : text,
          external: true,
        },
        end: index + text.length,
      };
    }
  }

  EMAIL_AT.lastIndex = index;
  const email = EMAIL_AT.exec(value);
  if (email && !isWordAt(value, index + email[0].length)) {
    const text = trimTrailingPunctuation(email[0]);
    if (EMAIL.test(text)) {
      return {
        token: { kind: 'link', value: text, href: `mailto:${text}`, external: false },
        end: index + text.length,
      };
    }
  }

  // A phone number looks like a plain number until it has separators, so the
  // candidate is validated as a whole shape before it becomes a link.
  if (/[\d+]/.test(value[index])) {
    PHONE_AT.lastIndex = index;
    const phone = PHONE_AT.exec(value);
    if (phone && !isWordAt(value, index + phone[0].length)) {
      const text = trimTrailingPunctuation(phone[0]);
      if (PHONE.test(text)) {
        return {
          token: {
            kind: 'link',
            value: text,
            // The digits alone: a `tel:` href cannot carry spaces or dashes.
            href: `tel:${text.replace(/[^\d+]/g, '')}`,
            external: false,
          },
          end: index + text.length,
        };
      }
    }
  }

  return null;
}

/**
 * The closing index for a marker opened at `open`, or -1 when there is none.
 * The run must be paired and must hug real text (§2.2 rule 2), so an empty run
 * or one holding nothing but spaces is not a run at all.
 *
 * Both markers have to sit on a word boundary, which is WhatsApp's own rule and
 * the reason an identifier keeps its characters. `order_id_4512.pdf` and
 * `_private_var` are names, not emphasis, so the message must render as it was
 * written: a viewer that silently drops those underscores shows something the
 * export does not say, which is the one thing this app must never do.
 *
 * A closing candidate that fails the boundary test is skipped rather than
 * ending the run, so a marker later in the same line can still close it:
 * `_a_b_` renders `a_b` in italics, because the first underscore opens a run
 * that the last one legitimately closes, while `_private_var` stays literal.
 * The run also refuses to start or end on a dangling marker (`**`, `__`), which
 * would otherwise consume two markers and delete both characters.
 *
 * `isWordAt` is the helper the link matcher uses. It traps at index -1
 * (`value[-1]` is `undefined`, and `test` stringifies that to "undefined", which
 * matches `\w`), so index 0 goes through `linkBoundaryBefore` instead and
 * `isWordAt(value, -1)` is never reached.
 */
function findClose(value: string, open: number, char: string): number {
  if (open === 0) {
    if (!linkBoundaryBefore(value, open)) return -1;
  } else if (isWordAt(value, open - 1)) {
    return -1;
  }

  let close = value.indexOf(char, open + 1);
  while (close >= 0) {
    const inner = value.slice(open + 1, close);
    const endsOnBoundary = close === value.length - 1 || !isWordAt(value, close + 1);
    if (endsOnBoundary && /\S/.test(inner) && !inner.startsWith(char) && !inner.endsWith(char)) {
      return close;
    }
    close = value.indexOf(char, close + 1);
  }
  return -1;
}

/**
 * One inline run of a block: markers, links and literal text, in order. Links
 * are tried before markers so an underscore inside a URL stays a URL character
 * rather than opening an italic run.
 */
function tokenizeInline(value: string): TextToken[] {
  const tokens: TextToken[] = [];
  let literal = '';
  let index = 0;

  const flush = () => {
    if (literal === '') return;
    tokens.push({ kind: 'text', value: literal });
    literal = '';
  };

  while (index < value.length) {
    const link = matchLink(value, index);
    if (link) {
      flush();
      tokens.push(link.token);
      index = link.end;
      continue;
    }

    const char = value[index];
    const kind = MARKERS[char];
    if (kind) {
      const close = findClose(value, index, char);
      if (close > 0) {
        flush();
        tokens.push({ kind, value: value.slice(index + 1, close) });
        index = close + 1;
        continue;
      }
    }

    literal += char;
    index += 1;
  }

  flush();
  return tokens;
}

/** Drop blank lines from both edges of a fenced block. */
function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

/** Split a message body into blocks (§2.2 rules 3-6). */
function splitBlocks(text: string): TextBlock[] {
  let paragraph: string[] = [];
  const lines = text.split('\n');
  const blocks: TextBlock[] = [];
  let items: string[] = [];
  let quote: string[] = [];
  let ordered = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', tokens: tokenizeInline(paragraph.join('\n')) });
    paragraph = [];
  };

  const flushQuote = () => {
    if (quote.length === 0) return;
    blocks.push({ kind: 'quote', tokens: tokenizeInline(quote.join('\n')) });
    quote = [];
  };

  const flushList = () => {
    if (items.length === 0) return;
    blocks.push({ kind: 'list', ordered, items: items.map((item) => tokenizeInline(item)) });
    items = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (FENCE.test(line)) {
      flushParagraph();
      flushQuote();
      flushList();
      // The fence closes the block; nothing inside it is tokenized, and an
      // unterminated fence swallows the rest of the message (rule 3).
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: 'code', value: trimBlankEdges(body).join('\n') });
      continue;
    }

    if (QUOTE.test(line)) {
      flushParagraph();
      flushList();
      quote.push(line.replace(QUOTE, ''));
      continue;
    }

    const numbered = NUMBERED.test(line);
    if (BULLET.test(line) || numbered) {
      flushParagraph();
      flushQuote();
      // `ordered` follows the first item of the run, because that is the line
      // that decided the list was numbered.
      if (items.length === 0) ordered = numbered;
      items.push(line.replace(numbered ? NUMBERED : BULLET, ''));
      continue;
    }

    flushQuote();
    flushList();
    // A blank line stays inside its paragraph: the body renders with
    // `white-space: pre-wrap`, so the writer's own line breaks are kept.
    paragraph.push(line);
  }

  flushParagraph();
  flushQuote();
  flushList();

  // Empty string in, one empty paragraph out (rule 9).
  if (blocks.length === 0) blocks.push({ kind: 'paragraph', tokens: [] });
  return blocks;
}

/** An emoji base codepoint, by range. A codepoint scan, not a segmenter (§3.9). */
function isEmojiBase(code: number): boolean {
  return (
    code === 0x00a9 ||
    code === 0x00ae ||
    code === 0x203c ||
    code === 0x2049 ||
    code === 0x2122 ||
    code === 0x2139 ||
    (code >= 0x2194 && code <= 0x21aa) ||
    (code >= 0x231a && code <= 0x23fa) ||
    code === 0x24c2 ||
    (code >= 0x25aa && code <= 0x25fe) ||
    (code >= 0x2600 && code <= 0x27bf) ||
    (code >= 0x2934 && code <= 0x2935) ||
    (code >= 0x2b05 && code <= 0x2b55) ||
    code === 0x3030 ||
    code === 0x303d ||
    code === 0x3297 ||
    code === 0x3299 ||
    (code >= 0x1f000 && code <= 0x1faff)
  );
}

/** A joiner or a combining part that stays inside the cluster before it. */
function isEmojiJoiner(code: number): boolean {
  // ZWJ, variation selector, skin tone.
  return code === 0x200d || code === 0xfe0f || (code >= 0x1f3fb && code <= 0x1f3ff);
}

/** A regional indicator, two of which make one flag. */
function isRegionalIndicator(code: number): boolean {
  return code >= 0x1f1e6 && code <= 0x1f1ff;
}

/**
 * How many emoji a string holds, or 0 as soon as anything that is neither emoji
 * nor whitespace appears. A ZWJ sequence (`👩‍💻`), a skin-tone variant, a keycap
 * (`1️⃣`) and a regional-indicator flag pair each count once.
 */
function countEmoji(text: string): number {
  const points = Array.from(text);
  let count = 0;
  let index = 0;

  while (index < points.length) {
    const code = points[index].codePointAt(0) ?? 0;

    if (/\s/.test(points[index])) {
      index += 1;
      continue;
    }

    const keycap =
      /[\d#*]/.test(points[index]) &&
      points[index + 1] === '\uFE0F' &&
      points[index + 2] === '\u20E3';
    const flag = isRegionalIndicator(code);

    if (!keycap && !flag && !isEmojiBase(code)) return 0;

    count += 1;
    if (count > 3) return 0;
    index += keycap ? 3 : 1;

    // A flag is two regional indicators, and a ZWJ sequence is one emoji made
    // of several bases; both stay one cluster for the count above.
    let pendingJoiner = false;
    while (index < points.length) {
      const next = points[index].codePointAt(0) ?? 0;
      if (isEmojiJoiner(next)) {
        pendingJoiner = next === 0x200d;
        index += 1;
        continue;
      }
      if (flag && isRegionalIndicator(next)) {
        index += 1;
        continue;
      }
      if (pendingJoiner && isEmojiBase(next)) {
        pendingJoiner = false;
        index += 1;
        continue;
      }
      break;
    }
  }

  return count;
}

/** True for a string that is entirely 1-3 emoji plus optional whitespace. */
export function isJumboEmoji(text: string): boolean {
  const count = countEmoji(text);
  return count >= 1 && count <= 3;
}

/** Format one message body into blocks, plus the jumbo-emoji verdict. */
export function formatText(text: string): FormatResult {
  const emojiCount = countEmoji(text);
  const jumbo = emojiCount >= 1 && emojiCount <= 3;
  return {
    blocks: splitBlocks(text),
    jumbo,
    emojiCount: jumbo ? (emojiCount as 1 | 2 | 3) : 0,
  };
}

/**
 * The same message as a screen reader should hear: markers dropped, block
 * boundaries collapsed to single spaces, links left as their visible text.
 * Used for the bubble's aria-label (DESIGN §5) so the label never contains an
 * asterisk. Never returns markup, and never invents characters: every
 * character of the result appears in the input, in order (§2.2 rule 8).
 */
export function toPlainText(text: string): string {
  const parts: string[] = [];

  for (const block of formatText(text).blocks) {
    if (block.kind === 'code') {
      parts.push(block.value);
    } else if (block.kind === 'list') {
      parts.push(block.items.map((item) => item.map((token) => token.value).join('')).join(' '));
    } else {
      parts.push(block.tokens.map((token) => token.value).join(''));
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
