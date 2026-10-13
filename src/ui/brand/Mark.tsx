/*
  The ChatChive brand mark (Sprint 6, E1-5). Chosen by the project owner from
  four candidates; see `README.md` for the idea and the constraint check.

  Inlined as a React element rather than loaded as an `.svg` file, which is the
  same treatment as the icon set and the wallpaper: a separate file would be a
  request after the app shell loads, and PRD S-2 promises there are none.
  `currentColor` lets the caller set the tint from a token, so one component
  serves the accent-filled tile and any future bare placement.
*/
import type { SVGProps } from 'react';

export type MarkProps = Omit<SVGProps<SVGSVGElement>, 'viewBox'> & {
  /** Pixel size for width and height. 24 matches the icon grid. */
  size?: number;
};

export function Mark({ size = 24, ...rest }: MarkProps) {
  // Decorative by default: the mark always sits beside the ChatChive wordmark,
  // so naming it would make a heading announce the name twice. Callers that
  // place it without the wordmark should pass `role="img"` and `aria-label`.
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
      aria-hidden="true"
      {...rest}
    >
      {/* Bubble body: rounded rectangle, x 3.5..20.5, y 2.75..13.75 */}
      <path d="M8 2.75h8a4.5 4.5 0 0 1 4.5 4.5v2a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 9.25V7.25A4.5 4.5 0 0 1 8 2.75Z" />
      {/* Leaf tail, hanging off the bubble base and leaning left */}
      <path d="M10.2 13.35Q3.43 14.4 3.8 21.25Q9.02 18.94 10.2 13.35Z" />
    </svg>
  );
}
