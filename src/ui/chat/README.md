# src/ui/chat: the chat view

The message view (backlog E4). It consumes a parsed `Chat` from the import flow
and renders bubbles, runs, avatars and date separators. Owned by the frontend
track.

| File                      | What                                                                                                                                                               | Requirement                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `layout.ts`               | Pure pass that turns `Chat.messages` into flat rows with run/day flags                                                                                             | E4-2, E4-3, E4-5           |
| `ChatView.tsx`            | Screen shell: header (back, avatar, title, menu), message list, read-only footer                                                                                   | E4-1, E3-4, F-RES-5        |
| `MessageRow.tsx`          | One row: bubble, meta, tail, sender header, avatar, or a system/empty/deleted row; **dispatches media by kind and store status**, and draws a location's maps link | E4-2, E4-3, E4-4, E4-7, E5 |
| `mediaMeta.ts`            | The kind → icon and label map, shared by the bubble and the shell preview                                                                                          | E4-7, F-VIEW-12            |
| `media/ImageBody.tsx`     | Image and GIF: reserved 4:3 frame, ratio from `naturalWidth / naturalHeight`, height clamp                                                                         | E5-2                       |
| `media/VideoBody.tsx`     | Video: overlay play button, then the native controls; refuses a codec the engine can't demux                                                                       | E5-2                       |
| `media/StickerBody.tsx`   | Sticker: capped image, no bubble (the bubble rule lives in `MessageRow.css`)                                                                                       | E5-3                       |
| `media/VoiceBody.tsx`     | Voice and audio: play/pause, seek slider, elapsed/total, 45 uniform bars                                                                                           | E5-4                       |
| `media/DocumentBody.tsx`  | Document: file-type tile, filename, `EXT · size`, download                                                                                                         | E5-6                       |
| `media/MediaFallback.tsx` | The shared "cannot show" tiles and the static pending box                                                                                                          | E5-7, E5-4                 |
| `media/media.css`         | The bodies' CSS, including the four local document-tile colors                                                                                                     | E5-2, E5-4, E5-6           |
| `media/shape.ts`          | `MediaShape`: what a body painted, so the row knows whether a scrim exists                                                                                         | E5-7                       |
| `MePicker.tsx`            | "Which one is you?", reusing the shared `Dialog`                                                                                                                   | E3-4, F-NAV-1              |
| `Tail.tsx`                | The bubble swoosh (mobile, bottom) and nub (web, top) from `DESIGN.md` §3.2                                                                                        | E4-3                       |

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

## Media (E5)

The store is created once by `MessageList` (`useMemo` on the session) and the
list subscribes to it with `useSyncExternalStore`; the mounted window plus
`overscan: 8` is what asks for extraction, in an effect with no dependency array
whose body is a `Map` lookup per mounted row. A row reads its own entry during
render and passes it down as `mediaEntry`. `MediaEntry` is a stable object per
entry, replaced only when its status changes, so `memo` means a row re-renders
when its own file lands and never when a neighbour's does.

The player and the video both claim `src/ui/media/playback.ts`, so opening a
second one pauses the first, and a row virtualized out of the window unmounts and
releases its claim: a voice note stops when its row leaves the window. That is a
limit, not a bug (there is no mini-player in this sprint).

Media that cannot be shown says which of the three things went wrong, because
they mean different things:

| State                         | What renders                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| not in the export             | "Photo not included in export" + the filename, no control                                                     |
| in the export, won't decode   | "Photo can't be shown here" (video: "Video can't be played here", audio: "Can't play here") + a Download link |
| the archive stopped answering | the same tile as the row above, without the Download link                                                     |

A contact and a location both carry no bytes, so both render the naming tile, but
only the location's URL becomes a link (`target="_blank"` +
`rel="noopener noreferrer"`, the same treatment `FormattedText` gives every
external link). They are decided before the "not in the export" test, because a
location is always `resolved: false`: the parser has the maps URL, not an archive
entry, so reading that flag first would label every location "Location not
included in export" and bury the link.

The row decides the bubble's shape, not CSS: a visual with no caption wears
`bubble--meta-overlay`, which moves the meta onto the frame's scrim, and that is
`MessageRow`'s call rather than a `:has()` in `MessageRow.css` (§3.5). It gates
that class on the shape a body actually painted, and the body reports it up
through `onDegrade`: the store's `ready` means the bytes were extracted, not that
a frame was painted, and a photo whose bytes will not decode or a video whose
codec the engine cannot demux falls back to a tile _after_ extraction. Putting
the meta on that tile lands it over the Download link, which is then unclickable
by pointer. The shape starts at `frame` and only ever settles on `tile`, so a
normal photo never calls the setter and never pays an extra render.

## Not in this sprint

E5 ships a viewer, not a player suite. The following are drawn in `DESIGN.md` and
deliberately not built here, so no dead control ships (R-26):

- The speed pill (`1x`/`1.5x`/`2x`) and the mic glyph on the voice avatar: not in
  E5-4's criteria, and the glyph would fail 1.4.11 on the light bubble.
- The forward button (DESIGN §3.16, no destination), reaction pills (§3.11, E8),
  the album grid (an album is a feature with its own navigation), "Read more"
  (§3.27, E7), and the media viewer / lightbox (§3.39, E5-9).
- The `GIF` badge and the video's duration line on the scrim: the meta's kind
  glyph and the native controls already carry both.
- The map _image_ for a location (a map is a network fetch, which PRD S-2
  forbids). The URL itself is a real link, drawn per §3.2 and listed above: it
  fetches nothing until the user clicks it, and PRD S-3 permits that tab.
- Sent/read ticks: no message renders them today, and this sprint does not
  introduce them. The overlay shows the clock, like every other bubble.
- The real waveform (E5-5): the 45 bars are uniform, because varied heights would
  claim an amplitude reading the export does not carry.
- The contact card (E5-8): a `.vcf` keeps the naming tile.
- The loading shimmer DESIGN §3.7 asks for: MOTION is 1 and the repository has no
  `@keyframes`, so the pending state is a static `--card-inner` box at the
  reserved size.

## The shell (E6-2)

`ChatView` renders the pane of the two-column frame owned by `src/ui/shell/`. It takes a
`pane` prop (required, since the shell is the only render site): the pane is not the whole
viewport any more, so it fills the shell column instead of `100dvh` and goes transparent so
the shell's wallpaper shows through the message area. The header and the footer keep their own
surfaces and cover it in their bands, as `DESIGN.md` §2.2 draws them. Below 768px the shell is
a single column and the pane is the whole screen again.

The header back chevron stays visible at every width (Amendment A1; the plan's §3.5 "web hides
it" is withdrawn). It shares the single `onClose` with the panel row and "Close chat", and
below 768px it is the only back affordance left, since the panel is `display: none` there.
Hiding it at web widths would also drop it from the accessibility tree, turning
`getByRole('button', { name: 'Back' })` into zero matches at Playwright's 1280x720 default.

The shell also owns the history entry the browser Back button consumes
(`import/useHistoryBack.ts`), so the header Back button, the panel row and "Close chat" all
run one close path.
