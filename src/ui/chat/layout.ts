/**
 * Chat-view layout pass (backlog E4-2, E4-3, E4-5).
 *
 * The renderer needs more than a flat message list: it needs to know where a run
 * starts and ends so it can draw one tail and one avatar per run, where a day
 * starts so it can insert a separator, and which bubbles are incoming in a group
 * so it can show a sender header. That is all derivable from the messages, but
 * deriving it inside a row component on every scroll frame would repeat the same
 * work for a 100k-message chat (PRD §9).
 *
 * So it is computed once, up front, into a flat list of rows the virtualizer can
 * address by index. Pure: same input, same rows, no DOM.
 *
 * Run rules (DESIGN §3.2): consecutive messages form a run when they share a
 * sender and a calendar day, with no system message, date separator or change of
 * sender in between. System messages never tail and never group.
 */

import type { Chat, Message, Participant } from '../../types/chat.ts';
import { dayKey, formatDayLabel } from '../format.ts';

export interface DayRow {
  type: 'day';
  /** Stable key for React and for the virtualizer. */
  key: string;
  timestamp: number;
  label: string;
}

export interface MessageRow {
  type: 'message';
  key: string;
  message: Message;
  /** Index into `chat.messages`, for search and jump-to-message (E7). */
  messageIndex: number;
  /** First bubble of its run: gets the sender header and the web tail. */
  firstOfRun: boolean;
  /** Last bubble of its run: gets the mobile tail and the mobile avatar. */
  lastOfRun: boolean;
  firstOfDay: boolean;
  lastOfDay: boolean;
}

export type ChatRow = DayRow | MessageRow;

/** Whether a message can join a run: a real sender, not a system notice. */
function runnable(message: Message): boolean {
  return message.senderId !== null && message.kind !== 'system';
}

function sameRun(a: Message, b: Message): boolean {
  return (
    runnable(a) &&
    runnable(b) &&
    a.senderId === b.senderId &&
    dayKey(a.timestamp) === dayKey(b.timestamp)
  );
}

/**
 * Build the row list for a chat: one day separator before the first message of
 * each calendar day, and one message row per message carrying its run flags.
 * `now` is injectable so the day labels are testable (E4-5).
 */
export function buildRows(chat: Chat, now = Date.now()): ChatRow[] {
  const rows: ChatRow[] = [];
  const { messages } = chat;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const key = dayKey(message.timestamp);
    const previous = index > 0 ? messages[index - 1] : null;
    const next = index < messages.length - 1 ? messages[index + 1] : null;

    const firstOfDay = previous === null || dayKey(previous.timestamp) !== key;
    if (firstOfDay) {
      rows.push({
        type: 'day',
        key: `day-${key}`,
        timestamp: message.timestamp,
        label: formatDayLabel(message.timestamp, now),
      });
    }

    rows.push({
      type: 'message',
      key: message.id,
      message,
      messageIndex: index,
      firstOfRun: previous === null || !sameRun(previous, message),
      lastOfRun: next === null || !sameRun(message, next),
      firstOfDay,
      lastOfDay: next === null || dayKey(next.timestamp) !== key,
    });
  }

  return rows;
}

/** Look up a participant by id, or null for a system message's absent sender. */
export function participantOf(chat: Chat, senderId: string | null): Participant | null {
  if (senderId === null) return null;
  return chat.participants.find((participant) => participant.id === senderId) ?? null;
}

/**
 * For each row index, the label of the day section it belongs to. Built once so
 * the sticky date pill (F-VIEW-3) can look up the active day in O(1) on every
 * scroll frame instead of scanning back through the rows.
 */
export function dayLabelByIndex(rows: ChatRow[]): Array<string | null> {
  const labels: Array<string | null> = [];
  let current: string | null = null;
  for (const row of rows) {
    if (row.type === 'day') current = row.label;
    labels.push(current);
  }
  return labels;
}

/**
 * The day the viewport is currently inside, for the sticky date pill (E4-5,
 * F-VIEW-3): the label of the last row whose top edge has scrolled past the top
 * of the list, or null while the first separator is still below it.
 *
 * Kept pure and index-based rather than inline in the scroll handler so the rule
 * is unit-testable, and so a scroll frame walks only the handful of mounted rows
 * the virtualizer reports instead of the whole chat.
 */
export function activeDayLabel(
  dayLabels: Array<string | null>,
  virtualItems: ReadonlyArray<{ index: number; start: number }>,
  scrollTop: number,
): string | null {
  let current: string | null = null;
  for (const item of virtualItems) {
    if (item.start <= scrollTop + 1) current = dayLabels[item.index] ?? current;
  }
  return current;
}
