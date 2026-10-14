/**
 * Bubble tails (backlog E4-3, DESIGN.md §3.2, §6).
 *
 * Original artwork, drawn here rather than copied: an 8x13 shape matching the
 * bubble edge. Mobile uses a bottom swoosh on the last bubble of a run; web uses
 * a top nub on the first. `fill="currentColor"` lets CSS hand it the bubble
 * color, so one component serves incoming and outgoing, both breakpoints.
 */
export interface TailProps {
  /** Which corner the run's tail grows from. */
  corner: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

const PATHS: Record<TailProps['corner'], string> = {
  // Swoosh (mobile, bottom corner): the flat edge is the whole right side
  // (`x=8`, the `V0Z` closing line), so the shape welds to the 13px squared
  // corner rather than hanging off it (Sprint 7 BUG-2). The curve leaves the
  // top of that edge and sweeps out to the outer bottom tip.
  'bottom-left': 'M8 0V13C3.4 12.2 0.9 8.4 0 2.6Z',
  'bottom-right': 'M0 0V13C4.6 12.2 7.1 8.4 8 2.6Z',
  // Nub (web, top corner): the flat edge is `y=0` across the full width, welded
  // to the squared top corner, tapering down to a point at the outer bottom.
  'top-left': 'M0 0H8V13C4.8 9.4 2 5.2 0 0Z',
  'top-right': 'M0 0H8V13C3.2 9.4 6 5.2 8 0Z',
};

export function Tail({ corner }: TailProps) {
  return (
    <svg
      className="tail__shape"
      width="8"
      height="13"
      viewBox="0 0 8 13"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[corner]} fill="currentColor" />
    </svg>
  );
}
