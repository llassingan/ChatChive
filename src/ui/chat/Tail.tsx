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
  // Swoosh: leaves the bottom edge and curves out to the outer side.
  'bottom-left': 'M8 0C8 5.5 6.2 10.4 0 13V0Z',
  'bottom-right': 'M0 0C0 5.5 1.8 10.4 8 13V0Z',
  // Nub: a sharp triangle at the top outer corner.
  'top-left': 'M8 13C4.5 9.2 2.4 5 0 0H8Z',
  'top-right': 'M0 13C3.5 9.2 5.6 5 8 0H0Z',
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
