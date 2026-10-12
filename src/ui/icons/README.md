# src/ui/icons: local inline-SVG icons

The app's icon set, inlined as React SVG elements (`Icon.tsx`). Bundled with the app, so
there is no CDN, no icon font and no remote fetch, which the privacy CSP (PRD §8 S-2)
requires. Icons draw on a 24×24 grid and use `currentColor`, so one component inherits any
color token (`--icon`, `--accent`, `--text-secondary`, …).

- `Icon.tsx`: the `<Icon name size title />` component and the `IconName` registry.
- `index.ts`: barrel re-export.

Usage: pass `title` for an icon-only button (accessible name, R-32); omit it for a decorative
icon (then it is hidden from assistive tech). Add glyphs to the `PATHS` map as components need
them; the full glyph list is in `DESIGN.md` §1.5.

Added for the import flow (E3): `file` (the drop zone, since the target is a file export, not
a folder), `close` (dialog dismissal), `check` (a parse that succeeded) and `alert` (an error
state). Each is used at exactly one meaning, so the set stays legible.
