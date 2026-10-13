/*
  Local inline-SVG icons. DESIGN §1.5: outline set, ~1.75-2px stroke, rounded
  caps. These are inlined as React elements, so they ship inside the app bundle
  with no CDN, no icon font and no remote fetch, which the privacy CSP (PRD S-2)
  requires. Add glyphs here as the UI needs them; the full §1.5 list lands with
  the components that use each one.

  Each path draws on a 24x24 grid. `currentColor` lets the icon inherit the
  surrounding text/icon color token, so a single component serves every tint.
*/
import type { SVGProps } from 'react';

export type IconName =
  | 'chevron-left'
  | 'chevron-down'
  | 'search'
  | 'send'
  | 'close'
  | 'file'
  | 'check'
  | 'alert'
  | 'more-vertical'
  | 'lock'
  | 'ban'
  | 'photo'
  | 'video'
  | 'sticker'
  | 'mic'
  | 'pin'
  | 'person'
  | 'people'
  | 'play'
  | 'pause'
  | 'download';

const PATHS: Record<IconName, string> = {
  'chevron-left': 'M15 5 8 12l7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4',
  send: 'M4 12 20 4l-4 16-4.5-6.5L4 12Z',
  close: 'M6 6l12 12M18 6 6 18',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
  check: 'M5 12.5 10 17.5 19 6.5',
  alert: 'M12 3.5 21 20H3l9-16.5ZM12 10v4M12 17.2v.2',
  // The chat header's overflow menu, and the E2E marker's lock (DESIGN §3.6).
  'more-vertical': 'M12 5.5v.2M12 12v.2M12 18.5v.2',
  lock: 'M6 10.5h12v9.5H6V10.5ZM9 10.5V7.5a3 3 0 0 1 6 0v3',
  // Deleted-message marker: the crossed circle DESIGN §3.14 shows.
  ban: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM6 6l12 12',
  // One icon per MediaKind, for the "not included in export" placeholders
  // (F-VIEW-12). Each is the shape of the thing it stands for.
  photo: 'M3.5 5.5h17v13h-17v-13ZM3.5 15l4.5-4 4 3.5 3.5-3 5 4.5M15.5 9.2v.2',
  video: 'M3.5 6.5h11v11h-11v-11ZM14.5 11l6-3.5v9l-6-3.5Z',
  // Folded-corner square: the sticker/note shape (DESIGN §1.5 "sticker").
  sticker: 'M4 4h11l5 5v11H4V4ZM15 4v5h5',
  mic: 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  person: 'M12 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6',
  people:
    'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11ZM2.5 20c0-3.2 2.9-5.4 6.5-5.4s6.5 2.2 6.5 5.4M16 5.2a3.2 3.2 0 0 1 0 6M17.5 14.9c2.4.5 4 2.2 4 5.1',
  // Media controls (E5-2, E5-4): play/pause for the video overlay and the voice
  // player, download for a document and for a file whose bytes will not decode.
  play: 'M8.5 5.2v13.6l10.5-6.8-10.5-6.8Z',
  pause: 'M9.5 5v14M14.5 5v14',
  download: 'M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 20.5h15',
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size for width and height. Defaults to 24 (DESIGN §1.5 header size). */
  size?: number;
  /**
   * Accessible name. Omit for decorative icons (then the icon is hidden from
   * assistive tech). An icon button that has no visible text label must set this
   * so screen-reader users get the action name (DESIGN §5, R-32).
   */
  title?: string;
}

export function Icon({ name, size = 24, title, ...rest }: IconProps) {
  const decorative = title === undefined;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
      {...rest}
    >
      {title !== undefined ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
