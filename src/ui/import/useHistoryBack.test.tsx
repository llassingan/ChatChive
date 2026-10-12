/**
 * `useHistoryBack` (E6-1, §3.4, §7 risk 9). The hook is the only thing standing
 * between the browser Back button and a view with no URL, so the cases here are
 * the ones that break silently: a second close for one gesture, a close that
 * never reaches `onBack`, a remount that stacks a second entry, and a popstate
 * arriving after unmount.
 *
 * jsdom implements `history.pushState`, `history.back` and the `popstate` event
 * (it fires asynchronously, like a browser), so these are real transitions
 * against the same API the app uses, not a stub.
 */
import { setTimeout as delay } from 'node:timers/promises';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoryBack } from './useHistoryBack.ts';

declare global {
  // React only flushes effects synchronously inside act() when this is set.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

beforeEach(() => {
  // Each test starts from one entry, so `history.length` deltas are its own.
  window.history.replaceState(null, '');
});

/**
 * Flush jsdom's history traversal. `history.back()` queues the traversal as a
 * task and the resulting `popstate` as a second one, so one `await` is not
 * enough; three turns settle it with room to spare.
 */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 3; turn += 1) await delay(0);
  });
}

/** Mount a component using the hook and hand back its `close`. */
function mount(onBack: () => void) {
  // Captured in an effect, not during render: a probe that assigns during
  // render is a side effect React forbids (react-hooks/globals), and it is also
  // not what a real caller does.
  const captured: { current: { close: () => void } | null } = { current: null };

  function Probe() {
    const hook = useHistoryBack(onBack);
    useEffect(() => {
      captured.current = hook;
    }, [hook]);
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Probe />);
  });

  return {
    get close() {
      if (!captured.current) throw new Error('hook did not run');
      return captured.current.close;
    },
  };
}

describe('useHistoryBack', () => {
  it('pushes exactly one entry on mount and marks it', () => {
    const before = window.history.length;
    mount(vi.fn());

    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toEqual({ chatchive: 'chat' });
  });

  it('calls onBack once when the browser Back button is used', async () => {
    const onBack = vi.fn();
    mount(onBack);

    window.history.back();
    await settle();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('close() consumes the entry and calls onBack exactly once', async () => {
    const onBack = vi.fn();
    const probe = mount(onBack);
    const before = window.history.length;

    act(() => probe.close());
    await settle();

    expect(onBack).toHaveBeenCalledTimes(1);
    // The entry is consumed rather than stacked. jsdom, unlike a browser, keeps
    // `history.length` after `back()` and truncates the forward entries on the
    // next push, so the check is that close() left us on the entry below (its
    // state is gone) and that the next push reuses that slot instead of adding
    // one.
    expect(window.history.state).toBeNull();
    window.history.pushState({ sentinel: true }, '');
    expect(window.history.length).toBe(before);
  });

  it('close() twice for one gesture is a no-op the second time', async () => {
    const onBack = vi.fn();
    const probe = mount(onBack);

    act(() => {
      probe.close();
      probe.close();
    });
    await settle();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a popstate after close() does not close twice', async () => {
    const onBack = vi.fn();
    const probe = mount(onBack);

    // The gesture the hook must survive: the Back button calls close(), and the
    // browser then delivers the popstate its own history.back() queued.
    act(() => probe.close());
    await settle();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps history.length bounded across repeated open/close cycles', async () => {
    const onBack = vi.fn();
    const start = window.history.length;

    // Each cycle pushes one entry and consumes it, so the length never climbs
    // with the number of cycles. jsdom keeps `history.length` through `back()`
    // and truncates on the next push, so the bound is `start + 1`, not `start`.
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const probe = mount(onBack);
      expect(window.history.length).toBeLessThanOrEqual(start + 1);
      act(() => probe.close());
      await settle();
      act(() => root?.unmount());
      root = null;
    }

    expect(window.history.length).toBeLessThanOrEqual(start + 1);
    expect(onBack).toHaveBeenCalledTimes(5);
  });

  it('does not push a second entry when remounted on its own entry', () => {
    // StrictMode remounts an effect on the same entry; pushing again would make
    // one Back into two and grow history per render.
    const onBack = vi.fn();
    const probe = mount(onBack);
    const afterFirst = window.history.length;
    act(() => root?.unmount());

    mount(onBack);

    expect(window.history.length).toBe(afterFirst);
    void probe;
  });

  it('ignores a popstate that arrives after unmount', async () => {
    const onBack = vi.fn();
    mount(onBack);
    act(() => root?.unmount());
    root = null;

    window.history.back();
    await settle();

    expect(onBack).not.toHaveBeenCalled();
  });
});
