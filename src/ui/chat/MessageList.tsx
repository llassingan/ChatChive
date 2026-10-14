/**
 * Virtualized message list (backlog E4-1).
 *
 * Opens at the newest message like WhatsApp does (F-VIEW-13), keeps a sticky
 * date pill pinned under the header (E4-5), and shows a scroll-to-bottom button
 * once the user has scrolled up about a screen (F-VIEW-13).
 *
 * Virtualization matters because the target is a 100k-message export at 60 fps
 * with media loaded lazily (PRD §9): only the visible window plus an overscan
 * margin is in the DOM, so memory and paint cost stay flat as the chat grows.
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatSession } from '../../parser/client.ts';
import type { Chat, MediaMessage } from '../../types/chat.ts';
import { createMediaStore, type MediaStore } from '../media/store.ts';
import { formatText } from '../formatText.ts';
import { dayKey } from '../format.ts';
import { Icon } from '../icons/index.ts';
import {
  activeDayLabel,
  buildRows,
  dayLabelByIndex,
  looksStructured,
  participantOf,
  type ChatRow,
  type MessageRow,
} from './layout.ts';
import type { MessageSearch, SearchResults } from './search.ts';
import { MessageRow as MessageRowView } from './MessageRow.tsx';
import './MessageList.css';

/**
 * The search state the list renders and scrolls for (E7-1).
 *
 * The query itself is not here: the list never matches anything, it draws the
 * highlights `search.ts` already worked out and moves the reader to the match
 * the view selected. That split is what keeps the counter and the highlights
 * from disagreeing, and it keeps the matching rules unit-testable.
 */
export interface MessageListSearch {
  results: SearchResults;
  /** Index into `results.matches`, or -1 when there is no selection yet. */
  activeIndex: number;
}

export interface MessageListProps {
  chat: Chat;
  /**
   * The live parse session, so the media store can extract bytes on demand
   * (E5-1). The chat state keeps it open for as long as the view is mounted
   * (§2.4); it is nullable so a test or a future host without a worker can
   * still render the list, in which case every media row shows its placeholder.
   */
  session: ChatSession | null;
  /** Live search state, or absent/null when no query is running (E7-1). */
  search?: MessageListSearch | null | undefined;
  /**
   * The day the calendar asked for (E7-2), as `format.ts`'s `dayKey`, or null
   * when nothing has been asked for. A request rather than a position: the list
   * is the only thing that knows its row indices, so the view says *which day*
   * and the list works out where that is.
   *
   * Repeating a request for the same day after scrolling away has to scroll
   * again, which is why the value is paired with a sequence number in
   * `MessageListJump` rather than being a bare string.
   */
  jump?: MessageListJump | null | undefined;
}

/** A pending "jump to this day" request (E7-2): the day, and which ask it was. */
export interface MessageListJump {
  /** The day to land on, as `dayKey`. */
  day: string;
  /**
   * Bumped by the caller on every request, including a repeat of the same day.
   * Without it, picking the same date twice would be a no-op the second time,
   * because React would see an unchanged prop.
   */
  seq: number;
}

/**
 * How long the sticky date pill stays up after the last scroll event (DESIGN
 * §3.5: it "fades out (200ms) about 1.5s after scrolling stops").
 */
const PILL_VISIBLE_MS = 1500;

/**
 * Frames the bottom pin is allowed to keep rewriting, and the stillness it waits
 * for before it stops. The exit condition is arrival, not a frame count: the
 * content settles in stages (rows measure, then the sticky pill mounts and adds
 * its own 27px to the list), and on WebKit at 1440x900 those stages land up to
 * 29 frames apart (measured from the mount frame), so a fixed burst of frames
 * ended before the pill had grown the list and left it 27px short of the newest
 * message in about half of loads. `PIN_SETTLE_FRAMES` is above that measured
 * gap; `PIN_FRAMES` is only a safety bound for a list that never stops growing.
 */
const PIN_FRAMES = 120;
const PIN_SETTLE_FRAMES = 32;

/**
 * Seed height per row so the first measurement pass lands near the real height
 * and the bottom jump is small. Rows are measured for real once mounted, so this
 * only affects the first frame (E4-1).
 *
 * Text is the hard case, because E4-6 lets one message carry blocks and jumbo
 * emoji: the plain `lines * 22` estimate under-counts a row holding a fenced
 * block or a list by whatever the blocks cost, and under-counts a jumbo row by
 * two to three times. A bad seed makes the measurement pass jumpy: rows above a
 * row that measures differently shift by the difference. The shape is read here
 * (§4.9).
 *
 * The shape is only read for a row that `looksStructured` (layout.ts) says might
 * have one.
 * A plain message returns the same number it always did, and pays ~0.05us for
 * the answer instead of ~8us for a tokenization whose result it cannot use.
 */
function estimateRow(row: MessageRow['message']): number {
  if (row.kind === 'media') return estimateMedia(row);
  if (row.kind === 'call') return 84;
  if (row.kind === 'empty' || row.kind === 'deleted') return 44;
  const lines = row.kind === 'text' ? row.text.split('\n').length : 1;
  if (row.kind !== 'text' || !looksStructured(row.text)) return 30 + lines * 22;

  const result = formatText(row.text);
  if (result.jumbo) {
    // 48px for a single emoji, 36px for two or three, times the 1.15 line box,
    // plus the bubble's own padding.
    return result.emojiCount === 1 ? 78 : 62;
  }

  const extra = Math.max(0, result.blocks.length - 1);
  // Each extra block is taller than a plain line and carries its own margins,
  // which the line count alone does not see.
  return 30 + lines * 22 + extra * 14;
}

/**
 * Seed height for a media row (E5 §4.4). The kind decides the box, and a
 * caption adds one line: a flat 150 for every media row under-seeds an image by
 * more than a hundred pixels, so a bad seed leaves the first paint short until
 * the row is measured. Values are seeds, not truth; the virtualizer adjusts the
 * scroll offset when a measured row differs (§4.4).
 */
function estimateMedia(row: MediaMessage): number {
  const { media } = row;
  if (!media.resolved) return 88;
  switch (media.kind) {
    case 'image':
    case 'video':
    case 'gif':
      // A 4:3 box about 300px wide inside the bubble's padding (7+8), and one
      // 22px caption line plus its margin when the message carries a caption.
      return row.caption ? 292 : 262;
    case 'sticker':
      // The 160px cap plus the pill row.
      return 190;
    case 'voice':
    case 'audio':
      // Two 22px rows of player content plus the bubble's padding.
      return 78;
    case 'document':
      // A 48px tile plus padding and the meta line.
      return 88;
    default:
      // contact/location: their bodies do not change this sprint.
      return 150;
  }
}

function estimateOf(row: ChatRow): number {
  return row.type === 'day' ? 52 : estimateRow(row.message);
}
export function MessageList({ chat, session, search = null, jump = null }: MessageListProps) {
  const rows = useMemo(() => buildRows(chat), [chat]);
  const dayLabels = useMemo(() => dayLabelByIndex(rows), [rows]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Message index -> row index, so a search hit (which is a message) can be
  // turned into a virtualizer index (which is a row). Built once per rows
  // change: the day separators sit between the messages, so the two indices
  // drift apart by the number of days above, and scanning for each step would
  // be O(n) per prev/next press.
  const rowByMessage = useMemo(() => {
    const map = new Map<number, number>();
    rows.forEach((row, index) => {
      if (row.type === 'message') map.set(row.messageIndex, index);
    });
    return map;
  }, [rows]);

  // One store for the mounted chat (E5-1), kept in a ref so it survives a
  // StrictMode double-invoke. The previous `useMemo` + `useEffect(() => () =>
  // store.dispose(), [store])` pair disposed the store on the development
  // cleanup and never recreated it, so every media request was skipped and the
  // whole chat showed blank boxes under `npm run dev` (Sprint 7 BUG-1). A ref
  // also makes the store stable across a `session` identity change within one
  // mount, which is what the rows' memo comparison wants.
  const storeRef = useRef<MediaStore | null>(null);
  if (storeRef.current === null) storeRef.current = createMediaStore(session);
  const store = storeRef.current;

  // Re-point the store when a genuinely different session arrives (open another
  // chat in the same view). This is the one place a store is legitimately
  // replaced; the ref above keeps the common mount cheap.
  useEffect(() => {
    if (storeRef.current?.session === session) return;
    storeRef.current?.dispose();
    storeRef.current = createMediaStore(session);
  }, [session]);

  // The version counter is the snapshot: it changes only when an entry did, so
  // React re-renders the list once per landed file, not once per request.
  useSyncExternalStore(store.subscribe, store.getVersion);
  // Revoke every URL on unmount (F-NAV-6). No dependency array: the ref is
  // always current, and this must fire exactly once, on the real teardown.
  useEffect(
    () => () => {
      storeRef.current?.dispose();
      storeRef.current = null;
    },
    [],
  );

  const count = rows.length;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateOf(rows[index]),
    getItemKey: (index) => rows[index].key,
    overscan: 8,
  });

  const [atBottom, setAtBottom] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [pillVisible, setPillVisible] = useState(false);

  // The sticky pill fades out about 1.5s after scrolling stops (DESIGN §3.5).
  // One timer is kept alive at a time and re-armed for the remainder, rather
  // than a fresh timeout per scroll frame: the pass below runs every frame of a
  // gesture, and allocating a timer per frame is needless churn. Only `now +
  // PILL_VISIBLE_MS` is written per pass, which is a ref write and costs no
  // render.
  const pillDeadline = useRef(0);
  const pillTimer = useRef<number | null>(null);
  const touchPill = useCallback((label: string | null) => {
    setActiveDay(label);
    if (label === null) {
      setPillVisible(false);
      return;
    }
    setPillVisible(true);
    pillDeadline.current = Date.now() + PILL_VISIBLE_MS;
    if (pillTimer.current !== null) return;
    const tick = () => {
      const remaining = pillDeadline.current - Date.now();
      if (remaining > 0) {
        pillTimer.current = window.setTimeout(tick, remaining);
        return;
      }
      pillTimer.current = null;
      setPillVisible(false);
    };
    pillTimer.current = window.setTimeout(tick, PILL_VISIBLE_MS);
  }, []);

  // Pin to the newest message on arrival (F-VIEW-13). Row measurement and the
  // list's own padding settle over a few frames, and the content settles in
  // stages rather than once: rows measure, then the sticky pill mounts and adds
  // its own height to the list. `scrollTop` clamps to the maximum, which reaches
  // the true bottom in every engine; `scrollToIndex(align: 'end')` left a few px
  // short in WebKit because it computed the offset from not-yet-final
  // measurements.
  //
  // The burst ends when the height has stopped changing, on unmount, or the
  // moment the reader takes over. It deliberately does not end after a fixed
  // number of frames: the last growth stage lands up to 29 frames after the list
  // mounts (measured on WebKit at 1440x900), so a fixed thirty-frame burst
  // stopped before the pill had grown the list and rested 27px short of the
  // newest message in about half of loads. "The reader takes over" means a real
  // input: a wheel, touch, pointer press or a scroll key. It deliberately does
  // not mean a scroll event, because the browser also fires those while the list
  // is still settling after mount, and yielding to those would abandon the jump
  // before it arrives. The burst only ever rewrites the position it is already
  // at, so it fires no event of its own and does not need to guard against
  // itself.
  //
  // A settled-height exit alone is still a guess about the future: the pill's
  // mount is a React commit caused by this pin's own write, so under CPU load it
  // can land *after* the burst has stopped, and no window of frames can promise
  // otherwise. Measured on WebKit at 1440x900, desktop-light, at 4-way parallel
  // load: a fixed quiet window left the list 27px short in 1 of 100 opens (the
  // same state as the pre-fix defect), which is one open too many for a P0
  // requirement. `activeDay` is the signal that mount is keyed on (the sticky
  // div renders only when it is set), so the effect re-runs and the pin restarts
  // at exactly the moment the list grows, however late that is. The frame bound
  // stays as a safety net for a list that never stops growing; it is no longer
  // the exit that decides correctness.
  const totalSize = virtualizer.getTotalSize();
  // The sticky div renders only while a day is active, and it occupies space in
  // the flow, so this boolean flips exactly when the list gains the pill's
  // height. It is a dependency of the pin below.
  const pillMounted = activeDay !== null;
  const pinRaf = useRef<number | null>(null);
  const pinActive = useRef(false);
  const releasePin = useCallback(() => {
    pinActive.current = false;
    if (pinRaf.current !== null) cancelAnimationFrame(pinRaf.current);
  }, []);
  useEffect(() => {
    if (!atBottom) return;
    pinActive.current = true;
    let frame = 0;
    let quiet = 0;
    let previousHeight = -1;
    // Whether the list has actually reached the bottom at least once. The
    // frame bound below only becomes a valid exit after this is true; until
    // then the pin keeps writing, which is the F-1 fix. Sprint 6's independent
    // QA measured the old behaviour: `PIN_FRAMES = 120` could expire under
    // 4-way parallel load before the last layout stage, leaving the list 27px
    // short with no scroll-to-bottom button (so `atBottom` stayed true, and
    // nothing re-armed the pin).
    let arrived = false;
    const pin = () => {
      if (!pinActive.current) return;
      const element = scrollRef.current;
      // `scrollHeight` is the whole scroll container: the rows through the
      // sizer, plus the sticky pill, which is a sibling of the sizer and is what
      // the last growth stage adds.
      const height = element?.scrollHeight ?? -1;
      quiet = height === previousHeight ? quiet + 1 : 0;
      previousHeight = height;
      if (element) {
        element.scrollTop = element.scrollHeight;
        // Arrived when the write above actually reached the bottom: the scroll
        // position is clamped to `scrollHeight - clientHeight`, so the equality
        // holds only when there is no more to scroll. A 1px tolerance absorbs
        // sub-pixel layout rounding.
        const restingDistance = element.scrollHeight - element.scrollTop - element.clientHeight;
        if (restingDistance <= 1) arrived = true;
      }
      // Two exits, and the order matters. The first is the real one: the height
      // held still long enough that no further stage is pending, and the write
      // above already reached the bottom of that final height. The second is the
      // safety bound, and it is only allowed to fire *after* the list reached the
      // bottom at least once. Before arrival it is ignored, because a load-induced
      // stall must not be mistaken for a settled list: Sprint 6's independent QA
      // measured `PIN_FRAMES = 120` expiring first under 4-way parallel load,
      // leaving the list 27px short with no scroll-to-bottom button (F-1). The
      // `arrived` flag is what keeps the bound from firing early, without removing
      // it: a list that truly never arrives is still bounded by `frame`.
      if ((arrived && quiet >= PIN_SETTLE_FRAMES) || (arrived && ++frame >= PIN_FRAMES)) {
        pinActive.current = false;
        return;
      }
      pinRaf.current = requestAnimationFrame(pin);
    };
    pinRaf.current = requestAnimationFrame(pin);
    return releasePin;
    // `pillMounted` is the growth signal, not a rendering input: when the pill
    // mounts and adds its height, this effect re-runs and the pin restarts
    // against the new height. See the note above.
  }, [atBottom, releasePin, pillMounted]);

  // Move the reader to the selected match (E7-1). The row it lives in may not be
  // mounted at all — that is the whole point of a virtualized list — so this
  // asks the virtualizer for the offset rather than looking for a DOM node by
  // id. `releasePin` first: the arrival pin below would otherwise rewrite the
  // position on its next frame and yank the reader back to the newest message.
  const activeMatch = search === null ? undefined : search.results.matches[search.activeIndex];
  const activeRow =
    activeMatch === undefined ? undefined : rowByMessage.get(activeMatch.messageIndex);
  useEffect(() => {
    if (activeRow === undefined) return;
    releasePin();
    setAtBottom(false);
    // `align: 'center'` puts the match in the middle of the viewport, so a hit
    // near either edge still arrives with context above and below it rather
    // than against the header or the footer.
    virtualizer.scrollToIndex(activeRow, { align: 'center' });
    // The row is measured after it mounts, and its real height can differ from
    // the seed by a hundred pixels (a media row, a fenced block), which moves
    // the target. One second pass against the corrected measurements is what
    // makes the arrival exact instead of approximately right.
    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(activeRow, { align: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeRow, virtualizer, releasePin]);

  // Move the reader to the first message of a chosen day (E7-2). Same rule as the
  // search jump above, and for the same reason: the row is a virtualizer index,
  // not a node, so it is asked for the offset. `align: 'start'` rather than
  // 'center' because the promise the calendar makes is "the first message of that
  // day", and the first message reads as the first thing on screen.
  //
  // The row is found by scanning the rows this list already holds rather than by
  // re-deriving the day-to-row rule from the messages: the calendar and the list
  // then cannot disagree about which index a day starts at, and there is no
  // second copy of `buildRows`' separator rule to keep in step. The scan runs on
  // a pick, not per row per frame, so its cost is paid on a click.
  // Destructured out of the request so the effect can depend on the two plain
  // values it actually reads. Depending on the request object itself would
  // re-run whenever a parent rebuilt it; depending only on `jumpRow` would miss
  // the reader picking the same day a second time, because the row is then the
  // number it already was. The sequence number is what makes that second pick a
  // new event rather than an identical render.
  const jumpDay = jump === null ? null : jump.day;
  const jumpSeq = jump === null ? 0 : jump.seq;
  const jumpRow = useMemo(() => {
    if (jumpDay === null) return undefined;
    const index = rows.findIndex(
      (row) =>
        row.type === 'message' && row.firstOfDay && dayKey(row.message.timestamp) === jumpDay,
    );
    return index === -1 ? undefined : index;
  }, [rows, jumpDay]);

  useEffect(() => {
    if (jumpRow === undefined) return;
    releasePin();
    setAtBottom(false);
    virtualizer.scrollToIndex(jumpRow, { align: 'start' });
    // The same second pass the search jump needs: rows are measured once they
    // mount, and a height that differs from its seed moves the target.
    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(jumpRow, { align: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpRow, jumpSeq, virtualizer, releasePin]);

  // Scroll bookkeeping, throttled to one pass per animation frame. A scroll
  // gesture fires several events per frame, and each pass re-renders the list
  // (to move the sticky pill and toggle the jump button), so running it per
  // event cost ~80ms frames on a 100k-message chat. One pass per frame holds a
  // steady 60 fps (PRD §9, E4-1). Both setters are called with an unchanged
  // value harmlessly: React bails out of the re-render when the value is equal.
  const scrollFrame = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (scrollFrame.current !== null) return;
    const frame = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) {
        const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
        setAtBottom(distance < 80);

        // Sticky pill = the day of the last row whose top edge scrolled past the
        // top (E4-5). Pure helper, so the rule is unit-tested in layout.test.ts.
        touchPill(activeDayLabel(dayLabels, virtualizer.getVirtualItems(), element.scrollTop));
      }
      // Cleared last, not first. This pass reads layout and sets state, which
      // can make the browser fire more scroll events before the frame ends;
      // clearing the guard up front let those re-enter and turned one pass per
      // frame into three or four, the exact cost the throttle exists to avoid.
      if (scrollFrame.current === frame) scrollFrame.current = null;
    });
    scrollFrame.current = frame;
  }, [virtualizer, dayLabels, touchPill]);

  // Visibility drives extraction (E5-1). The mounted window is the visible rows
  // plus `overscan: 8`, which is E5-1's "within one screen of view". No
  // IntersectionObserver: the list is already virtualized and jsdom does not
  // implement it (the same ruling as Sprint 4's `matchMedia`).
  //
  // Deliberately no dependency array: the effect has to see the current window
  // after every render, and re-renders here are bounded by the same scroll
  // throttle the rest of the list uses. `request` is idempotent and a `Map`
  // lookup, so a redundant pass costs one comparison per mounted row and no
  // work; the alternative, a dependency on the item list, would allocate a new
  // array every frame for the same answer.
  useEffect(() => {
    for (const item of virtualizer.getVirtualItems()) {
      const row = rows[item.index];
      if (row.type !== 'message' || row.message.kind !== 'media') continue;
      const { media } = row.message;
      // A reference the archive does not contain is never requested: there is
      // nothing to extract, and the row renders the placeholder (§2.5).
      if (media.resolved) store.request(media);
    }
  });
  // Cancel a pending pass and pill timer on unmount so neither touches a gone node.
  useEffect(() => {
    return () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
      if (pillTimer.current !== null) clearTimeout(pillTimer.current);
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setAtBottom(true);
    element.scrollTop = element.scrollHeight;
  }, []);

  return (
    <div className="chat-list-wrap">
      <div
        className="chat-list"
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={releasePin}
        onTouchStart={releasePin}
        onPointerDown={releasePin}
        onKeyDown={releasePin}
      >
        {activeDay ? (
          <div
            className="chat-list__sticky"
            data-visible={pillVisible ? 'true' : 'false'}
            aria-hidden="true"
          >
            <span className="day__pill">{activeDay}</span>
          </div>
        ) : null}
        <div className="chat-list__sizer" style={{ height: totalSize }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            // Media is read here, during render: `get` returns the same object
            // until that entry's status changes, so a row re-renders when its
            // own media lands and never when a neighbour's does (§2.5).
            const mediaEntry =
              row.type === 'message' && row.message.kind === 'media'
                ? store.get(row.message.media.entryName)
                : null;
            // This row's search highlights, or null when the query does not
            // touch it. Read from the map rather than filtered out of the match
            // list per row, which would be O(matches) per mounted row per frame.
            const hit: MessageSearch | null =
              row.type === 'message'
                ? (search?.results.byMessage.get(row.messageIndex) ?? null)
                : null;
            // The selected match is handed down whole: it is structurally an
            // `ActiveHighlight`, so the row can compare it against the run it is
            // about to draw without a conversion step in between. The message
            // check is what keeps a selected match from marking a row it is not
            // in when `activeRow` happens to be stale for a frame.
            const activeHit =
              activeMatch !== undefined &&
              row.type === 'message' &&
              activeMatch.messageIndex === row.messageIndex
                ? activeMatch
                : null;
            return (
              <div
                key={row.key}
                className="chat-list__item"
                data-index={item.index}
                {...(row.type === 'day'
                  ? { 'data-day': '' }
                  : { 'data-run': row.firstOfRun ? 'new' : 'same' })}
                {...(activeHit === null ? {} : { 'data-match': 'active' })}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {row.type === 'day' ? (
                  <div className="day" role="separator" aria-label={row.label}>
                    <span className="day__pill">{row.label}</span>
                  </div>
                ) : (
                  <MessageRowView
                    message={row.message}
                    participant={participantOf(chat, row.message.senderId)}
                    clockStyle={chat.meta.clockStyle}
                    showSender={chat.meta.isGroup && row.firstOfRun && !row.message.outgoing}
                    firstOfRun={row.firstOfRun}
                    lastOfRun={row.lastOfRun}
                    mediaEntry={mediaEntry}
                    highlight={hit}
                    {...(activeHit === null ? {} : { activeMatch: activeHit })}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!atBottom ? (
        <button type="button" className="icon-button chat-list__to-bottom" onClick={scrollToBottom}>
          <Icon name="chevron-down" size={22} title="Scroll to bottom" />
        </button>
      ) : null}
    </div>
  );
}
