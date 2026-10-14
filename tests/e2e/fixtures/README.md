# tests/e2e/fixtures: synthetic exports for browser tests

Small, hand-built stand-ins for real WhatsApp exports, used by the end-to-end
tests. Nothing here is personal data (backlog E2-1 forbids committing the real
sample export).

| File                   | Shape                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `export.zip`           | Android personal chat with a `.txt` + an image + a voice note                                                      |
| `media.zip`            | One entry per media kind this sprint renders, plus a junk audio file and a missing one                             |
| `broken-image.zip`     | One uncaptioned JPEG whose bytes will not decode, for the tile's hit test (E5-7)                                   |
| `sprint7-bugs.zip`     | Interleaved multi-message runs and one empty body (`Sender:` with nothing after it), for the Sprint 7 defect specs |
| `export.txt`           | Android text-only chat, no media, no zip                                                                           |
| `large.txt`            | 5,001 messages over three days, for the virtualization check (E4-1)                                                |
| `script-injection.txt` | Message bodies carrying `<script>` and `<img onerror>`, for the S-5 test                                           |
| `formatting.txt`       | Every inline marker, block code, quote, both list kinds, links and jumbo emoji (E4-6)                              |

`export.zip` also carries the E6-4 visual baselines (`tests/e2e/visual.spec.ts`),
which is why it holds real media rather than text alone: the baselines cover a
decoded image and a voice player, not just bubbles. One fixture for both keeps
the two suites from drifting onto different shapes of chat.

Both `.zip`s are hand-built (plain DEFLATE archives), and their media bytes are
real and decodable, because E5 renders them: `export.zip` carries a 400x300 JPEG
and a 1.0 s Ogg Opus, and `media.zip` carries one entry per kind (see below).
The one exception is `AUDIO-20260706-WA0008.mp3` inside `media.zip`, which is junk
bytes on purpose: it is the "Can't play here" path. Every fixture is read by the
real parser running in a Web Worker, so these tests cover the full pipeline in a
browser, not a mock.

`media.zip` is generated with the `ffmpeg` 6.1.1 commands recorded in
`.trash/sprint5-scratch/tyrion/` (images, VP8 WebM, animated WebP, Opus, MP3),
except the PDF, which is hand-written and validated for xref offsets, and the
junk MP3. Its chat text references `IMG-20260707-WA0009.jpg`, which is deliberately
not in the archive: that is the "not included in export" path. No `.gif` name
appears in it, because `mediaKindFor` classifies any name containing `GIF` as a
GIF, and no MP4 appears anywhere, because Playwright's bundled Chromium has no
H.264 and an mp4 fixture would fail for a reason that says nothing about the app.

`broken-image.zip` is the deliberate opposite: a single uncaptioned JPEG that
carries the SOI marker so the parser classifies it as a photo, then junk bytes,
so every engine's decoder rejects it. It is the fixture for the tile state that
exists _after_ a successful extraction, which is where the meta scrim must not
be applied: the Download control underneath it would be unclickable.

`large.txt` is generated, not hand-written: its dates use a month over 12 so the
date order is unambiguous and the export never stops at the date prompt, and its
message count is high enough that only a window can be in the DOM. All content is
invented, and no real export is ever committed here.

`formatting.txt` is the E4-6 fixture: one message per marker, then the shapes
that interact, a mixed message carrying long inline text, a URL, a fenced block
and a list at once, and the jumbo-emoji boundary (1, 3 and 4 emoji, where only
the first two are jumbo). Its dates use month `07` for the same reason
`large.txt`'s do.
