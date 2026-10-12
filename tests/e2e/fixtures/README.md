# tests/e2e/fixtures: synthetic exports for browser tests

Small, hand-built stand-ins for real WhatsApp exports, used by the end-to-end
tests. Nothing here is personal data (backlog E2-1 forbids committing the real
sample export).

| File                   | Shape                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `export.zip`           | Android personal chat with a `.txt` + an image + a voice note            |
| `export.txt`           | Android text-only chat, no media, no zip                                 |
| `large.txt`            | 5,001 messages over three days, for the virtualization check (E4-1)      |
| `script-injection.txt` | Message bodies carrying `<script>` and `<img onerror>`, for the S-5 test |

The `.zip` is built by hand (a plain DEFLATE archive). Its media bytes are
fake: nothing renders media yet (backlog E5), the files only have to exist so
the attachment markers resolve. Both fixtures are read by the real parser
running in a Web Worker, so these tests cover the full pipeline in a browser,
not a mock.

`large.txt` is generated, not hand-written: its dates use a month over 12 so the
date order is unambiguous and the export never stops at the date prompt, and its
message count is high enough that only a window can be in the DOM. All content is
invented, and no real export is ever committed here.
