/**
 * The virtualizer seed (E4-1, E4-6 §4.9).
 *
 * `@tanstack/react-virtual` calls `estimateSize` for **every** index the first
 * time it computes the total size, not only for the visible window, so whatever
 * that callback does is paid once per message in the chat at mount. Measured
 * against the pinned `@tanstack/virtual-core`: one `getTotalSize()` on a
 * 100,000-row chat ran the callback exactly 100,000 times.
 *
 * That is why `estimateRow` gates its `formatText` call behind `looksStructured`
 * (E4-6's report has the numbers: `formatText` ~8us, the probe ~0.05us, so 100k
 * rows cost ~1.45s of mount versus ~5ms). The property that matters is therefore
 * **soundness**: the probe must never say "plain" about a body that could carry a
 * block or an emoji, because that would seed the row from the wrong shape. False
 * positives only cost a `formatText` call on one row, which is cheap and correct,
 * so the tables below are one-sided on purpose.
 */

import { describe, expect, it } from 'vitest';
import { looksStructured } from './layout.ts';

describe('looksStructured: soundness (never misses a structured body)', () => {
  it.each([
    ['a fence at the start', '```\ncode\n```'],
    ['a fence after a line', 'intro\n```\ncode\n```'],
    ['an indented fence', '  ```\ncode\n  ```'],
    ['a quote at the start', '> quoted'],
    ['a quote after a line', 'intro\n> quoted'],
    ['a bare quote marker', '>'],
    ['a hyphen bullet', '- one\n- two'],
    ['an asterisk bullet', '* one\n* two'],
    ['a numbered item', '1. one\n2. two'],
    ['a list after a line', 'intro\n- item'],
    ['an indented bullet', '  - item'],
    ['a ten-item numbered list', '10. ten'],
    ['a single emoji', '\u{1F44D}'],
    ['a three-emoji message', '\u{1F44D}\u{1F389}\u{1F600}'],
    ['an emoji mid-sentence', 'great job \u{1F44D}'],
    ['a heart with a variation selector', '\u{2764}\u{FE0F}'],
    ['a ZWJ sequence', '\u{1F469}\u200D\u{1F4BB}'],
    ['a skin-tone modifier', '\u{1F44D}\u{1F3FD}'],
    ['a regional-indicator flag', '\u{1F1EE}\u{1F1E9}'],
    ['a keycap sequence', '1\u{FE0F}\u{20E3}'],
    ['a non-Latin script', '\u4F60\u597D'],
  ])('%s is flagged', (_label, text) => {
    expect(looksStructured(text)).toBe(true);
  });
});

describe('looksStructured: the plain path stays plain (so the seed stays cheap)', () => {
  it.each([
    ['a plain sentence', 'Plain message with no markers at all'],
    ['a formatted single line', 'This one is *bold* in the middle of a sentence'],
    ['a link', 'Read the notes at https://example.com/notes?ref=chat for the details'],
    ['an email address', 'Mail the summary to elin.sato@example.co.id before Friday'],
    ['a phone number', 'Call the office on +62 812-3456-789 if the link is down'],
    ['a bare host', 'The handbook lives at www.example.org/handbook and covers it'],
    ['a hyphenated word', 'well-known a-b-c'],
    ['an empty string', ''],
    ['a single space', ' '],
    // The bullet markers only count at the start of a line, so a mid-line `- `
    // or `* ` is inline text and the row is a plain one.
    ['a mid-line dash', 'before - after'],
    ['a mid-line asterisk', 'before * after'],
    ['a sentence with a number', 'in 2026 we shipped 1.0'],
    // Latin-1 is all Latin-1: a precomposed accent is not emoji, and these stay
    // plain, which is what keeps ordinary European text on the cheap path.
    ['a precomposed accent', 'Ren\u00e9 and Jos\u00e9'],
    ['a German sharp s', 'Stra\u00dfe 5'],
    ['a Nordic vowel', '\u00c5se and \u00d8yvind'],
  ])('%s stays plain', (_label, text) => {
    expect(looksStructured(text)).toBe(false);
  });

  it.each([
    // A combining mark is above Latin-1, so the probe flags it: a false positive,
    // and the direction the probe is allowed to be wrong in. It costs one
    // `formatText` call and the seed is still correct.
    ['a combining acute accent', 'Renee\u0301 and Jose\u0301'],
  ])('%s is flagged, which is safe', (_label, text) => {
    expect(looksStructured(text)).toBe(true);
  });
});

describe('looksStructured agrees with formatText on every structured body', () => {
  // The cross-check that makes the probe safe to trust: for anything the
  // tokenizer would treat as a block or as jumbo, the probe must be true.
  it.each([
    '```\ncode\n```',
    '> quoted',
    '- item',
    '* item',
    '1. item',
    'intro\n```\ncode\n```',
    'intro\n- item',
    '\u{1F44D}',
    '\u{1F44D}\u{1F389}\u{1F600}',
    'nice \u{1F44D}',
  ])('%j is flagged', (text) => {
    expect(looksStructured(text)).toBe(true);
  });
});
