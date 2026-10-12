# src/ui/chat: the chat view

The message view (backlog E4). It consumes a parsed `Chat` from the import flow
and renders bubbles, runs, avatars and date separators. Owned by the frontend
track.

| File              | What                                                                                    | Requirement            |
| ----------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| `layout.ts`       | Pure pass that turns `Chat.messages` into flat rows with run/day flags                  | E4-2, E4-3, E4-5       |
| `ChatView.tsx`    | Screen shell: header (back, avatar, title, menu), message list, read-only footer        | E4-1, E3-4, F-RES-5    |
| `MessageList.tsx` | Virtualized list, opens at the newest message, scroll-to-bottom button, sticky day pill | E4-1, F-VIEW-13, E4-5  |
| `MessageRow.tsx`  | One row: bubble, meta, tail, sender header, avatar, or a system/empty/deleted row       | E4-2, E4-3, E4-4, E4-7 |
| `MePicker.tsx`    | "Which one is you?", reusing the shared `Dialog`                                        | E3-4, F-NAV-1          |
| `Tail.tsx`        | The bubble swoosh (mobile, bottom) and nub (web, top) from `DESIGN.md` §3.2             | E4-3                   |

## Why the layout is a separate pure module

The renderer needs run boundaries and day boundaries. Deriving them inside a row
component would repeat the work on every scroll frame of a 100k-message chat
(PRD §9), so `buildRows` computes them once into a flat list the virtualizer
addresses by index. It is pure, so the run rules are unit-tested directly.

## Scrolling a big chat at 60 fps

Only the visible window plus overscan is in the DOM, but that alone was not
enough: on a 100k-message export the scroll cost about 78 ms per frame, which is
about 13 fps, and the cause was a re-render of every mounted row per scroll
event. Two changes fixed it, and both are load-bearing:

- `MessageList` runs its scroll bookkeeping (which re-renders the list to move
  the sticky pill and toggle the jump button) at most once per animation frame. A
  scroll gesture fires several events per frame, and the guard is cleared _after_
  the pass, not before: clearing it up front let the scroll events the pass itself
  triggers re-enter it.
- `MessageRow` is wrapped in `memo`. Every prop is a primitive or a stable
  reference, so once the list re-renders for the sticky pill the mounted rows skip
  the work entirely.

`tests/e2e/perf.spec.ts` guards this. It generates a 100k-message export into a
temp directory at run time (a 13 MB fixture does not belong in the repository),
asserts the DOM stays under 60 rows, and asserts the scroll frame cost stays
within 2.5x this machine's own idle frame rate. The relative budget means a loaded
CI runner does not fail a healthy build, while the regression above (about 4.6x
idle) still fails loudly.

## Opening at the newest message

The list pins itself to the bottom for a burst of frames after mount, because row
measurement and the list's own padding settle over several frames (`scrollToIndex`
with `align: 'end'` left it a few px short in WebKit). The burst releases on any
real input (wheel, touch, pointer, key) or after `PIN_FRAMES`, so it never fights
the reader. It deliberately does not release on a bare scroll event: the browser
fires those while the list is still settling, and yielding to them abandoned the
jump before it arrived.

## Alignment

`outgoing` comes from the parser's `guessedMeId`. The chat view re-derives it
with `alignToMe` (`src/parser/me.ts`) when the user answers "Which one is you?",
which is pure and needs no re-parse. A personal chat's filename already names
the other person, so the guess is applied without asking; a group has no such
signal, so the picker opens on arrival. "Change who you are" in the header menu
reopens it.

## Not in this sprint

- Formatting (`*bold*`, links, jumbo emoji) is E4-6, next sprint. Message text is
  currently a plain React text node, which is also the S-5 guarantee.
- Media renders as a labeled tile reporting the file the parser found: the real
  filename, the kind and the size for a resolved reference, and
  "<Kind> not included in export" plus the filename for one the archive lacks
  (F-VIEW-12). The image, video and audio player arrive with E5 (E5-2/E5-4).
  Nothing is faked: the tile never draws a preview it does not have.

## Forward button, reactions, replies

`DESIGN.md` shows a forward button beside media and large link previews. Those
are E5/E7 and are not drawn here, so no dead control ships (R-26).
