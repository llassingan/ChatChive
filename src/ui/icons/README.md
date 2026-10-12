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

Added for the chat view (E4): `more-vertical` and `lock` (the header menu and the encryption
notice), and the media-kind glyphs `photo`, `video`, `sticker`, `mic`, `pin`, `person`, `people`
and `ban`. Each kind gets its own label, and a glyph where one fits: `video` covers both video
and GIF (the same shape says "moving picture"), and `mic` covers both voice note and audio. So a
media tile is identifiable at a glance without reading its label (DESIGN §1.5). Every glyph
added this sprint has a consumer; `search` is the one glyph in the registry with none, carried
over from the Sprint 1 starter set and reserved for E7-1 (search in chat). The E5 `play` and
download glyphs are not in the registry for that reason: they land with their controls (R-26).
