/**
 * Run and day layout coverage (E4-2, E4-3, E4-5). The run rules and the day
 * boundaries are the parts most likely to regress silently, so they are pinned
 * here with small hand-built chats rather than only through the fixtures.
 */

import { describe, expect, it } from 'vitest';
import type { Chat, Message } from '../../types/chat.ts';
import {
  activeDayLabel,
  buildRows,
  dayLabelByIndex,
  participantOf,
  type MessageRow,
} from './layout.ts';

/** A minimal text message; only the fields the layout reads are meaningful. */
function msg(over: Partial<Message> & Pick<Message, 'id' | 'senderId' | 'timestamp'>): Message {
  return {
    kind: 'text',
    outgoing: false,
    text: 'hi',
    ...over,
  } as Message;
}

function chatWith(messages: Message[], isGroup = true): Chat {
  return {
    meta: {
      title: 'Trip',
      isGroup,
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

/** Local-time helper: day/hour vary, the date is fixed for the labels. */
function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 5, day, hour, minute, 0, 0).getTime();
}

/** Only the message rows, in order, for terse assertions. */
function messageRows(chat: Chat, now = at(10, 12)): MessageRow[] {
  return buildRows(chat, now).filter((row): row is MessageRow => row.type === 'message');
}

describe('buildRows, runs', () => {
  const chat = chatWith([
    msg({ id: 'm0', senderId: 'a', timestamp: at(2, 10) }),
    msg({ id: 'm1', senderId: 'a', timestamp: at(2, 10, 1) }),
    msg({ id: 'm2', senderId: 'b', timestamp: at(2, 10, 2) }),
    msg({ id: 'm3', senderId: 'b', timestamp: at(2, 10, 3) }),
    msg({ id: 'm4', senderId: 'b', timestamp: at(3, 9) }),
  ]);

  it('flags the first and last bubble of each run', () => {
    const flags = messageRows(chat).map((r) => [r.firstOfRun, r.lastOfRun]);
    expect(flags).toEqual([
      [true, false],
      [false, true],
      [true, false],
      [false, true],
      [true, true],
    ]);
  });

  it('breaks a run on a day change even for the same sender', () => {
    const rows = messageRows(chat);
    // m3 and m4 share a sender but not a day, so m3's run ends and m4 starts one.
    expect(rows[3].lastOfRun).toBe(true);
    expect(rows[4].firstOfRun).toBe(true);
  });

  it('does not merge two messages from different senders', () => {
    const rows = messageRows(chat);
    expect(rows[1].lastOfRun).toBe(true);
    expect(rows[2].firstOfRun).toBe(true);
  });
});

describe('buildRows, system breaks', () => {
  const chat = chatWith([
    msg({ id: 'm0', senderId: 'a', timestamp: at(2, 10) }),
    {
      id: 'm1',
      kind: 'system',
      senderId: null,
      timestamp: at(2, 10, 1),
      outgoing: false,
      text: 'x',
      system: 'generic',
    },
    msg({ id: 'm2', senderId: 'a', timestamp: at(2, 10, 2) }),
  ]);

  it('never groups a system message into a run and splits the run around it', () => {
    const rows = messageRows(chat);
    expect(rows[0].lastOfRun).toBe(true);
    expect(rows[1].firstOfRun).toBe(true);
    expect(rows[1].lastOfRun).toBe(true);
    expect(rows[2].firstOfRun).toBe(true);
  });
});

describe('buildRows, day separators', () => {
  const chat = chatWith([
    msg({ id: 'm0', senderId: 'a', timestamp: at(2, 10) }),
    msg({ id: 'm1', senderId: 'b', timestamp: at(2, 11) }),
    msg({ id: 'm2', senderId: 'a', timestamp: at(3, 9) }),
  ]);

  it('inserts one separator per calendar day, before its first message', () => {
    const rows = buildRows(chat, at(4, 12));
    const days = rows.filter((row) => row.type === 'day');
    expect(days.map((d) => d.key)).toEqual(['day-2026-06-02', 'day-2026-06-03']);
    expect(rows[0].type).toBe('day');
  });

  it('marks the first and last message of each day', () => {
    const rows = messageRows(chat);
    expect(rows.map((r) => [r.firstOfDay, r.lastOfDay])).toEqual([
      [true, false],
      [false, true],
      [true, true],
    ]);
  });

  it('labels a day within the last week by weekday', () => {
    // The expected name is computed with the same `Intl` call `format.ts` uses,
    // not hardcoded English: the label follows the host locale by design, and
    // matching `/^Friday$/` made this test fail under `de-DE` (`expected
    // 'Freitag' …`) for a reason unrelated to the row building it protects.
    // 5 June 2026 is the day under test; `now` is 9 June.
    const timestamp = at(5, 10);
    const rows = buildRows(
      chatWith([msg({ id: 'm0', senderId: 'a', timestamp })]),
      new Date(2026, 5, 9, 12).getTime(),
    );
    const day = rows.find((row) => row.type === 'day');
    const expectedWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(
      timestamp,
    );
    expect(day && day.type === 'day' ? day.label : null).toBe(expectedWeekday);
    // And it is a weekday, not the full-date fallback the next branch produces.
    expect(day && day.type === 'day' ? day.label : null).not.toContain('2026');
  });
});

describe('buildRows, keys and indices', () => {
  it('gives every row a unique key and each message its source index', () => {
    const chat = chatWith([
      msg({ id: 'm0', senderId: 'a', timestamp: at(2, 10) }),
      msg({ id: 'm1', senderId: 'a', timestamp: at(3, 10) }),
    ]);
    const rows = buildRows(chat, at(10, 12));
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    const indices = rows
      .filter((r): r is MessageRow => r.type === 'message')
      .map((r) => r.messageIndex);
    expect(indices).toEqual([0, 1]);
  });

  it('returns no rows for an empty chat', () => {
    expect(buildRows(chatWith([]))).toEqual([]);
  });
});

describe('participantOf', () => {
  const chat = chatWith([msg({ id: 'm0', senderId: 'a', timestamp: at(2, 10) })]);

  it('resolves a known sender and returns null for system messages', () => {
    expect(participantOf(chat, 'a')?.displayName).toBe('Ana');
    expect(participantOf(chat, null)).toBeNull();
  });

  it('returns null for an unknown id rather than throwing', () => {
    expect(participantOf(chat, 'ghost')).toBeNull();
  });
});

describe('dayLabelByIndex', () => {
  it('carries each day label forward until the next separator', () => {
    const chat = chatWith([
      msg({ id: 'm0', senderId: 'a', timestamp: at(2, 10) }),
      msg({ id: 'm1', senderId: 'a', timestamp: at(3, 10) }),
    ]);
    const rows = buildRows(chat, at(10, 12));
    // day, m0, day, m1: the message rows inherit the separator above them.
    expect(dayLabelByIndex(rows)).toEqual([
      rows[0].type === 'day' ? rows[0].label : null,
      rows[0].type === 'day' ? rows[0].label : null,
      rows[2].type === 'day' ? rows[2].label : null,
      rows[2].type === 'day' ? rows[2].label : null,
    ]);
  });

  it('returns nothing for a chat with no rows', () => {
    expect(dayLabelByIndex([])).toEqual([]);
  });
});

describe('activeDayLabel (E4-5 sticky pill)', () => {
  const dayLabels = ['Yesterday', 'Yesterday', 'Today', 'Today'];

  it('reports the day of the last row whose top edge passed the viewport top', () => {
    // Row 2 starts at 100, row 3 at 200. Scrolled to 150, the viewport is inside
    // row 2, so the pill shows that row's day, not the first row's.
    const items = [
      { index: 0, start: 0 },
      { index: 1, start: 50 },
      { index: 2, start: 100 },
      { index: 3, start: 200 },
    ];
    expect(activeDayLabel(dayLabels, items, 150)).toBe('Today');
  });

  it('shows the newest day once the whole day section has passed', () => {
    const items = [
      { index: 2, start: 100 },
      { index: 3, start: 200 },
    ];
    expect(activeDayLabel(dayLabels, items, 1000)).toBe('Today');
  });

  it('returns null while the newest mounted row is still below the top', () => {
    const items = [
      { index: 0, start: 40 },
      { index: 1, start: 90 },
    ];
    expect(activeDayLabel(dayLabels, items, 0)).toBeNull();
  });

  it('returns null when nothing is mounted', () => {
    expect(activeDayLabel(dayLabels, [], 0)).toBeNull();
  });
});
