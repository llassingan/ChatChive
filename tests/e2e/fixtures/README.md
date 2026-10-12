# tests/e2e/fixtures: synthetic exports for browser tests

Small, hand-built stand-ins for real WhatsApp exports, used by the end-to-end
tests. Nothing here is personal data (backlog E2-1 forbids committing the real
sample export).

| File                   | Shape                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `export.zip`           | Android personal chat with a `.txt` + an image + a voice note                         |
| `export.txt`           | Android text-only chat, no media, no zip                                              |
| `large.txt`            | 5,001 messages over three days, for the virtualization check (E4-1)                   |
| `script-injection.txt` | Message bodies carrying `<script>` and `<img onerror>`, for the S-5 test              |
| `formatting.txt`       | Every inline marker, block code, quote, both list kinds, links and jumbo emoji (E4-6) |

The `.zip` is built by hand (a plain DEFLATE archive). Its media bytes are
fake: nothing renders media yet (backlog E5), the files only have to exist so
the attachment markers resolve. Both fixtures are read by the real parser
running in a Web Worker, so these tests cover the full pipeline in a browser,
not a mock.

`large.txt` is generated, not hand-written: its dates use a month over 12 so the
date order is unambiguous and the export never stops at the date prompt, and its
message count is high enough that only a window can be in the DOM. All content is
invented, and no real export is ever committed here.

`formatting.txt` is the E4-6 fixture: one message per marker, then the shapes
that interact, a mixed message carrying long inline text, a URL, a fenced block
and a list at once, and the jumbo-emoji boundary (1, 3 and 4 emoji, where only
the first two are jumbo). Its dates use month `07` for the same reason
`large.txt`'s do.
