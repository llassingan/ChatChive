/**
 * Jump-to-date model (backlog E7-2; PRD F-NAV-3).
 *
 * Everything here is a function of its arguments: no DOM, no React, no state.
 * `JumpToDate` renders what these helpers return and `MessageList` scrolls to
 * the row index they produce, so the calendar rules (which days exist, what a
 * month grid looks like, what a day key means in row space) are unit-testable
 * without a browser.
 *
 * # Why the days are derived from every message
 *
 * The calendar marks a day as enabled when the chat has a message on it, and
 * "a message" is read the same way `layout.ts` reads it when it decides where to
 * insert a separator: any message, including a system notice. `search.ts` skips
 * notices, but that is a different question — it asks what the reader wrote, so
 * that typing a word never matches export furniture. A date separator is drawn
 * for the 2026-06-02 encryption notice in the fixture export, so that day is
 * visible in the list; a calendar that greyed it out would be telling the reader
 * a day they can see does not exist.
 *
 * # Time zone
 *
 * Days are wall-clock days in the viewer's zone, exactly as `format.ts`'s
 * `dayKey` defines them: an export has no zone of its own, so the phone's local
 * reading is what the app shows everywhere else. The grid is therefore built
 * from local `Date` fields, never from a parsed ISO string (which would be UTC
 * and could land on the neighbouring day).
 */

import type { Chat } from '../../types/chat.ts';
import { dayKey } from '../format.ts';

/**
 * Day of the week the grid's first column holds: 0 is Sunday, matching
 * `Date.prototype.getDay()`. Fixed rather than locale-derived on purpose — the
 * month grid is a 42-cell model whose columns have to line up with a fixed
 * header row, and no rule in the brief asks for a locale-defined week start.
 */
export const WEEK_START = 0;

const DAYS_IN_WEEK = 7;
/** Six rows, always: see `monthGrid` for why the grid does not shrink. */
const GRID_ROWS = 6;

/** Exact month/year calendar math, so no cell is ever a day that does not exist. */
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
/** The reader's bare day number, in their own numbering system. */
const DAY_NUMBER = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
/** One column header of the grid, e.g. "Sat". */
const WEEKDAY_SHORT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
/** The accessible name of a day cell: full date, without the year. */
const DAY_LONG = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/** One day cell of the month grid. */
export interface CalendarCell {
  /**
   * `format.ts`'s dayKey (`2026-06-27`) — the same key `messageDays` holds, so a
   * cell and the set are compared by value, never by timestamp arithmetic.
   */
  key: string;
  /**
   * The day of the month, as a string in the reader's own numbering. A string,
   * not a number, because `Intl` can render a non-Latin numbering system and
   * `String(day)` would silently disagree with the rest of the app's dates.
   */
  day: string;
  /** False for the leading/trailing days that pad the grid to whole weeks. */
  inMonth: boolean;
  /** The chat has at least one message on this day (E7-2: the enabled days). */
  hasMessages: boolean;
  /** This day is `now`'s day, in the same wall-clock zone the keys use. */
  isToday: boolean;
  /**
   * Accessible name for the cell's button: "Saturday, June 27", or
   * "Today, Saturday, June 27" for today. Built here rather than in the
   * component so it stays unit-testable and so it cannot accidentally pick a
   * different zone from the key it is naming.
   */
  label: string;
}

/** Which calendar days the chat has messages on, as a `Set` of `dayKey`s. */
export function messageDays(chat: Chat): Set<string> {
  const days = new Set<string>();
  for (const message of chat.messages) days.add(dayKey(message.timestamp));
  return days;
}

/**
 * The row index of each day's **first message row**, keyed by `dayKey`.
 *
 * A day's separator is the row before it, so a jump that lands on the separator
 * would leave the reader looking at a date rather than at the day's first
 * message; the row named here is the one right after it.
 *
 * Empty messages carry the timestamp of the line that produced them, so they
 * count like any other message, and the first message of a sorted list is the
 * earliest one — which is the row the calendar promises to reach.
 */
export function firstMessageRowByDay(chat: Chat): Map<string, number> {
  const rowByDay = new Map<string, number>();
  const { messages } = chat;
  // Where the next row lands. `buildRows` inserts one separator before the first
  // message of each day and one row per message, so this cursor tracks the same
  // count without building the rows.
  let row = 0;

  for (let index = 0; index < messages.length; index += 1) {
    const key = dayKey(messages[index].timestamp);
    if (!rowByDay.has(key)) {
      row += 1; // the day separator this day's first message follows
      rowByDay.set(key, row);
    }
    row += 1; // the message row itself
  }

  return rowByDay;
}

/**
 * The month grid as `weeks x 7` cells, six rows deep.
 *
 * Six rows always: a five-row grid makes the dialog change height as the reader
 * pages through months, which moves the navigation buttons out from under the
 * pointer between two clicks. The cost is the trailing days of the following
 * month, which render as the same dimmed cells the leading ones do. The grid
 * runs Sunday to Saturday (see `WEEK_START`).
 *
 * `now` is injectable so "today" is a fact of the argument rather than of the
 * clock the tests happen to run under, matching `formatDayLabel(timestamp, now)`
 * and `buildRows(chat, now)`.
 */
export function monthGrid(
  year: number,
  month: number,
  days: ReadonlySet<string>,
  now: number = Date.now(),
): CalendarCell[][] {
  const first = new Date(year, month, 1);
  const todayKey = dayKey(now);
  // Which column the month's 1st lands in, so it sits under its own weekday
  // header. The inner `+ DAYS_IN_WEEK) % DAYS_IN_WEEK` keeps the result
  // non-negative if `WEEK_START` ever moves past the 1st's own weekday.
  const lead = (first.getDay() - WEEK_START + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const weeks: CalendarCell[][] = [];

  for (let week = 0; week < GRID_ROWS; week += 1) {
    const row: CalendarCell[] = [];
    for (let weekday = 0; weekday < DAYS_IN_WEEK; weekday += 1) {
      // The cell is built from its own fields, so a `Date` normalising
      // 2026-06-31 into 2026-07-01 is not a correction but the definition of the
      // grid: every cell really is the calendar day it names, in every month and
      // every year, including the padded weeks at either end.
      const date = new Date(year, month, 1 + (week * DAYS_IN_WEEK + weekday - lead));
      const key = dayKey(date.getTime());
      const inMonth = date.getMonth() === month && date.getFullYear() === year;
      const isToday = key === todayKey;
      const label = DAY_LONG.format(date);
      row.push({
        key,
        day: DAY_NUMBER.format(date),
        inMonth,
        hasMessages: days.has(key),
        isToday,
        label: isToday ? `Today, ${label}` : label,
      });
    }
    weeks.push(row);
  }

  return weeks;
}

/** The month heading, e.g. "June 2026", in the reader's locale. */
export function monthTitle(year: number, month: number): string {
  return MONTH_LABEL.format(new Date(year, month, 1));
}

/** The seven column headers, starting at `WEEK_START`. */
export function weekdayShortNames(): string[] {
  // The columns are fixed, so the headers are named from one known week:
  // 2026-02-01 is a Sunday, which is the grid's first column.
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    WEEKDAY_SHORT.format(new Date(2026, 1, 1 + index)),
  );
}

/** Step a year/month pair by whole months, normalising the year rollover. */
export function addMonths(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + month + delta;
  return [Math.floor(total / 12), ((total % 12) + 12) % 12];
}

/**
 * Which day the calendar should put its focus on when it opens (or when a month
 * with no messages is paged past): today when today's month is on screen, else
 * that month's first day with a message, else its 1st.
 *
 * Returning a key rather than a row/column pair keeps the caller's focus
 * handling to one string, and the grid lookup is a scan of 42 cells.
 */
export function initialFocusDay(cells: CalendarCell[][], now: number = Date.now()): string {
  const flat = cells.flat();
  const todayKey = dayKey(now);
  const today = flat.find((cell) => cell.key === todayKey && cell.inMonth);
  if (today) return today.key;

  const firstWithMessages = flat.find((cell) => cell.inMonth && cell.hasMessages);
  if (firstWithMessages) return firstWithMessages.key;

  return flat.find((cell) => cell.inMonth)?.key ?? flat[0].key;
}
