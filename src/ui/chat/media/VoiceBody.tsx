/**
 * Voice note and audio player (E5-4; DESIGN §3.12, plan §3.2, §4.1, §4.6).
 *
 * Real controls with real effects: play/pause, a seek slider, the elapsed time
 * and the total. What is not drawn: the speed pill (`1x`/`1.5x`/`2x` is not in
 * E5-4's criteria), the mic glyph on the avatar (decorative, and `--accent` on
 * the light bubbles measures under 3:1, so it would fail 1.4.11), reaction
 * pills, and the sender avatar itself (this row uses the row's normal avatar,
 * which nothing overlaps).
 *
 * The waveform is 45 uniform bars, not DESIGN's varied heights: E5-5 owns the
 * real waveform and a varied height would claim an amplitude reading no export
 * carries. Played bars are `--wave-played`, unplayed are `--text-secondary`,
 * both measured per theme in `src/ui/README.md`; the split is not color-only,
 * because the playhead knob sits at the boundary and the elapsed time updates
 * (WCAG 1.4.1).
 *
 * The seek control is a real `<input type="range">` layered transparently over
 * the bars (§4.6): it inherits arrow-key seeking, focus and the focus ring, and
 * carries `aria-valuetext` in DESIGN's `0:03 of 0:06` format.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaRef } from '../../../types/chat.ts';
import { playback } from '../../media/playback.ts';
import { Icon } from '../../icons/index.ts';
import { MediaFallback } from './MediaFallback.tsx';

/** DESIGN §3.12's bar count. Uniform heights, on purpose (§6.2 of the plan). */
const BAR_COUNT = 45;

export interface VoiceBodyProps {
  media: MediaRef;
  url: string;
  /** Names the message in the play button's label, for a screen reader. */
  label: string;
}

/** `0:06`, the export's own clock shape, for a duration rather than a time. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function VoiceBody({ media, url, label }: VoiceBodyProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const [playable] = useState(() => {
    if (typeof document === 'undefined' || media.mimeType === '') return true;
    const probe = document.createElement('audio');
    return probe.canPlayType(media.mimeType) !== '';
  });

  const id = `voice:${media.entryName}`;

  // A row virtualized out of the window unmounts, so its audio stops; that is
  // the honest behaviour for a viewer with no mini-player (§4.5).
  useEffect(() => {
    return () => {
      if (playback.getActiveId() === id) playback.release(id);
    };
  }, [id]);

  // Bars are presentation: `aria-hidden`, and no measurement, so they cost
  // nothing per frame.
  const bars = useMemo(() => Array.from({ length: BAR_COUNT }, (_, index) => index), []);

  if (!playable || failed) {
    return (
      <MediaFallback
        tone="broken"
        icon="mic"
        title="Can't play here"
        fileName={media.fileName}
        byteSize={media.byteSize}
        downloadUrl={url}
      />
    );
  }

  const played = duration > 0 ? Math.min(1, current / duration) : 0;

  return (
    <span className="voice" data-state={playing ? 'playing' : 'idle'}>
      <button
        type="button"
        className="voice__toggle"
        aria-label={playing ? `Pause, ${label}` : `Play, ${label}`}
        onClick={() => {
          const element = audioRef.current;
          if (!element) return;
          if (element.paused) {
            // Claiming pauses whatever held playback before (one player at a
            // time is a page-level fact, §2.3).
            playback.claim(id, () => element.pause());
            // `play()` cannot revive an element whose playback has ended, and
            // that is the state a real listener creates by letting the note
            // finish. WebKit parks it at the end (`ended: true, paused: true`)
            // however it is rewound: it fires `seeking` back to the end with
            // no JavaScript involved, so rewind-then-play cannot work.
            // Measured on the built app, WebKit, reaching the end by playing
            // rather than by seeking:
            //   play() alone                 -> still ended
            //   currentTime = 0, then play() -> still ended
            //   load(), then play()          -> plays (0.502 of 1.0065)
            // So reload the source instead of fighting the engine. The same
            // `blob:` URL is re-read from memory, so this is cheap.
            if (element.ended) {
              element.load();
              // `load()` resets the element to 0, but React's `current` is the
              // value the slider and the elapsed clock render, and it is only
              // refreshed by `timeupdate`. WebKit does not fire one until
              // playback is underway, so without this the slider sits at the
              // end for a tick and the clock reads stale. Reset it here so the
              // UI matches the element the moment the button is pressed.
              setCurrent(0);
            }
            void element.play();
          } else {
            element.pause();
            playback.release(id);
          }
        }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>

      <span className="voice__wave">
        <span className="voice__bars" aria-hidden="true">
          {bars.map((index) => (
            <span
              key={index}
              className="voice__bar"
              data-played={(index + 1) / BAR_COUNT <= played ? 'true' : 'false'}
            />
          ))}
        </span>
        <span className="voice__knob" style={{ left: `${played * 100}%` }} aria-hidden="true" />
        <input
          className="voice__seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          aria-label={`Seek, ${label}`}
          aria-valuetext={`${clock(current)} of ${clock(duration)}`}
          onChange={(event) => {
            const element = audioRef.current;
            const next = Number(event.currentTarget.value);
            setCurrent(next);
            if (element) element.currentTime = next;
          }}
        />
      </span>

      <span className="voice__elapsed" aria-hidden="true">
        {clock(current > 0 ? current : duration)}
      </span>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onEnded={() => {
          playback.release(id);
          setPlaying(false);
        }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
