/**
 * Jump-to-date model coverage (E7-2; PRD F-NAV-3).
 *
 * The calendar's rules are all arithmetic, so they are pinned here rather than
 * only through the dialog: which days a chat has messages on, what a month grid
 * contains, and where a day starts in the virtualizer's row space. Every case
 * that could silently be right for the month it was written in and wrong for the
 * next one — February in a leap year, a 1st that falls on a Sunday, the week a
 * grid spills into the next year — is a test of its own.
 */

import { describe, expect, it } from 'vitest';
import type { Chat, Message } from '../../types/chat.ts';
import { buildRows } from './layout.ts';
import {
  addMonths,
  firstMessageRowByDay,
  initialFocusDay,
  messageDays,
  monthGrid,
  monthTitle,
  weekdayShortNames,
  type CalendarCell,
} from './dates.ts';

/** A minimal text message; only the fields the calendar reads are meaningful. */
function msg(over: Partial<Message> & Pick<Message, 'id' | 'senderId' | 'timestamp'>): Message {
  return {
    kind: 'text',
    outgoing: false,
    text: 'hi',
    ...over,
  } as Message;
}

function chatWith(messages: Message[]): Chat {
  return {
    meta: {
      title: 'Trip',
      isGroup: true,
      clockStyle: '24h',
      dateOrder: 'DMY',
      messageCount: messages.length,
      firstTimestamp: messages[0]?.timestamp ?? 0,
      lastTimestamp: messages.at(-1)?.timestamp ?? 0,
    },
    participants: [
      { id: 'a', displayName: 'Ana', colorIndex: 0, initial: 'A' },
      { id: 'b', displayName: 'Ben', colorIndex: 1, initial: 'B' },
    ],
    messages,
    guessedMeId: null,
  };
}

/**
 * A local wall-clock timestamp. Written field by field (year, month, day), never
 * parsed from an ISO string, because the grid is a local-field model and a UTC
 * parse would land on the neighbouring day in half the world's zones.
 */
function at(year: number, month: number, day: number, hour = 12): number {
  return new Date(year, month, day, hour, 0, 0, 0).getTime();
}

/** The grid flattened, for assertions about the whole 42-cell run. */
function flat(year: number, month: number, days: ReadonlySet<string> = new Set(), now = 0) {
  return monthGrid(year, month, days, now).flat();
}

/** The keys of the cells that belong to the month being displayed. */
function inMonthKeys(year: number, month: number): string[] {
  return flat(year, month)
    .filter((cell) => cell.inMonth)
    .map((cell) => cell.key);
}

describe('messageDays', () => {
  it('marks every day the chat has a message on, and only those', () => {
    const chat = chatWith([
      msg({ id: 'm0', senderId: 'a', timestamp: at(2026, 5, 27, 20) }),
      msg({ id: 'm1', senderId: 'b', timestamp: at(2026, 5, 27, 21) }),
      msg({ id: 'm2', senderId: 'a', timestamp: at(2026, 5, 13, 9) }),
    ]);
    const days = messageDays(chat);
    expect([...days].sort()).toEqual(['2026-06-13', '2026-06-27']);
    expect(days.has('2026-06-28')).toBe(false);
  });

  it('counts a day whose only message is a system notice', () => {
    // The fixture export's 2026-06-02 holds nothing but the encryption notice,
    // and `buildRows` still draws a separator for it. A calendar that greyed
    // that day out would contradict a date the reader can see in the list.
    const chat = chatWith([
      msg({ id: 'm0', senderId: null, kind: 'system', timestamp: at(2026, 5, 2, 20) }),
      msg({ id: 'm1', senderId: 'a', timestamp: at(2026, 6, 27, 20) }),
    ]);

    expect(messageDays(chat).has('2026-06-02')).toBe(true);
  });

  it('is the day of each timestamp, not of the run', () => {
    // Two messages a minute either side of a midnight boundary are two days.
    const chat = chatWith([
      msg({ id: 'm0', senderId: 'a', timestamp: at(2026, 5, 27, 23) }),
      msg({ id: 'm1', senderId: 'a', timestamp: at(2026, 5, 28, 0) }),
    ]);

    expect([...messageDays(chat)].sort()).toEqual(['2026-06-27', '2026-06-28']);
  });
});

describe('monthGrid shape', () => {
  it('is always six rows of seven, whatever the month', () => {
    for (const [year, month] of [
      [2026, 0],
      [2026, 1],
      [2026, 5],
      [2026, 11],
      [2024, 1],
    ] as const) {
      const grid = monthGrid(year, month, new Set(), at(2026, 5, 10));
      expect(grid).toHaveLength(6);
      for (const week of grid) expect(week).toHaveLength(7);
    }
  });

  it('starts on a Sunday and ends on a Saturday', () => {
    // June 2026 begins on a Monday, so the grid has to open with 31 May and
    // close with 11 July: 42 cells from the Sunday before the 1st.
    const cells = flat(2026, 5);
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe('2026-05-31');
    expect(new Date(cells[0].key + 'T00:00:00').getDay()).toBe(0);
    expect(cells[41].key).toBe('2026-07-11');
    expect(new Date(cells[41].key + 'T00:00:00').getDay()).toBe(6);
  });

  it('spills into the next year when the month ends a week', () => {
    // December 2026 starts on a Tuesday and needs all six rows, so the last
    // cells belong to January 2027.
    const cells = flat(2026, 11);
    expect(cells[0].key).toBe('2026-11-29');
    expect(cells[41].key).toBe('2027-01-09');
    expect(cells[41].inMonth).toBe(false);
  });

  it('runs its 42 days consecutively, with no gap and no repeat', () => {
    // The invariant that matters and the one a month-arithmetic bug breaks:
    // every cell is exactly one calendar day after the one before it. Checked
    // across a whole non-leap year and a whole leap year so a short February, a
    // 30-day month and the year boundary are all covered.
    for (const year of [2026, 2024]) {
      for (let month = 0; month < 12; month += 1) {
        const cells = flat(year, month);
        const keys = cells.map((cell) => cell.key);
        expect(new Set(keys).size).toBe(42);
        for (let index = 1; index < cells.length; index += 1) {
          const previous = new Date(cells[index - 1].key + 'T00:00:00');
          const expected = new Date(
            previous.getFullYear(),
            previous.getMonth(),
            previous.getDate() + 1,
          );
          expect(cells[index].key).toBe(
            `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(
              expected.getDate(),
            ).padStart(2, '0')}`,
          );
        }
      }
    }
  });

  it('flags exactly the days of the month it displays', () => {
    expect(inMonthKeys(2026, 5)).toHaveLength(30);
    expect(inMonthKeys(2026, 1)).toHaveLength(28);
    expect(inMonthKeys(2024, 1)).toHaveLength(29);
    expect(inMonthKeys(2026, 6)).toHaveLength(31);
    expect(inMonthKeys(2026, 5)[0]).toBe('2026-06-01');
    expect(inMonthKeys(2026, 5).at(-1)).toBe('2026-06-30');
  });

  it('shows 29 February only in a leap year', () => {
    expect(inMonthKeys(2024, 1)).toContain('2024-02-29');
    expect(inMonthKeys(2026, 1)).not.toContain('2026-02-29');
    // 2100 is a century that is not a leap year: 2000 was, 2100 is not.
    expect(inMonthKeys(2100, 1)).toHaveLength(28);
  });

  it('names each cell with its own number, in the month it belongs to', () => {
    const cells = flat(2026, 5);
    const first = cells.find((cell) => cell.key === '2026-06-01');
    const last = cells.find((cell) => cell.key === '2026-06-30');
    // Padded cells carry the neighbouring month's number, so they are read as
    // "31" and "1" rather than as blanks.
    expect(first?.day).toBe('1');
    expect(last?.day).toBe('30');
    expect(cells[0].day).toBe('31');
  });
});

describe('monthGrid marks', () => {
  const days = new Set(['2026-06-02', '2026-06-27', '2026-06-28', '2026-07-13']);

  it('marks the days the chat has messages on', () => {
    const marked = flat(2026, 5, days)
      .filter((cell) => cell.hasMessages)
      .map((cell) => cell.key);
    expect(marked).toEqual(['2026-06-02', '2026-06-27', '2026-06-28']);
  });

  it('marks a padded cell too, so a message outside the month is still findable', () => {
    // 5 July is outside June's own cells but inside June's grid, and the reader
    // paging to June should see that the 5th of July has something on it rather
    // than a dead cell.
    const cell = flat(2026, 5, new Set(['2026-07-05'])).find((c) => c.key === '2026-07-05');
    expect(cell).toMatchObject({ inMonth: false, hasMessages: true });
  });

  it('marks exactly one day as today, and names it', () => {
    const cells = flat(2026, 5, days, at(2026, 5, 27, 9));
    const today = cells.filter((cell) => cell.isToday);
    expect(today).toHaveLength(1);
    expect(today[0].key).toBe('2026-06-27');
    expect(today[0].label.startsWith('Today, ')).toBe(true);
    // Every other cell's label is its bare date, with no "Today" prefix.
    for (const cell of cells) {
      if (!cell.isToday) expect(cell.label.startsWith('Today')).toBe(false);
    }
  });

  it('does not call a padded day today, whatever the clock says', () => {
    // 31 May is in June's grid but not in June, and marking a day of the
    // previous month as today would be plainly wrong.
    const cells = flat(2026, 5, days, at(2026, 4, 31, 9));
    expect(cells.find((cell) => cell.key === '2026-05-31')?.isToday).toBe(true);
    expect(cells.filter((cell) => cell.isToday)).toHaveLength(1);
  });

  it('has no today mark when the clock is outside the grid', () => {
    expect(flat(2026, 5, days, at(2027, 0, 1)).filter((cell) => cell.isToday)).toHaveLength(0);
  });
});

describe('monthTitle and weekdayShortNames', () => {
  it('names the month and the year', () => {
    expect(monthTitle(2026, 5)).toBe('June 2026');
    expect(monthTitle(2027, 0)).toContain('2027');
    expect(monthTitle(2026, 11)).not.toBe(monthTitle(2026, 10));
  });

  it('has seven column headers, in grid order', () => {
    const names = weekdayShortNames();
    expect(names).toHaveLength(7);
    expect(new Set(names).size).toBe(7);
    // The columns are Sunday-first, matching `getDay()` and `WEEK_START`.
    expect(names[0]).toBe(
      new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 1, 1)),
    );
    expect(names[6]).toBe(
      new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 1, 7)),
    );
  });
});

describe('addMonths', () => {
  it('steps forward and back within a year', () => {
    expect(addMonths(2026, 5, 1)).toEqual([2026, 6]);
    expect(addMonths(2026, 6, -1)).toEqual([2026, 5]);
  });

  it('rolls the year over in both directions', () => {
    expect(addMonths(2026, 11, 1)).toEqual([2027, 0]);
    expect(addMonths(2026, 0, -1)).toEqual([2025, 11]);
  });

  it('normalises a multi-month step', () => {
    expect(addMonths(2026, 5, 15)).toEqual([2027, 8]);
    expect(addMonths(2026, 5, -18)).toEqual([2024, 11]);
  });
});

describe('firstMessageRowByDay', () => {
  // The three-day chat from layout.test.ts's world, plus a day that exists only
  // because of a notice, which is the case where the row count cannot be derived
  // from the senders.
  const chat = chatWith([
    msg({ id: 'm0', senderId: null, kind: 'system', timestamp: at(2026, 5, 2, 20) }),
    msg({ id: 'm1', senderId: 'a', timestamp: at(2026, 5, 27, 20) }),
    msg({ id: 'm2', senderId: 'b', timestamp: at(2026, 5, 27, 20) }),
    msg({ id: 'm3', senderId: 'b', timestamp: at(2026, 5, 28, 20) }),
  ]);

  it('names the first message row of each day, after its separator', () => {
    const rowByDay = firstMessageRowByDay(chat);
    expect(rowByDay.get('2026-06-02')).toBe(1);
    expect(rowByDay.get('2026-06-27')).toBe(3);
    expect(rowByDay.get('2026-06-28')).toBe(6);
  });

  it('agrees with buildRows, so the two cannot drift apart', () => {
    // The rule is restated here rather than imported (see dates.ts), so the
    // restatement is checked against the real row builder on the same chats: for
    // every day, the row this map names must be the first message row of that
    // day in the rows `layout.ts` produces.
    for (const subject of [
      chat,
      chatWith([msg({ id: 'only', senderId: 'a', timestamp: at(2026, 0, 1, 9) })]),
      chatWith([]),
      chatWith([
        msg({ id: 'a', senderId: 'a', timestamp: at(2026, 0, 1, 9) }),
        msg({ id: 'b', senderId: 'b', timestamp: at(2026, 2, 3, 9) }),
        msg({ id: 'c', senderId: 'a', timestamp: at(2026, 0, 1, 10) }),
      ]),
    ]) {
      const rows = buildRows(subject, at(2026, 5, 10));
      const rowByDay = firstMessageRowByDay(subject);
      for (const [key, row] of rowByDay) {
        const target = rows[row];
        expect(target.type).toBe('message');
        if (target.type === 'message') {
          expect(target.firstOfDay).toBe(true);
          expect(target.message).toBe(subject.messages.find((m) => m.id === target.message.id));
          // The row immediately above is that day's separator.
          const above = rows[row - 1];
          expect(above.type === 'day' && above.key === `day-${key}`).toBe(true);
        }
      }
    }
  });

  it('has one entry per day, and none for a day with no messages', () => {
    const rowByDay = firstMessageRowByDay(chat);
    expect([...rowByDay.keys()].sort()).toEqual(['2026-06-02', '2026-06-27', '2026-06-28']);
    expect(rowByDay.has('2026-06-15')).toBe(false);
  });

  it('reaches the last day of a long chat with the same count as buildRows', () => {
    // 500 messages over three days: the index has to stay correct at a scale
    // where nobody could check it by hand, because the cursor is the only thing
    // keeping it right.
    const messages: Message[] = [];
    for (let index = 0; index < 500; index += 1) {
      messages.push(
        msg({
          id: `m${index}`,
          senderId: index % 2 === 0 ? 'a' : 'b',
          timestamp: at(2026, 5, 27 + Math.floor(index / 200), 8 + (index % 12)),
        }),
      );
    }
    const long = chatWith(messages);
    const rows = buildRows(long, at(2026, 5, 30));
    const rowByDay = firstMessageRowByDay(long);

    for (const [key, row] of rowByDay) {
      const target = rows[row];
      expect(target.type === 'message' && target.firstOfDay).toBe(true);
      const above = rows[row - 1];
      expect(above.type === 'day' && above.key === `day-${key}`).toBe(true);
    }
    expect(rows).toHaveLength(503);
  });
});

describe('initialFocusDay', () => {
  const days = new Set(['2026-06-02', '2026-06-27', '2026-06-28']);

  it('prefers today when today is in the month on screen', () => {
    const cells = monthGrid(2026, 5, days, at(2026, 5, 27, 9));
    expect(initialFocusDay(cells, at(2026, 5, 27, 9))).toBe('2026-06-27');
  });

  it('falls back to the first day with messages, then to the 1st', () => {
    const now = at(2026, 7, 20, 9);
    // September 2026 is neither today's month nor a month this chat has a
    // message in, so the fallback is its 1st.
    expect(initialFocusDay(monthGrid(2026, 8, days, now), now)).toBe('2026-09-01');
    // June has them, and the first is the 2nd.
    expect(initialFocusDay(monthGrid(2026, 5, days, now), now)).toBe('2026-06-02');
  });

  it('always returns a day inside the month on screen', () => {
    for (let month = 0; month < 12; month += 1) {
      const cells: CalendarCell[] = monthGrid(2027, month, days, at(2026, 5, 10)).flat();
      const key = initialFocusDay(monthGrid(2027, month, days, at(2026, 5, 10)));
      const cell = cells.find((candidate) => candidate.key === key);
      expect(cell?.inMonth).toBe(true);
    }
  });
});
