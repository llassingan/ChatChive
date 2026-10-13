/**
 * Sticker body (E5-3; DESIGN §3.8, plan §3.5).
 *
 * A sticker has no bubble: the row keeps the bubble's box for run grouping but
 * loses the fill and the padding (the same treatment `bubble--jumbo` already
 * has), the image caps at 160px on mobile and 190px on web, and the meta becomes
 * the pill below it at the sender's edge, reusing the jumbo pill rules in
 * `MessageRow.css`.
 *
 * An animated WebP plays by itself: the engine animates the file, so there is
 * nothing to start and nothing to control. It is not a loop the reader asked
 * for, so it carries no `autoplay` attribute - a WebP animation is inline
 * animation media, and the only sticker format the fixtures use is one the
 * engines animate without a media element.
 *
 * A sticker has no failure copy worth its own sentence: if the bytes will not
 * decode, the shared fallback says so and offers the file, exactly as it does
 * for a photo (§3.3).
 */
import { useState } from 'react';
import type { MediaRef } from '../../../types/chat.ts';
import { MediaFallback } from './MediaFallback.tsx';

export interface StickerBodyProps {
  media: MediaRef;
  url: string;
}

export function StickerBody({ media, url }: StickerBodyProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <MediaFallback
        tone="broken"
        icon="sticker"
        title="Sticker can't be shown here"
        fileName={media.fileName}
        byteSize={media.byteSize}
        downloadUrl={url}
      />
    );
  }

  return (
    <span className="sticker" data-state="ready">
      <img src={url} alt="" onError={() => setFailed(true)} />
    </span>
  );
}
