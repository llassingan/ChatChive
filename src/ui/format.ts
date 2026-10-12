/**
 * Formatting helpers for the chat view and the summary panel. Timestamps from
 * an export are epoch milliseconds read as the phone's local wall-clock (the
 * contract in `src/types/chat.ts`), so we render them in the viewer's locale,
 * which is the closest honest reading we can offer.
 */
import type { ChatMeta, ClockStyle } from '../types/chat.ts';

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
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

/** Time of day in a fixed 24h shape, so the sample line never varies by locale. */
export const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Bubble and date-pill clocks mirror the export's own style (F-VIEW-2): a phone
 * set to 24h wrote `21:36`, so the viewer shows that too rather than imposing
 * the viewer's locale. `hour12` here only picks between two fixed shapes.
 */
const CLOCK_24H = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const CLOCK_12H = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Time of day for a bubble, in the export's clock style. */
export function formatClock(timestamp: number, style: ClockStyle): string {
  return style === '12h' ? CLOCK_12H.format(timestamp) : CLOCK_24H.format(timestamp);
}

/** Local calendar day as a comparable key (`2026-06-02`), ignoring the time. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whole days between two timestamps' local dates, so DST does not skew it. */
function daysApart(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Date-separator label (F-VIEW-3): Today, Yesterday, the weekday within the last
 * week, then the full date. `now` is injectable so tests do not depend on the
 * day they run.
 */
export function formatDayLabel(timestamp: number, now = Date.now()): string {
  const apart = daysApart(timestamp, now);
  if (apart === 0) return 'Today';
  if (apart === 1) return 'Yesterday';
  if (apart > 1 && apart < 7) return WEEKDAY.format(timestamp);
  return DATE_LONG.format(timestamp);
}

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

/** Bytes as a short human size, for the media placeholder and chat info. */
export function formatBytes(bytes: number | undefined): string | null {
  if (bytes === undefined || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
