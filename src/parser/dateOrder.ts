/**
 * Date-order detection (backlog E2-3; PRD F-PAR-3).
 *
 * WhatsApp writes the date with the phone's locale order and no indication of
 * which number is the day. We infer it from the data: a first part over 12 can
 * only be a day (so DMY), a second part over 12 can only be a day (so MDY). If
 * every header in the file could be read either way, we cannot decide and
 * return a `DateOrderChoice` for the import flow to ask the user (E3-3), with
 * sample lines rendered under each interpretation.
 */

import type { DateOrder, DateOrderChoice } from '../types/chat.ts';
import { parseLine, type HeaderLine, type RawTimestamp } from './header.ts';
import { splitLines } from './text.ts';

export type DateOrderResult = { order: DateOrder } | DateOrderChoice;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Render a raw timestamp's date under one interpretation, e.g. "3 Jun 2026". */
function previewDate(ts: RawTimestamp, order: DateOrder): string {
  const day = order === 'DMY' ? ts.first : ts.second;
  const month = order === 'DMY' ? ts.second : ts.first;
  const monthName = MONTH_NAMES[month - 1] ?? String(month);
  return `${day} ${monthName} ${ts.year}`;
}

/**
 * Pick up to two ambiguous headers for the user prompt, preferring ones where
 * the two parts differ so the two readings are visibly distinct.
 */
function pickSamples(headers: HeaderLine[]): DateOrderChoice['samples'] {
  const distinct = headers.filter((h) => h.timestamp.first !== h.timestamp.second);
  const chosen = (distinct.length > 0 ? distinct : headers).slice(0, 2);
  return chosen.map((h) => ({
    raw: h.raw,
    asDMY: previewDate(h.timestamp, 'DMY'),
    asMDY: previewDate(h.timestamp, 'MDY'),
  }));
}

/**
 * Detect the date order across all header lines. The first unambiguous header
 * decides the whole file; conflicting evidence (some headers say DMY, others
 * MDY) is impossible for a single export, so the first signal wins. When no
 * header is decisive, return a choice for the user.
 */
export function detectDateOrder(text: string): DateOrderResult {
  const headers: HeaderLine[] = [];

  for (const line of splitLines(text)) {
    const parsed = parseLine(line);
    if (parsed.type !== 'header') {
      continue;
    }
    headers.push(parsed);

    const { first, second } = parsed.timestamp;
    if (first > 12) {
      return { order: 'DMY' };
    }
    if (second > 12) {
      return { order: 'MDY' };
    }
  }

  return { needsUserChoice: true, samples: pickSamples(headers) };
}
