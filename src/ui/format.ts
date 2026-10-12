/**
 * Formatting helpers for the summary panel. Timestamps from an export are epoch
 * milliseconds read as the phone's local wall-clock (the contract in
 * `src/types/chat.ts`), so we render them in the viewer's locale, which is the
 * closest honest reading we can offer.
 */
import type { ChatMeta } from '../types/chat.ts';

const DATE_LONG = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const DATE_SHORT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Time of day in a fixed 24h shape, so the sample line never varies by locale. */
export const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "12 March 2026" for a single day, or "12 Mar 2026 to 4 July 2026" for a span. */
export function formatDateRange(meta: ChatMeta): string {
  const first = new Date(meta.firstTimestamp);
  const last = new Date(meta.lastTimestamp);
  const oneDay =
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth() &&
    first.getDate() === last.getDate();

  if (oneDay) return DATE_LONG.format(first);
  return `${DATE_SHORT.format(first)} to ${DATE_SHORT.format(last)}`;
}
