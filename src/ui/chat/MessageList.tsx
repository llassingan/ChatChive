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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chat } from '../../types/chat.ts';
import { formatText } from '../formatText.ts';
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
import { MessageRow as MessageRowView } from './MessageRow.tsx';
import './MessageList.css';

export interface MessageListProps {
  chat: Chat;
}

/**
 * How long the sticky date pill stays up after the last scroll event (DESIGN
 * §3.5: it "fades out (200ms) about 1.5s after scrolling stops").
 */
const PILL_VISIBLE_MS = 1500;

/**
 * Frames to keep re-pinning to the bottom after a jump. Row measurement lands
 * over the first frames; a short burst covers that without a scroll listener.
 */
const PIN_FRAMES = 30;

/**
 * Seed height per row so the first measurement pass lands near the real height
 * and the bottom jump is small. Rows are measured for real once mounted, so this
 * only affects the first frame (E4-1).
 *
 * Text is the hard case, because E4-6 lets one message carry blocks and jumbo
 * emoji: the plain `lines * 22` estimate under-counts a row holding a fenced
 * block or a list by whatever the blocks cost, and under-counts a jumbo row by
 * two to three times. A bad seed makes the first measurement pass jumpy, and the
 * bottom pin only runs for `PIN_FRAMES`, so the shape is read here (§4.9).
 *
 * The shape is only read for a row that `looksStructured` (layout.ts) says might
 * have one.
 * A plain message returns the same number it always did, and pays ~0.05us for
 * the answer instead of ~8us for a tokenization whose result it cannot use.
 */
function estimateRow(row: MessageRow['message']): number {
  if (row.kind === 'media') return 150;
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

function estimateOf(row: ChatRow): number {
  return row.type === 'day' ? 52 : estimateRow(row.message);
}

export function MessageList({ chat }: MessageListProps) {
  const rows = useMemo(() => buildRows(chat), [chat]);
  const dayLabels = useMemo(() => dayLabelByIndex(rows), [rows]);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  // list's own padding settle over a few frames, and the total height can change
  // after the last measurement, so pin for a short burst of frames rather than
  // once. `scrollTop` clamps to the maximum, which reaches the true bottom in
  // every engine; `scrollToIndex(align: 'end')` left a few px short in WebKit
  // because it computed the offset from not-yet-final measurements.
  //
  // The burst ends after `PIN_FRAMES`, on unmount, or the moment the reader
  // takes over. "The reader takes over" means a real input: a wheel, touch,
  // pointer press or a scroll key. It deliberately does not mean a scroll event,
  // because the browser also fires those while the list is still settling after
  // mount, and yielding to those would abandon the jump before it arrives. The
  // burst only ever rewrites the position it is already at, so it fires no event
  // of its own and does not need to guard against itself.
  const totalSize = virtualizer.getTotalSize();
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
    const pin = () => {
      if (!pinActive.current) return;
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
      if (++frame < PIN_FRAMES) {
        pinRaf.current = requestAnimationFrame(pin);
      } else {
        pinActive.current = false;
      }
    };
    pinRaf.current = requestAnimationFrame(pin);
    return releasePin;
  }, [atBottom, releasePin]);

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
            return (
              <div
                key={row.key}
                className="chat-list__item"
                data-index={item.index}
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
