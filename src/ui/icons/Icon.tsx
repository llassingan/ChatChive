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

export type IconName = 'chevron-left' | 'chevron-down' | 'search' | 'send';

const PATHS: Record<IconName, string> = {
  'chevron-left': 'M15 5 8 12l7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4',
  send: 'M4 12 20 4l-4 16-4.5-6.5L4 12Z',
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
