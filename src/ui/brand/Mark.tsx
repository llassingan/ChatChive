/*
  The ChatChive brand mark.

  Sprint 7: the project owner supplied the product's artwork (`icon.svg`, a
  VTracer raster trace of the mark) and asked for it to be the app's icon
  everywhere. This component now renders that artwork as-is, as an `<img>`
  pointing at the file the app serves from `public/icon.svg`, so the whole app
  (tab, home-screen icon, landing brand) shows one identical image.

  It is NOT inlined and NOT redrawn: at 145 KB the trace is far too heavy to
  inline into the shell (PRD §8 S-2), and the owner asked for the artwork
  unchanged. The file is fetched once from our own origin and cached; that
  fetch is part of the initial shell load, before the no-network window opens.

  Because the artwork is multi-colour, this component no longer takes
  `currentColor` or the old 24×24 stroke geometry (that was the Sprint 6 mark,
  chosen from four candidates; see `README.md`).
*/
import type { ImgHTMLAttributes } from 'react';

export type MarkProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> & {
  /** Pixel size for width and height. 24 matches the icon grid. */
  size?: number;
};

export function Mark({ size = 24, alt = '', ...rest }: MarkProps) {
  // Decorative by default (`alt=""`): the mark always sits beside the ChatChive
  // wordmark, so naming it would make a heading announce the name twice. Callers
  // that place it without the wordmark should pass a real `alt`.
  // `/icon.svg` (root-absolute public path), not a relative `./icon.svg`: a
  // relative path would be resolved by the bundler from this file's directory
  // and re-emitted as a hashed copy, duplicating the 145 KB the public file
  // already serves. The app is served with a relative base (`vite.config.ts`),
  // so resolve it against the page's base at render time; `import.meta.env.BASE_URL`
  // is `./` in dev and the deploy sub-path in a build.
  const src = `${import.meta.env.BASE_URL}icon.svg`;
  return <img src={src} width={size} height={size} alt={alt} {...rest} />;
}
