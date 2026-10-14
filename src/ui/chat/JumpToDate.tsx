/**
 * Jump-to-date calendar (E7-2; PRD F-NAV-3).
 *
 * A month grid of the days a chat has messages on, drawn inside the shared
 * `Dialog` (E3-1) so the focus trap, the Escape key and the backdrop click are
 * the dialog's existing behaviour rather than a second implementation of them.
 *
 * The rules — which days exist, what the grid holds, which day to focus — are all
 * in `dates.ts`, which is pure and unit-tested. This file is the renderer plus
 * the two pieces of state a keyboard grid needs: which month is on screen and
 * which cell holds the roving tab stop.
 *
 * # Keyboard
 *
 * The cells are real `<button>`s, so Enter and Space pick one for free. The
 * arrows are handled here and move the cursor by date (left/right one day,
 * up/down one week), stepping into the neighbouring month when the cursor
 * crosses a boundary. A day with no messages carries `aria-disabled` rather than
 * the native `disabled`: a natively disabled button cannot take focus at all, so
 * arrow navigation would have to skip it — exactly the thing the calendar is for
 * ("days with messages are enabled, days without them disabled", and the reader
 * needs to be able to *told* that a day is empty). The cells stay focusable and
 * announce as disabled; the pick handler refuses them.
 *
 * # Why the dialog opens on the newest message's month, and focuses a day cell
 *
 * The list opens at the bottom (F-VIEW-13), so the month the reader is looking at
 * is the newest one: that is where a jump usually starts. `Dialog` puts its
 * initial focus on the heading so a screen reader reads the title first, but this
 * dialog then moves focus onto the focused day cell one frame later: a grid whose
 * arrows only work with the mouse is not keyboard operable, and the standard date
 * picker behaviour is to open on a day. The title is still announced, because the
 * dialog names itself with `aria-labelledby`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Chat } from '../../types/chat.ts';
import { dayKey } from '../format.ts';
import { Icon } from '../icons/index.ts';
import {
  addMonths,
  initialFocusDay,
  messageDays,
  monthGrid,
  monthTitle,
  weekdayShortNames,
  type CalendarCell,
} from './dates.ts';
import './JumpToDate.css';

/**
 * How far an arrow moves the cursor, in calendar days. A static string-keyed
 * table, so an unhandled key is one lookup returning `undefined` rather than a
 * chain of comparisons.
 */
const ARROW_DAYS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

export interface JumpToDateProps {
  chat: Chat;
  /** The chosen day, as `format.ts`'s `dayKey`. Only days with messages arrive. */
  onPick: (day: string) => void;
  /** Dismiss without choosing. Escape is the dialog's own route to this. */
  onClose: () => void;
}

export function JumpToDate({ chat, onPick, onClose }: JumpToDateProps) {
  // The clock is read once, when the dialog mounts, and then treated as a fact of
  // this grid: a render that happened to fall after midnight must not move the
  // "today" ring out from under the reader mid-interaction.
  const [now] = useState(() => Date.now());
  const days = useMemo(() => messageDays(chat), [chat]);
  const weekdays = useMemo(() => weekdayShortNames(), []);

  const newest = chat.messages.at(-1);
  const [view, setView] = useState(() => {
    const date = newest === undefined ? new Date(now) : new Date(newest.timestamp);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

  const cells = useMemo(() => monthGrid(view.year, view.month, days, now), [view, days, now]);

  // The roving tab stop. Held as a day key rather than a row/column pair, so a
  // month step cannot leave it pointing at a cell that no longer exists.
  const [cursor, setCursor] = useState(() => initialFocusDay(cells, now));
  // Derived rather than corrected in an effect: after a month step the remembered
  // day may be off screen, and the tab stop has to be a cell of the grid being
  // drawn from the first frame of that step.
  const active = cells.some((week) => week.some((cell) => cell.key === cursor))
    ? cursor
    : initialFocusDay(cells, now);

  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  // Focus follows the cursor, one frame later. The frame is what lets the grid
  // win: `Dialog`'s effect focuses the heading when the dialog is shown, child
  // effects run before parent ones, so a same-tick focus here would be overwritten
  // by it. It also means a cell that just mounted (a month step) is in the DOM
  // before it is asked for focus.
  useEffect(() => {
    const frame = requestAnimationFrame(() => dayRefs.current.get(active)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const move = useCallback(
    (delta: number) => {
      const [year, month, day] = active.split('-').map(Number);
      // Built from fields, so the rollover across a month or a year is `Date`'s
      // job and not a chain of cases here.
      const date = new Date(year, month - 1, day + delta);
      setCursor(dayKey(date.getTime()));
      if (date.getFullYear() !== view.year || date.getMonth() !== view.month) {
        setView({ year: date.getFullYear(), month: date.getMonth() });
      }
    },
    [active, view],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = ARROW_DAYS[event.key];
    if (delta === undefined) return;
    // The arrows belong to the grid: without this the page would scroll under it.
    event.preventDefault();
    move(delta);
  }

  function stepMonth(delta: number) {
    const [year, month] = addMonths(view.year, view.month, delta);
    setView({ year, month });
  }

  function pick(cell: CalendarCell) {
    // `aria-disabled` is not native `disabled`, so the click really does arrive.
    if (!cell.hasMessages) return;
    onPick(cell.key);
  }

  return (
    <div className="jump">
      <div className="jump__head">
        <button type="button" className="icon-button" onClick={() => stepMonth(-1)}>
          <Icon name="chevron-left" size={22} title="Previous month" />
        </button>
        {/* Announced when it changes, so paging a month is not silent. */}
        <h3 className="jump__month" aria-live="polite">
          {monthTitle(view.year, view.month)}
        </h3>
        <button type="button" className="icon-button" onClick={() => stepMonth(1)}>
          <Icon name="chevron-right" size={22} title="Next month" />
        </button>
      </div>

      {/* Hidden from assistive tech on purpose: every day button is already named
          with its full weekday and date, so the column letters would be seven
          loose words with nothing attached to them. They are visual scaffolding. */}
      <div className="jump__weekdays" aria-hidden="true">
        {weekdays.map((name) => (
          <span className="jump__weekday" key={name}>
            {name}
          </span>
        ))}
      </div>

      <div className="jump__grid" onKeyDown={handleKeyDown}>
        {cells.flat().map((cell) => (
          <button
            key={cell.key}
            type="button"
            ref={(node) => {
              if (node === null) dayRefs.current.delete(cell.key);
              else dayRefs.current.set(cell.key, node);
            }}
            className="jump__day"
            data-in-month={cell.inMonth ? 'true' : 'false'}
            data-has-messages={cell.hasMessages ? 'true' : 'false'}
            data-today={cell.isToday ? 'true' : 'false'}
            data-day={cell.key}
            aria-label={cell.label}
            aria-disabled={cell.hasMessages ? undefined : true}
            tabIndex={cell.key === active ? 0 : -1}
            onClick={() => pick(cell)}
          >
            <span className="jump__day-number">{cell.day}</span>
            {/* The dot is the second, non-colour signal for "this day has
                messages" (WCAG 1.4.1): it is a shape, and its colour is whatever
                the number's is. */}
            {cell.hasMessages ? <span className="jump__dot" /> : null}
          </button>
        ))}
      </div>

      <p className="jump__hint">A dot marks a day with messages.</p>

      <div className="jump__actions">
        <button type="button" className="button button--quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
