/**
 * Search in chat: the pure half (backlog E7-1; PRD F-NAV-2).
 *
 * Everything here is a function of its arguments: no DOM, no React, no state.
 * `ChatView` hands this module a chat and a query and renders what comes back,
 * so the matching rules are unit-testable without a browser.
 *
 * # What a match is measured against
 *
 * Matching runs over the text the reader actually sees, not over the raw body.
 * `*bold*` renders as `bold`, so a range found in the raw string would point at
 * the wrong characters in the rendered one. `bodyRuns` therefore derives the
 * same runs `FormattedText` renders (one per paragraph/quote/code block, one per
 * list item, each the concatenation of its token values) and every range is an
 * offset into one of those runs. `FormattedText` walks its own blocks with the
 * same keys and splits its text nodes at those offsets, which is what makes the
 * highlight land on the right characters without re-implementing the
 * formatter.
 *
 * # What is searched
 *
 * A message contributes up to two haystacks:
 *
 * - its body (`text` on a text message, `caption` on a media message), and
 * - its sender's display name, so typing a person's name finds what they said.
 *
 * A **system notice is not searched**, by the same rule `layout.ts` already
 * uses to decide whether a message can join a run (`senderId !== null &&
 * kind !== 'system'`). Notices are the export's own furniture ("Messages and
 * calls are end-to-end encrypted…", "You changed the subject"): no author,
 * nothing the reader wrote. They also render as centered pills rather than
 * bubbles, so a match inside one could not be highlighted the way every other
 * match is without re-inventing that pill. `deleted`, `call` and `empty` have no
 * body to match and are skipped, and a media message's own filename
 * (`IMG-…jpg`) is not a haystack either, because the reader never sees it as
 * text.
 *
 * Deleted messages are also excluded from the sender-name pass: the rendered
 * row is chrome ("You deleted this message"), so a name match there would light
 * up a row whose whole content the reader did not write.
 *
 * # Cost
 *
 * The target is a 100k-message export (PRD §9), so the body pass gates the
 * expensive step behind a cheap one: most messages are rejected by two
 * `includes` calls on their folded text, and only the survivors are tokenized.
 * The gate deliberately tests both the raw text and the marker-free variant of
 * it, so it can never reject a message that really does match: removing
 * characters from a string keeps every substring it had contiguous.
 */

import type { Chat, Message } from '../../types/chat.ts';
import { formatText } from '../formatText.ts';

/** A half-open character range. */
export interface Range {
  start: number;
  end: number;
}

/** The parts of a message a query can match. */
export type SearchField = 'text' | 'caption' | 'sender';

/** One match, in the coordinates of the string it was found in. */
export interface SearchMatch extends Range {
  messageId: string;
  /** Index into `chat.messages`, for the virtualizer's `scrollToIndex`. */
  messageIndex: number;
  field: SearchField;
  /** Which body run held it: the block index. Absent for a sender match. */
  blockIndex?: number;
  /** The list item inside a list block, or -1 for a whole-block run. */
  itemIndex?: number;
}

/** The text of one run, plus the ranges to highlight inside it. */
export interface RunRanges {
  text: string;
  ranges: Range[];
}

/**
 * The match prev/next is standing on, in the shape a renderer compares against
 * its own runs. `SearchMatch` is structurally assignable to this: it carries the
 * same range plus the block and item it was found in, so nothing has to be
 * converted on the way down to `FormattedText`.
 */
export interface ActiveHighlight extends Range {
  /** The block the match was found in. Absent for a sender-name match. */
  blockIndex?: number;
  /** The list item inside a list block. Absent for a whole-block run. */
  itemIndex?: number;
}

/**
 * One message's highlights, in the shape the renderer and the result list need.
 *
 * `body` is keyed by the raw string it indexes, because `FormattedText` is
 * rendered per string and has no other way to say which field it is drawing:
 * the row passes `body.runs` down only when its own `text` prop is that string.
 */
export interface MessageSearch {
  messageIndex: number;
  /** The body or caption highlights, or null when the search hit only the name. */
  body: { text: string; field: SearchField; runs: Map<string, RunRanges> } | null;
  /** The sender's display name, so the panel can name the row it found. */
  name: string | null;
  /** The sender-name matches, which the row and the result list report. */
  sender: Range[] | null;
  /** This message's matches, in reading order. */
  matches: SearchMatch[];
}

/** Everything one query produces. */
export interface SearchResults {
  /** The query's folded form; empty means the empty state. */
  needle: string;
  /** Flat and in visual order, which prev/next walks. */
  matches: SearchMatch[];
  /** Grouped by message, in message order, for the list and the panel. */
  messages: MessageSearch[];
  /** The same groups keyed by message index, for a row lookup. */
  byMessage: Map<number, MessageSearch>;
}

/**
 * Fold a string for comparison: decompose (NFD), drop combining marks,
 * lowercase.
 *
 * NFD splits `é` into `e` + U+0301, so stripping the `\p{M}` category leaves a
 * bare `e` and `cafe` matches `café`. Emoji carry no combining marks and are not
 * letters, so they survive untouched and `👍` still finds `👍`.
 *
 * The lowercase pass runs on the decomposed form, which is what the Turkish
 * dotted I needs: NFD takes `İ` (U+0130) to `I` + U+0307, the mark is stripped,
 * and the remaining `I` lowercases to `i`.
 */
export function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/**
 * Fold a haystack once, code point by code point, keeping each code point's
 * original offset. Folding changes string length, so a position in the folded
 * form is not a position in the original; carrying the offsets is how a range
 * still slices the string the renderer prints.
 */
function foldWithOffsets(haystack: string): Array<{ offset: number; folded: string }> {
  const folded: Array<{ offset: number; folded: string }> = [];
  let offset = 0;
  for (const char of haystack) {
    folded.push({ offset, folded: normalise(char) });
    offset += char.length;
  }
  return folded;
}

/**
 * Every match of an already-folded needle in one string, in order and
 * non-overlapping, with offsets into the original string.
 *
 * The scan walks the haystack by code point, so an offset never lands inside a
 * surrogate pair, and it consumes the needle piece by piece, so folding may
 * change lengths without breaking the offsets. A match then absorbs any
 * combining marks that follow it, because those render as part of the letter
 * they attach to.
 */
function findFolded(haystack: string, needle: string): Range[] {
  if (needle.length === 0 || haystack.length === 0) return [];

  const folded = foldWithOffsets(haystack);
  const matches: Range[] = [];

  for (let i = 0; i < folded.length; i += 1) {
    if (folded[i].folded.length === 0) continue;

    let consumed = 0;
    let j = i;
    while (j < folded.length && consumed < needle.length) {
      const piece = folded[j].folded;
      if (piece.length > 0) {
        if (!needle.startsWith(piece, consumed)) break;
        consumed += piece.length;
      }
      j += 1;
    }
    if (consumed !== needle.length) continue;

    let end = j;
    while (end < folded.length && folded[end].folded.length === 0) end += 1;
    matches.push({
      start: folded[i].offset,
      end: end < folded.length ? folded[end].offset : haystack.length,
    });
    // Non-overlapping and in order, which the counter and the prev/next walk
    // both assume: `aaaa` holds one `aa`, not three.
    i = end - 1;
  }

  return matches;
}

/**
 * Every place `query` appears in `haystack`, case- and accent-insensitively.
 * Ranges index `haystack` itself. A blank query matches nothing.
 */
export function findMatches(haystack: string, query: string): Range[] {
  return findFolded(haystack, normalise(query).trim());
}

/**
 * The key identifying one run within a message body: its block index, and its
 * list-item index for a list. `FormattedText` builds the same key while it
 * draws, which is how a range finds the run it belongs to.
 */
export function runKey(blockIndex: number, itemIndex: number): string {
  return `${blockIndex}:${itemIndex}`;
}

/**
 * The text runs of a message body, exactly as `FormattedText` renders them: one
 * per paragraph, quote or fenced block, and one per list item. Markers are
 * already gone, which is the point: a match must index the characters the
 * reader sees.
 */
export function bodyRuns(text: string): Array<{ key: string; text: string }> {
  const runs: Array<{ key: string; text: string }> = [];

  formatText(text).blocks.forEach((block, blockIndex) => {
    if (block.kind === 'code') {
      runs.push({ key: runKey(blockIndex, -1), text: block.value });
      return;
    }
    if (block.kind === 'list') {
      block.items.forEach((item, itemIndex) => {
        runs.push({ key: runKey(blockIndex, itemIndex), text: item.map((t) => t.value).join('') });
      });
      return;
    }
    runs.push({
      key: runKey(blockIndex, -1),
      text: block.tokens.map((token) => token.value).join(''),
    });
  });

  return runs;
}

/** `IMG-…jpg` and friends are filenames, not text the reader can search. */
function isSearchable(message: Message): boolean {
  return message.senderId !== null && message.kind !== 'system';
}

/** The body string a message is searched through, or null when it has none. */
export function messageBody(message: Message): string | null {
  if (message.kind === 'text') return message.text;
  if (message.kind === 'media') return message.caption ?? null;
  return null;
}

/**
 * The cheap gate before tokenizing: could this raw body hold the needle at all?
 *
 * Both the raw text and its marker-free variant are tested. The marker-free
 * variant over-removes (an unpaired `*` is real text), which only ever costs a
 * useless tokenization; it cannot lose a match, because deleting characters
 * from a string leaves every substring it had contiguous.
 */
function mightMatch(raw: string, needle: string): boolean {
  const folded = normalise(raw);
  if (folded.includes(needle)) return true;
  return folded.replace(/[*_~`]/g, '').includes(needle);
}

/**
 * One message's body highlights: the runs to split, and the flat matches.
 *
 * The cheap gate runs first, because tokenizing costs about twenty times what
 * folding and a substring test do. On a 100k-message chat that is the difference
 * between a query that feels instant and one that stalls a frame (PRD §9).
 */
function bodySearch(
  message: Message,
  body: string,
  needle: string,
): { field: SearchField; runs: Map<string, RunRanges>; matches: SearchMatch[] } | null {
  if (!mightMatch(body, needle)) return null;

  const runs = new Map<string, RunRanges>();
  const matches: SearchMatch[] = [];
  for (const run of bodyRuns(body)) {
    const ranges = findFolded(run.text, needle);
    if (ranges.length === 0) continue;
    runs.set(run.key, { text: run.text, ranges });
    const { blockIndex, itemIndex } = parseRunKey(run.key);
    const field: SearchField = message.kind === 'media' ? 'caption' : 'text';
    for (const range of ranges) {
      matches.push({
        messageId: message.id,
        messageIndex: -1,
        field,
        blockIndex,
        itemIndex,
        start: range.start,
        end: range.end,
      });
    }
  }
  if (runs.size === 0) return null;

  return { field: message.kind === 'media' ? 'caption' : 'text', runs, matches };
}

/** Read back the block and item indices a run key encodes. */
export function parseRunKey(key: string): { blockIndex: number; itemIndex: number } {
  const [block, item] = key.split(':');
  return { blockIndex: Number(block), itemIndex: Number(item) };
}

/** Every match in one message, in reading order: body first, then the name. */
export function matchesInMessage(chat: Chat, message: Message, query: string): SearchMatch[] {
  return messageMatches(chat, message, normalise(query).trim(), -1).matches;
}

/**
 * One message's matches, grouped as the renderer and the panel need them.
 * `needle` is the folded query; `messageIndex` is filled in by `searchChat`.
 */
function messageMatches(
  chat: Chat,
  message: Message,
  needle: string,
  messageIndex: number,
): MessageSearch {
  const empty: MessageSearch = { messageIndex, body: null, name: null, sender: null, matches: [] };
  if (!isSearchable(message)) return empty;

  const matches: SearchMatch[] = [];
  let body: MessageSearch['body'] = null;
  const bodyText = messageBody(message);
  if (bodyText !== null) {
    const found = bodySearch(message, bodyText, needle);
    if (found !== null) {
      body = { text: bodyText, field: found.field, runs: found.runs };
      for (const match of found.matches) matches.push({ ...match, messageIndex });
    }
  }

  // A deleted row draws chrome ("You deleted this message"), not the reader's
  // text, so a name match there would light up a row whose content the reader
  // did not write.
  const name = message.kind === 'deleted' ? null : senderName(chat, message);
  const sender = name === null ? [] : findFolded(name, needle);
  for (const range of sender) {
    matches.push({
      messageId: message.id,
      messageIndex,
      field: 'sender',
      start: range.start,
      end: range.end,
    });
  }

  return {
    messageIndex,
    body,
    name,
    sender: sender.length > 0 ? sender : null,
    matches,
  };
}

/** The sender's display name for a message, or null when the chat has none. */
function senderName(chat: Chat, message: Message): string | null {
  if (message.senderId === null) return null;
  return chat.participants.find((entry) => entry.id === message.senderId)?.displayName ?? null;
}

/**
 * The entire search for one query: every match, plus the per-message groups the
 * list and the panel render from. One pass, run once per query change and never
 * per scroll frame.
 */
export function searchChat(chat: Chat, query: string): SearchResults {
  const needle = normalise(query).trim();
  const results: SearchResults = {
    needle,
    matches: [],
    messages: [],
    byMessage: new Map(),
  };
  if (needle.length === 0) return results;

  for (let index = 0; index < chat.messages.length; index += 1) {
    const group = messageMatches(chat, chat.messages[index], needle, index);
    if (group.matches.length === 0) continue;
    // Body matches are pushed in run order already, so the group is in reading
    // order; the flat list stays in message order by construction.
    results.messages.push(group);
    results.byMessage.set(index, group);
    results.matches.push(...group.matches);
  }

  return results;
}

/** The ranges of one run, for a renderer that walked to the same key. */
export function rangesAt(runs: Map<string, RunRanges> | undefined, key: string): Range[] | null {
  return runs?.get(key)?.ranges ?? null;
}

/**
 * A window of text around one match, cut on word-ish boundaries and with the
 * match returned separately so a caller can render it in bold without ever
 * assembling markup.
 */
export function snippetAround(
  text: string,
  range: Range,
  radius = 48,
): { before: string; hit: string; after: string; leading: boolean; trailing: boolean } {
  const start = Math.max(0, range.start - radius);
  const end = Math.min(text.length, range.end + radius);
  const leading = start > 0;
  const trailing = end < text.length;

  return {
    before: (leading ? '…' : '') + text.slice(start, range.start),
    hit: text.slice(range.start, range.end),
    after: text.slice(range.end, end) + (trailing ? '…' : ''),
    leading,
    trailing,
  };
}
