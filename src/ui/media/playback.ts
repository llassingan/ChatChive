/**
 * One-player-at-a-time controller (E5-3, E5-4; plan §2.3).
 *
 * Voice notes and videos both make sound, so the page needs exactly one rule
 * between them: starting one stops the other. A player claims playback on play
 * and releases it on pause, on `ended`, or when the row unmounts (a row
 * virtualized out of the window must not keep talking, §4.5).
 *
 * The controller holds no element and touches no DOM: each claimant hands in the
 * `pause` it wants called if something else takes over, which keeps this module
 * testable without a player and free of React (plan §2.3, E5-3's rule).
 *
 * `getActiveId` is the read a subscriber uses to draw "this one is playing"; the
 * id is a string the claimant owns (`voice:<entry>`, `video:<entry>`), never a
 * blob URL and never a rendered text node.
 */
export interface PlaybackController {
  /** Claim playback for `id`, pausing whatever held it before. */
  claim(id: string, pause: () => void): void;
  /** Renounce playback (pause, ended, unmount). Only the holder may release. */
  release(id: string): void;
  subscribe(listener: () => void): () => void;
  /** The id currently playing, or null. */
  getActiveId(): string | null;
}

export function createPlaybackController(): PlaybackController {
  const listeners = new Set<() => void>();
  let activeId: string | null = null;
  let activePause: (() => void) | null = null;

  function notify(): void {
    // Over a copy: a listener may unsubscribe while being told.
    for (const listener of [...listeners]) listener();
  }

  function claim(id: string, pause: () => void): void {
    // Re-claiming the id that already holds playback is a no-op beyond storing
    // the new callback: pausing it would stop the very player being claimed.
    const previousPause = activePause;
    if (previousPause !== null && activeId === id) {
      activePause = pause;
      return;
    }

    // The new holder is recorded before the old one is told to stop, so the old
    // player's `pause` → `release(oldId)` reaction finds it is no longer the
    // holder and changes nothing.
    activeId = id;
    activePause = pause;
    if (previousPause !== null) previousPause();
    notify();
  }

  function release(id: string): void {
    // Only the holder may release: a stale row that already lost playback must
    // not silence whoever holds it now.
    if (activeId !== id) return;
    activeId = null;
    activePause = null;
    notify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { claim, release, subscribe, getActiveId: () => activeId };
}

/** Process-wide controller: "one player at a time" is a page-level fact. */
export const playback: PlaybackController = createPlaybackController();
