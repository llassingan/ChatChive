/**
 * Browser back button without a router (E6-1; PRD §8 F-NAV-3, PRD §10).
 *
 * The chat view has no URL and no router ("No router beyond a simple view
 * switch"), so the only way the browser's own Back button can close a chat is a
 * pushed history entry this hook owns. On mount it pushes one entry; a
 * `popstate` delivered for it calls `onBack`, which is the view's single close
 * path. The header Back button and the menu's "Close chat" call `close()` from
 * the same hook: it consumes the entry with `history.back()` when the shell
 * pushed one, and calls `onBack` directly when it did not (a browser where
 * `pushState` is unavailable or refused).
 *
 * Idempotence is part of the contract (§7 risk 9): one gesture can deliver both
 * a `close()` and the `popstate` that `history.back()` triggers, so the second
 * call has to be a no-op. `closedRef` is that latch, and it is set before
 * anything else can re-enter.
 *
 * `onBack` is read through a ref so the effect subscribes exactly once per
 * mount: callers pass a fresh closure every render, and re-subscribing per
 * render would push a second entry and break Back.
 */
import { useCallback, useEffect, useRef } from 'react';

/** The marker we put in `history.state`, so our own entry is identifiable. */
const SHELL_STATE = { chatchive: 'chat' } as const;

export interface HistoryBackHandle {
  /**
   * Leave the view, consuming the history entry the hook pushed when there is
   * one. Safe to call repeatedly, and safe to call after the user already went
   * Back: the second call does nothing.
   */
  close: () => void;
}

/** Pushes one entry on mount, calls `onBack` for the entry it pushed. */
export function useHistoryBack(onBack: () => void): HistoryBackHandle {
  const onBackRef = useRef(onBack);
  // Kept fresh in an effect rather than during render: assigning a ref while
  // rendering is what React forbids (and what the lint rule catches), and the
  // only reader is the popstate handler, which cannot run before effects flush.
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  const pushedRef = useRef(false);
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;

    // One entry per mount. The current state is checked first so a dev-mode
    // StrictMode remount (or any remount that leaves an unconsumed entry on
    // top) does not stack a second entry and turn one Back into two.
    const current = window.history.state as { chatchive?: string } | null;
    if (current?.chatchive === SHELL_STATE.chatchive) {
      pushedRef.current = true;
    } else {
      try {
        window.history.pushState(SHELL_STATE, '');
        pushedRef.current = true;
      } catch {
        // A sandboxed context can refuse pushState; Back then cannot be
        // intercepted, so the view falls back to a direct close path.
        pushedRef.current = false;
      }
    }

    function handlePopstate() {
      if (closedRef.current) return;
      closedRef.current = true;
      onBackRef.current();
    }

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    // Consume the entry we pushed, so Back and this button are the same
    // gesture and `history.length` does not grow with every open. The popstate
    // it triggers is ignored by the latch above: `onBack` must run exactly once
    // per close, and it runs here so the view never waits on an event.
    if (pushedRef.current) window.history.back();
    onBackRef.current();
  }, []);

  return { close };
}
