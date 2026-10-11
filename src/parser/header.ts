/**
 * Line header parser (backlog E2-2; PRD F-PAR-1, F-PAR-2, F-PAR-4, F-PAR-10).
 *
 * A WhatsApp export is a flat list of lines. Some lines start with a timestamp
 * header; the rest continue the previous message (multi-line text and media
 * captions). This module recognizes headers and extracts their raw parts
 * WITHOUT committing to a date order — MDY vs DMY is decided separately
 * (E2-3) across the whole file, then applied here via `toEpochMs`.
 *
 * Two header shapes are supported:
 *   Android  `6/2/26, 21:36 - Sender: body`   (` - ` separator, `:` in time)
 *   iOS      `[6/2/26, 21:36:05] Sender: body` (bracketed, `.` or `:` in time)
 *
 * Nothing here throws. A line that does not match a header is reported as a
 * continuation so the caller can append it to the previous message (F-PAR-10).
 */

import type { ClockStyle } from '../types/chat.ts';
import { stripInvisible } from './text.ts';

/** The platform a header was recognized as. */
export type HeaderPlatform = 'android' | 'ios';

/**
 * The raw, order-agnostic parts of a timestamp. `first`/`second` are the two
 * leading date numbers whose meaning (month vs day) depends on the detected
 * date order; `year` is normalized to a 4-digit value.
 */
export interface RawTimestamp {
  first: number;
  second: number;
  year: number;
  hour: number;
  minute: number;
  second_: number;
  clockStyle: ClockStyle;
  /** Present only for 12h clocks; drives the hour conversion in `toEpochMs`. */
  meridiem?: 'am' | 'pm';
}

/** A line recognized as a message header. */
export interface HeaderLine {
  type: 'header';
  platform: HeaderPlatform;
  timestamp: RawTimestamp;
  /** Null when the header has no `Sender:` prefix, i.e. a system line. */
  sender: string | null;
  /** Text after the sender (or after the header, for system lines). */
  body: string;
  /** The original line with invisible characters stripped. */
  raw: string;
}

/** A line that is not a header; it continues the previous message. */
export interface ContinuationLine {
  type: 'continuation';
  text: string;
}

export type ParsedLine = HeaderLine | ContinuationLine;

const ANDROID_HEADER =
  /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s?([AaPp])\.?[Mm]\.?)?\s-\s(.*)$/;

const IOS_HEADER =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s?([AaPp])\.?[Mm]\.?)?\]\s?(.*)$/;

/**
 * Splits `Sender: body` off a header's trailing text. The space after the
 * colon is optional so an empty-body message (`Sender:` at end of line, after
 * trailing-space trimming) is still read as a sender, not a system line.
 */
const SENDER_SPLIT = /^([^:]+?):(?:\s(.*))?$/s;

function normalizeYear(raw: string): number {
  const value = Number(raw);
  if (raw.length <= 2) {
    return 2000 + value;
  }
  return value;
}

function buildTimestamp(match: RegExpMatchArray): RawTimestamp {
  const [, first, second, year, hour, minute, seconds, meridiemLetter] = match;
  const hasMeridiem = meridiemLetter !== undefined;
  const timestamp: RawTimestamp = {
    first: Number(first),
    second: Number(second),
    year: normalizeYear(year),
    hour: Number(hour),
    minute: Number(minute),
    second_: seconds !== undefined ? Number(seconds) : 0,
    clockStyle: hasMeridiem ? '12h' : '24h',
  };
  if (hasMeridiem) {
    timestamp.meridiem = meridiemLetter.toLowerCase() === 'a' ? 'am' : 'pm';
  }
  return timestamp;
}

/**
 * A header's trailing text is either `Sender: body` (a normal message) or a
 * bare notice with no sender (a system line, F-PAR, E2-2). The sender match is
 * kept narrow (no colon in the name) so URLs and `12:00` style bodies in a
 * system notice are not mistaken for a sender.
 */
function splitSender(rest: string): { sender: string | null; body: string } {
  const match = rest.match(SENDER_SPLIT);
  if (match) {
    return { sender: match[1], body: match[2] ?? '' };
  }
  return { sender: null, body: rest };
}

/**
 * Classify one raw line. Returns a header with order-agnostic parts, or a
 * continuation to append to the previous message. Never throws (F-PAR-10).
 */
export function parseLine(rawLine: string): ParsedLine {
  const line = stripInvisible(rawLine);

  const ios = line.match(IOS_HEADER);
  if (ios) {
    const { sender, body } = splitSender(ios[8]);
    return {
      type: 'header',
      platform: 'ios',
      timestamp: buildTimestamp(ios),
      sender,
      body,
      raw: line,
    };
  }

  const android = line.match(ANDROID_HEADER);
  if (android) {
    const { sender, body } = splitSender(android[8]);
    return {
      type: 'header',
      platform: 'android',
      timestamp: buildTimestamp(android),
      sender,
      body,
      raw: line,
    };
  }

  return { type: 'continuation', text: line };
}

/**
 * Resolve a raw timestamp to epoch milliseconds once the date order is known.
 * Exports carry no timezone, so the parts are read as the viewer's local time
 * — the same convention WhatsApp uses when it writes the export. A 12h hour of
 * 12 maps to 0 for AM and stays 12 for PM.
 */
export function toEpochMs(ts: RawTimestamp, dateOrder: 'DMY' | 'MDY'): number {
  const day = dateOrder === 'DMY' ? ts.first : ts.second;
  const month = dateOrder === 'DMY' ? ts.second : ts.first;

  let hour = ts.hour;
  if (ts.meridiem === 'am' && hour === 12) {
    hour = 0;
  } else if (ts.meridiem === 'pm' && hour !== 12) {
    hour += 12;
  }

  return new Date(ts.year, month - 1, day, hour, ts.minute, ts.second_, 0).getTime();
}
