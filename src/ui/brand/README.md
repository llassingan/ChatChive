# src/ui/brand: the ChatChive mark

The project's own visual identity, kept apart from `icons/` because an icon
represents a thing in the UI and a brand mark represents the product.

- `Mark.tsx`: the mark, inlined as a React element. Chosen by the project owner
  in Sprint 6 from four candidates (`SPRINT-6-PLAN.MD` Track D).

## The idea

A speech bubble whose tail is a chive leaf. It carries both halves of the name in
one shape: a conversation, and the chive. The tail sits where the eye already
expects a tail to be, so the shape reads at a glance and the leaf is what makes it
this product's bubble rather than anyone's.

## Constraint check

`DESIGN.md` §6 and PRD §11 require original artwork and forbid using WhatsApp's
name or logo. The mark therefore has:

- no telephone handset and no phone receiver;
- no green disc with a white glyph inside it;
- a leaf-shaped tail, not WhatsApp's angular nub.

## Drawing rules

Same hand as everything else the project draws (`DESIGN.md` §1.5, the icon set and
the wallpaper): a 24×24 grid, 2px stroke, round caps and joins, no fill, one
colour from `currentColor`. Adding a second visual language for the logo is what
this section exists to prevent.

Measured, not assumed: the ink bounding box is centred on (12, 12), so the mark
sits square in whatever box holds it, and no ink falls outside the viewBox.

## Colour

`currentColor`, so the caller sets it. On the landing page the mark sits inside
`.landing__mark`, which paints `--accent-strong` and sets `--accent-on` for the
glyph (8.23:1 dark, 4.89:1 light, both clearing the 3:1 floor for a graphical
object). A bare mark on a light page must use `--accent-text` (`#05603A`, 6.40:1);
`--accent` (`#1DAA61`) measures 2.51:1 there and fails.

## The favicon

`index.html` carries the same geometry as an inline `data:` URI, so the icon costs
no request. It has to be kept in step by hand: if the mark's paths change here,
change them there too.
