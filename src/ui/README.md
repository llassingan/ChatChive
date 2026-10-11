# src/ui — view layer

The React view layer. Styled from the design tokens and component specs in `DESIGN.md`.
Consumes the shared data model from `src/types`. Owned by the frontend track.

- `App.tsx` / `App.css` — app shell (placeholder; the landing page, drop zone and chat
  view arrive in backlog E3/E4/E6). It currently proves the tokens and icons resolve.
- `styles/tokens.css` — design tokens (E1-2). The single source for color, type, spacing,
  radius and size. Imported by `global.css`.
- `styles/global.css` — resets plus token wiring. Keep app styling out of here; it lives
  with each component.
- `icons/` — local inline-SVG icon set (E1-2).

Rule: message text is rendered as React text nodes, never as HTML (PRD S-5).

## Design tokens (E1-2)

`styles/tokens.css` ports `DESIGN.md` §1. Everything is a CSS custom property so themes
switch with one attribute and OS font-scaling works (type sizes are `rem`).

Themes, selected by an attribute on `<html>`:

| Selector                 | Theme                               | Source                                |
| ------------------------ | ----------------------------------- | ------------------------------------- |
| `:root`                  | Dark (2024+ redesign) — the default | `DESIGN.md` §1.1 dark column          |
| `[data-theme='light']`   | Light                               | `DESIGN.md` §1.1 theme-variants table |
| `[data-theme='classic']` | Classic dark (pre-2024 blue-grey)   | same table                            |

Web/desktop surface, radius, size and type overrides apply at `min-width: 768px` on each
theme, matching the "Web" columns in `DESIGN.md` §1.1/§1.3/§1.4. The bubble, text and accent
colors are shared across mobile and web; only the surrounding surfaces change.

Token groups: surfaces (`--bg-*`), bubbles/quotes (`--bubble-*`, `--quote-*`, `--card-inner`),
text (`--text-primary|secondary|tertiary`), accents/status (`--accent`, `--tick-read`,
`--danger`, `--mention`), pills/fabs/dividers/badges, typography (`--font-ui`, `--font-emoji`,
`--fs-*`, `--lh-*`, `--fw-*`), spacing (`--space-1..8`), radius (`--radius-*`), sizes
(`--size-*`, `--bubble-max`, etc.), focus ring (`--focus-ring`), and the 16 sender-name colors
(`--sender-0 .. --sender-15`, DESIGN §1.2) as an indexable set for the group-member hash.

### Icons

Icons are local inline SVG (`icons/Icon.tsx`), inlined into the bundle. No CDN, no icon font,
no remote fetch, which the privacy CSP (PRD S-2) requires. `<Icon name="..." />` draws on a
24×24 grid using `currentColor`, so one component inherits any color token. A `title` prop
gives an accessible name for icon-only buttons (R-32); omitting it marks the icon decorative.
The pattern is established with a starter set (`chevron-left`, `chevron-down`, `search`,
`send`); the full `DESIGN.md` §1.5 glyph list is added as the components that use each one land.

### Fonts

System font stack only (`DESIGN.md` §1.3), set in `--font-ui`. No web fonts, no Google Fonts,
no `font-src` to any third party (PRD S-2). This keeps the no-network promise and avoids a
layout shift on first paint.

## Privacy and CSP (E1-3)

The Content-Security-Policy lives in a `<meta http-equiv>` in `index.html` and satisfies
PRD §8 S-2 exactly:

```
default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'
```

`frame-ancestors 'none'` is intentionally omitted from the meta tag: browsers ignore
`frame-ancestors` delivered via `<meta>` and log a console error for it. It is enforced only
in the response-header mirror below (which is also where the real clickjacking guard lives).

- `blob:`/`data:` on `img-src`/`media-src` are for the in-browser media the viewer builds from
  the zip (`blob:` object URLs, `data:` for small inlined assets). They are same-document, not
  network origins, so the no-network promise holds.
- `style-src` allows `'unsafe-inline'` because Vite injects component CSS as inline `<style>`.
  No remote stylesheet is ever requested.
- No third-party script, font, CDN, analytics or error reporting anywhere (S-1, S-2). Links are
  rendered plain and never prefetched (S-3). Message text is rendered as text, never HTML (S-5).

### CSP host-header mirror (for E1-4 deploy)

A meta-tag CSP cannot carry `frame-ancestors` (browsers ignore it outside a response header).
The static host must therefore mirror the policy as an HTTP response header and add the
clickjacking guard that only works as a header:

```
Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
X-Frame-Options: DENY
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

On Cloudflare Pages / Netlify this goes in a `_headers` file; on GitHub Pages (no custom
headers) front it with a worker/proxy or document the limitation. This is a deploy-story
(E1-4) task; it is recorded here so it is not lost.

## Accessibility: contrast log (R-25)

Verified with `.kiro/skills/antislop-human/contrast-check.py`. `--text-secondary` is the
timestamp/subtitle color at 11–12px (normal text, needs 4.5:1); `DESIGN.md` §5 flags it on
`--bubble-out`. Composited rgba values were flattened over their background before checking.

| Theme   | Pair                                           | Ratio | Normal (4.5:1) |
| ------- | ---------------------------------------------- | ----- | -------------- |
| Dark    | `--text-primary` on `--bubble-out`             | 9.78  | PASS           |
| Dark    | `--text-secondary` (0.65) on `--bubble-out`    | 5.17  | PASS           |
| Dark    | `--text-secondary` (0.65) on `--bubble-in`     | ≥6.4  | PASS           |
| Dark    | `--accent` on `--bg-chat`                      | 8.23  | PASS           |
| Light   | `--text-primary` on `--bubble-out`             | 15.75 | PASS           |
| Light   | `--text-secondary` `#54646D` on `--bubble-out` | 5.54  | PASS           |
| Light   | `--text-secondary` `#54646D` on `--bg-chat`    | 5.13  | PASS           |
| Classic | `--text-primary` on `--bubble-out`             | 6.77  | PASS           |
| Classic | `--text-secondary` `#C0CED6` on `--bubble-out` | 4.95  | PASS           |

Deliberate deviations from the raw `DESIGN.md` values, to clear AA:

- Dark secondary uses opacity `0.65` (not `0.60`); `DESIGN.md` §5 explicitly permits this.
  At `0.60` it is 4.65:1, which passes but with no margin.
- Light secondary is `#54646D`, darkened from WhatsApp's `#667781` (which is 4.19:1 on
  bubble-out and 3.88:1 on bg-chat, both failing for 12px text).
- Classic secondary is `#C0CED6`, lightened from `#8696A0` (which is 2.61:1 on bubble-out,
  failing).

Known limitations carried forward (not blocking E1-2/E1-3):

- `--text-tertiary` is the composer placeholder only ("Type a message"), ~3.8:1. It is
  low-emphasis non-essential text and mirrors WhatsApp. The composer story (E6-1) should pair
  it with a visible label, or bump it if used for anything load-bearing.
- `--accent` as a link color inside `--bubble-out` is ~4.1:1 (fails normal text). The
  message-formatting story (E4-6) must handle in-bubble link contrast (e.g. underline + a
  darker link token), not E1-2.
