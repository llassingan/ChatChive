/**
 * The shared "this file is not shown here" tile (E5-7, E5-4; plan §3.3).
 *
 * Copy is the contract. Three different situations wear two different tiles,
 * because each says something different:
 *
 * - not in the export (`media.resolved === false`): "<Kind> not included in
 *   export" plus the filename. There are no bytes, so there is nothing to hand
 *   over and no control: the row keeps its `aria-hidden` body (§3.6).
 * - in the export but not decodable (the element errored): the kind's own
 *   "cannot show" line plus a Download link, because the bytes did come out of
 *   the archive and that is the one thing this tile can still do.
 * - the archive no longer answers (`extract` rejected or returned null): the
 *   same tile as the row above, without the Download link.
 *
 * The same two tiles double as this file's pending state: a media box whose
 * bytes have not arrived is a static `--card-inner` box at the reserved size,
 * never a shimmer (plan §3.4; MOTION 1 and no `@keyframes` in the repository).
 */
import { formatBytes } from '../../format.ts';
import { Icon, type IconName } from '../../icons/index.ts';

export interface MediaFallbackProps {
  /** The kind's glyph, from `MEDIA_META` in `../mediaMeta.ts`. */
  icon: IconName;
  /** The whole sentence, built by the caller so the copy lives in one place. */
  title: string;
  /** The file's name as written in the chat, not the zip entry name. */
  fileName: string;
  /** Uncompressed size, when the zip directory reported one. */
  byteSize?: number | undefined;
  /**
   * The `blob:` URL to hand over. Present only when the bytes are in hand: the
   * "cannot decode" state renders the Download control, the other two do not.
   */
  downloadUrl?: string | undefined;
  /** `missing` is the dashed tile with no bytes; `broken` is the filled one. */
  tone: 'missing' | 'broken';
}

export function MediaFallback({
  icon,
  title,
  fileName,
  byteSize,
  downloadUrl,
  tone,
}: MediaFallbackProps) {
  const size = formatBytes(byteSize);
  return (
    <span className={tone === 'missing' ? 'media media--missing' : 'media media--broken'}>
      <span className="media__glyph">
        <Icon name={icon} size={22} />
      </span>
      <span className="media__text">
        <span className="media__title">{title}</span>
        <span className="media__sub">
          {fileName}
          {size ? ` \u00b7 ${size}` : ''}
        </span>
      </span>
      {downloadUrl ? (
        <a
          className="media__download"
          href={downloadUrl}
          download={fileName}
          aria-label={`Download ${fileName}`}
        >
          <Icon name="download" size={20} />
        </a>
      ) : null}
    </span>
  );
}

/**
 * The pending box: a static `--card-inner` rectangle at the size the real
 * element will take, so nothing moves when the bytes land (§3.4). No shimmer
 * and no `@keyframes`: MOTION is 1.
 *
 * A visual reserves its aspect ratio; the audio kinds and a document have no
 * ratio to reserve and take the reserved height instead, because a zero-height
 * box would still shift the row when the real body replaced it.
 */
export function MediaPending({ kind, ratio }: { kind: string; ratio?: string | undefined }) {
  return (
    <span
      className="media-frame media-frame--pending"
      data-kind={kind}
      data-state="pending"
      {...(ratio === undefined ? {} : { style: { aspectRatio: ratio } })}
    />
  );
}
