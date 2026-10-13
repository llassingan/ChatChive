/**
 * Playback controller coverage (E5-3, E5-4; plan §2.3).
 *
 * The controller's whole job is the interaction between two players, so the
 * tests are written as the players use it: claim hands in a `pause` callback,
 * that callback is what the loser gets called with, and a `pause` handling that
 * calls straight back into `release` (what `onPause` does) must be safe.
 */
import { describe, expect, it, vi } from 'vitest';
import { createPlaybackController, playback } from './playback.ts';

describe('claim', () => {
  it('pauses the previous holder and takes over', () => {
    const controller = createPlaybackController();
    const pauseVoice = vi.fn();
    const pauseVideo = vi.fn();

    controller.claim('voice:a.opus', pauseVoice);
    expect(controller.getActiveId()).toBe('voice:a.opus');

    controller.claim('video:b.webm', pauseVideo);
    expect(pauseVoice).toHaveBeenCalledTimes(1);
    expect(pauseVideo).not.toHaveBeenCalled();
    expect(controller.getActiveId()).toBe('video:b.webm');
  });

  it('pauses nothing when nothing was playing', () => {
    const controller = createPlaybackController();
    const pause = vi.fn();

    controller.claim('voice:a.opus', pause);
    expect(pause).not.toHaveBeenCalled();
  });

  it('holds the newest pause callback for an id that re-claims itself', () => {
    const controller = createPlaybackController();
    const first = vi.fn();
    const second = vi.fn();

    controller.claim('video:a.webm', first);
    // A second `onPlay` for the same element: pausing it would stop the very
    // player being claimed, so only the callback is replaced.
    controller.claim('video:a.webm', second);

    expect(first).not.toHaveBeenCalled();
    expect(controller.getActiveId()).toBe('video:a.webm');

    controller.claim('voice:b.opus', vi.fn());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('survives a holder whose pause calls release straight back', () => {
    const controller = createPlaybackController();
    // What a real player does: `pause()` fires `onPause`, which releases.
    const voicePause = vi.fn(() => controller.release('voice:a.opus'));

    controller.claim('voice:a.opus', voicePause);
    controller.claim('video:b.webm', vi.fn());

    expect(voicePause).toHaveBeenCalledTimes(1);
    expect(controller.getActiveId()).toBe('video:b.webm');
  });
});

describe('release', () => {
  it('hands playback back to nobody when the holder releases', () => {
    const controller = createPlaybackController();
    controller.claim('voice:a.opus', vi.fn());

    controller.release('voice:a.opus');
    expect(controller.getActiveId()).toBeNull();
  });

  it('ignores a release from a player that does not hold playback', () => {
    const controller = createPlaybackController();
    const pause = vi.fn();
    controller.claim('video:a.webm', pause);

    // A row that lost playback to someone else, released late (its own unmount).
    controller.release('voice:stale.opus');
    expect(controller.getActiveId()).toBe('video:a.webm');

    // And the holder is still stoppable by the next claim.
    controller.claim('voice:b.opus', vi.fn());
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is playing', () => {
    const controller = createPlaybackController();
    expect(() => controller.release('voice:a.opus')).not.toThrow();
    expect(controller.getActiveId()).toBeNull();
  });

  it('lets the same id claim again after releasing', () => {
    const controller = createPlaybackController();
    const pause = vi.fn();

    controller.claim('voice:a.opus', pause);
    controller.release('voice:a.opus');
    controller.claim('voice:a.opus', pause);

    expect(pause).not.toHaveBeenCalled();
    expect(controller.getActiveId()).toBe('voice:a.opus');
  });
});

describe('subscribe', () => {
  it('tells subscribers when playback changes hands, and when it ends', () => {
    const controller = createPlaybackController();
    const seen: (string | null)[] = [];
    const unsubscribe = controller.subscribe(() => seen.push(controller.getActiveId()));

    controller.claim('voice:a.opus', vi.fn());
    controller.claim('video:b.webm', vi.fn());
    controller.release('video:b.webm');

    expect(seen).toEqual(['voice:a.opus', 'video:b.webm', null]);
    unsubscribe();
  });

  it('stops telling a subscriber that left', () => {
    const controller = createPlaybackController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    controller.claim('voice:a.opus', vi.fn());
    controller.release('voice:a.opus');
    expect(listener).not.toHaveBeenCalled();
  });

  it('says nothing on a re-claim, where the active id does not change', () => {
    const controller = createPlaybackController();
    controller.claim('video:a.webm', vi.fn());
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.claim('video:a.webm', vi.fn());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('the process-wide controller', () => {
  it('is one controller, so two rows cannot both think they hold playback', () => {
    const first = vi.fn();
    playback.claim('video:shared.webm', first);
    expect(playback.getActiveId()).toBe('video:shared.webm');

    // The id is arbitrary per claim; the singleton is what the page shares.
    playback.claim('voice:shared.opus', vi.fn());
    expect(first).toHaveBeenCalledTimes(1);
    expect(playback.getActiveId()).toBe('voice:shared.opus');
    playback.release('voice:shared.opus');
  });
});
