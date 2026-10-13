/**
 * Video body (E5-2; DESIGN §3.7, plan §3.2, §4.5).
 *
 * A still frame with a centered play control, then the browser's own controls
 * once playback starts. The overlay exists because a `<video>` with `controls`
 * renders its play affordance differently in every engine and shows a black
 * rectangle before the first frame; the play button is a real control with a
 * real effect, which is the bar this sprint sets (R-26).
 *
 * One player at a time is the `playback` controller's job, shared with the voice
 * player (§2.3): a video that claims pauses whatever was playing, and a row
 * virtualized out of the window unmounts and releases its claim (§4.5).
 *
 * What is deliberately *not* drawn: a duration line on the frame (the native
 * controls carry the duration, and a second copy of it would be decoration), a
 * lightbox (E5-9), and `autoplay` (a viewer must never start making sound).
 * `muted` is not set either: a video that claims playback has been asked for by
 * the reader, and unmuting is the honest default.
 */
import { useEffect, useRef, useState } from 'react';
import type { MediaRef } from '../../../types/chat.ts';
import { playback } from '../../media/playback.ts';
import { Icon } from '../../icons/index.ts';
import { MediaFallback } from './MediaFallback.tsx';

export interface VideoBodyProps {
  media: MediaRef;
  url: string;
  /** Names the message in the play button's label, for a screen reader. */
  label: string;
  /**
   * The codec cannot be demuxed, so this painted a tile rather than a frame.
   * The row gates the meta scrim on what was actually painted, and `ready` only
   * says the bytes were extracted (see `./shape.ts`).
   */
  onDegrade: () => void;
}

export function VideoBody({ media, url, label, onDegrade }: VideoBodyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  // A codec the engine cannot demux is knowable *before* mounting the element,
  // and WebKit reports some of those on the element while chromium reports them
  // on the source (§7.6). Asking first means the fallback copy is reached the
  // same way in both engines.
  const [playable] = useState(() => {
    if (typeof document === 'undefined' || media.mimeType === '') return true;
    const probe = document.createElement('video');
    return probe.canPlayType(media.mimeType) !== '';
  });

  // `!playable` is the pre-mount verdict and `failed` is the element's own
  // `error`; either way this paints a tile, so the row must stop putting the
  // meta on a scrim that does not exist.
  useEffect(() => {
    if (failed || !playable) onDegrade();
  }, [failed, playable, onDegrade]);

  const claimed = useRef(false);
  useEffect(() => {
    return () => {
      if (claimed.current) playback.release(`video:${media.entryName}`);
      claimed.current = false;
    };
  }, [media.entryName]);

  if (!playable || failed) {
    return (
      <MediaFallback
        tone="broken"
        icon="video"
        title="Video can't be played here"
        fileName={media.fileName}
        byteSize={media.byteSize}
        downloadUrl={url}
      />
    );
  }

  const id = `video:${media.entryName}`;

  return (
    <span className="media-frame media-frame--video" data-kind="video" data-state="ready">
      <video
        ref={videoRef}
        src={url}
        controls={started}
        playsInline
        preload="metadata"
        onPlay={() => {
          setStarted(true);
          claimed.current = true;
          playback.claim(id, () => videoRef.current?.pause());
        }}
        onPause={() => {
          if (claimed.current) playback.release(id);
          claimed.current = false;
        }}
        onEnded={() => {
          if (claimed.current) playback.release(id);
          claimed.current = false;
          setStarted(false);
        }}
        onError={() => setFailed(true)}
      />
      {!started ? (
        <button
          type="button"
          className="media-frame__play"
          aria-label={`Play video, ${label}`}
          onClick={() => {
            const element = videoRef.current;
            if (element) void element.play();
          }}
        >
          <Icon name="play" size={26} />
        </button>
      ) : null}
    </span>
  );
}
