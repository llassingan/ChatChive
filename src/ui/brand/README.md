# src/ui/brand: the ChatChive mark

The project's own visual identity, kept apart from `icons/` because an icon
represents a thing in the UI and a brand mark represents the product.

- `Mark.tsx`: the mark, rendered as an `<img>` of the artwork the app serves at
  `public/icon.svg`.

## Sprint 7: the owner's artwork replaces the drawn mark

The Sprint 6 mark was a hand-drawn 24×24 stroke bubble with a leaf tail, chosen
from four candidates. In Sprint 7 the project owner supplied the product's own
artwork and asked for it to be the app icon everywhere. It is used **as-is**; the
drawn mark is gone.

What the file is, because it shapes every decision around it: `public/icon.svg`
is a **VTracer raster trace** (its own comment names the generator). It is a
470×394 canvas holding a ~352×355 square emblem, 237 `<path>` elements, ~116 KB,
with one path per near-identical colour fragment — a bitmap traced to vectors,
not vector artwork drawn by hand. It has a **transparent background** (no
background path or rect), so it is the emblem alone, not an emblem on a tile.

### What was changed, and what was not

- **Added a `viewBox`.** The file shipped with `width="470" height="394"` and no
  `viewBox`, so it could not scale: at any size other than 470px wide it would
  crop or letterbox. `viewBox="0 0 470 394"` was added in place; the paths are
  otherwise untouched.
- **Served it, did not inline it.** At ~116 KB it is far too heavy to inline into
  the shell, and too heavy for a `data:` favicon. It lives in `public/icon.svg`
  and is fetched once from our own origin, then cached.

### The no-network promise (PRD §8 S-2)

The promise is that nothing leaves the device _after the shell loads_. The icon
is part of the shell: it is same-origin, requested once during initial load, and
covered by the browser cache. The e2e `no-network.spec.ts` starts watching for
requests only after `networkidle`, so the icon does not count and does not have
to. This is the one place where the old "no request at all" inline-favicon rule
was deliberately relaxed, because the owner asked for the artwork as-is.

### Where it appears

- `public/icon.svg` — the file itself.
- `index.html` — `rel="icon"` and `rel="apple-touch-icon"` both point at it.
- `Mark.tsx` — an `<img src="<base>icon.svg">`, used by the landing brand.

### Backing

Because the artwork is transparent, it must sit on a background that its dark
greens and pale highlights both read against. `.landing__mark` paints
`--accent-strong` behind it, so the emblem reads on the landing page in both app
themes. A bare placement elsewhere would need its own backing.

## Constraint check

`DESIGN.md` §6 and PRD §11 require original artwork and forbid using WhatsApp's
name or logo. The owner's mark is their own artwork; it carries no telephone
handset and no green disc with a WhatsApp glyph inside it.
