/**
 * Document tile and download (E5-6; DESIGN §3.15, plan §3.5).
 *
 * The tile is the existing `--card-inner` row extended with the extension tile,
 * the filename, `EXT · size` and the download control. A document is never
 * "decoded": the bytes are the file, so this renders on `status === 'ready'` and
 * there is no error branch beyond the archive having nothing to hand over
 * (§3.3).
 *
 * The four tile colors live in `media.css` as local values, not in
 * `tokens.css`, because exactly one rule set uses them - and the PDF red is not
 * DESIGN's own value: `#E2574C` measures 3.68:1 with white 10px 700 on it, a
 * fail, so the tile uses `#C0392B` at 5.44:1 (plan §4.2).
 *
 * The download is a real `<a download>` on the `blob:` URL, which was measured
 * to work in both engines under the app's real CSP (§3.8): it is same-document,
 * so the no-network promise holds.
 */
import { formatBytes } from '../../format.ts';
import type { MediaRef } from '../../../types/chat.ts';
import { Icon } from '../../icons/index.ts';

export interface DocumentBodyProps {
  media: MediaRef;
  url: string;
}

/** The tile's three-letter label: the extension, uppercased. */
function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,4})$/.exec(fileName);
  return match ? match[1].toUpperCase() : 'FILE';
}

/**
 * DESIGN §3.15's four colors, with the PDF value corrected to clear AA. The
 * selector is a data attribute so no class name carries a hex string and the
 * three passing DESIGN values stay readable next to their measured ratios.
 */
function toneOf(extension: string): string {
  switch (extension) {
    case 'PDF':
      return 'pdf';
    case 'DOC':
    case 'DOCX':
      return 'doc';
    case 'XLS':
    case 'XLSX':
      return 'xls';
    default:
      return 'other';
  }
}

export function DocumentBody({ media, url }: DocumentBodyProps) {
  const extension = extensionOf(media.fileName);
  const size = formatBytes(media.byteSize);
  const detail = size ? `${extension} \u00b7 ${size}` : extension;

  return (
    <span className="media media--document">
      <span className="doc-tile" data-tone={toneOf(extension)} aria-hidden="true">
        {extension}
      </span>
      <span className="media__text">
        <span className="media__title">{media.fileName}</span>
        <span className="media__sub">{detail}</span>
      </span>
      <a
        className="media__download"
        href={url}
        download={media.fileName}
        aria-label={`Download ${media.fileName}`}
      >
        <Icon name="download" size={20} />
      </a>
    </span>
  );
}
