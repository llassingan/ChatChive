/**
 * Image and GIF body (E5-2; DESIGN §3.7, plan §3.4).
 *
 * Space is reserved before the bytes arrive: the frame is 4:3 until the element
 * reports its real ratio, then the ratio is `naturalWidth / naturalHeight`. The
 * height clamp is CSS (100 to 440px), and the image is `object-fit: cover`
 * inside the frame, so a 200x1500 photo crops to the clamp instead of stretching
 * the bubble.
 *
 * An image is not a control: it is not a link and it does not open a viewer
 * (E5-9 is out of this sprint), so it stays inside the row's `aria-hidden` body
 * and carries `alt=""`.
 */
import { useEffect, useState } from 'react';
import type { MediaRef } from '../../../types/chat.ts';
import { MediaFallback } from './MediaFallback.tsx';

export interface ImageBodyProps {
  /** The parser's reference, a stable object off the message. */
  media: MediaRef;
  /** The `blob:` URL the store created for this entry. */
  url: string;
  /**
   * The bytes did not decode, so this painted a tile rather than a frame. The
   * row needs it because it gates the meta scrim on what was actually painted,
   * and `ready` only says the bytes were extracted (see `./shape.ts`).
   */
  onDegrade: () => void;
}

export function ImageBody({ media, url, onDegrade }: ImageBodyProps) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Told once, on the transition: `onDegrade` is a stable callback, and the
  // effect depends on the flag so a re-render does not repeat the report.
  useEffect(() => {
    if (failed) onDegrade();
  }, [failed, onDegrade]);

  if (failed) {
    // The bytes are in hand and will not decode, so the tile can still offer
    // them as a download (§3.3).
    return (
      <MediaFallback
        tone="broken"
        icon="photo"
        title="Photo can't be shown here"
        fileName={media.fileName}
        byteSize={media.byteSize}
        downloadUrl={url}
      />
    );
  }

  return (
    <span
      className="media-frame media-frame--image"
      data-kind={media.kind}
      data-state="ready"
      style={{ aspectRatio: ratio ?? 4 / 3 }}
    >
      <img
        src={url}
        alt=""
        onLoad={(event) => {
          const element = event.currentTarget;
          if (element.naturalWidth > 0 && element.naturalHeight > 0) {
            setRatio(element.naturalWidth / element.naturalHeight);
          }
        }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
