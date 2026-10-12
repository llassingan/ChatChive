# src/parser: export parsing (data layer)

Reads a WhatsApp export and turns it into the shared data model in `src/types`. Pure
TypeScript, no DOM; the heavy work runs in a Web Worker (PRD S-6, backlog E2-6). Owned by the
backend track.

Modules (backlog E2). All P0 parsing modules are delivered (see below); the P1/P2
items still ahead are the edited marker, iOS call lines and `.vcf` parsing (E2-7), polls
(E2-8), and the locale phrase table (E2-9).

Every parser module ships with Vitest coverage. Nothing in here logs chat content.

## Delivered so far

### `fixtures/` (E2-1)

Eight synthetic `.txt` exports and a typed loader (`fixtures/index.ts`, imported as raw
text so tests see the exact bytes). All content is invented; no real names, numbers or
messages. The real sample zip is gitignored and is never committed.

| Fixture              | Format                                                            | Date order  |
| -------------------- | ----------------------------------------------------------------- | ----------- |
| `android-en-md-24h`  | Android, English, 24h (mirrors the real sample)                   | MDY         |
| `android-id-dm-24h`  | Android, Indonesian, 24h dot-time                                 | DMY         |
| `android-en-md-12h`  | Android, English, 12h AM/PM                                       | MDY         |
| `ios-en-us`          | iOS `[date, time] Sender:` with U+200E / U+202F present           | MDY         |
| `ios-id-id`          | iOS, Indonesian, dot-time                                         | DMY         |
| `group-android-en`   | 4 senders + group system lines (all-small dates → ambiguous)      | user choice |
| `group-colon-notice` | group notice containing a colon (`changed the subject to "…: …"`) | user choice |
| `android-no-media`   | personal chat, no attachments                                     | MDY         |
| `txt-only`           | bare text-only export, references unresolved media                | DMY         |

### `text.ts`

`stripInvisible` removes BOM, LRM/RLM and bidi isolates and turns U+202F into a normal
space (so the iOS narrow space before AM/PM survives). `splitLines` tolerates CRLF, CR and
LF and keeps intentional blank lines inside a message body.

### `header.ts` (E2-2: F-PAR-1, F-PAR-2, F-PAR-4, F-PAR-10)

`parseLine` classifies one raw line as either a `header` or a `continuation`. Headers are
recognized for both platforms:

- Android `M/D/YY, HH:mm - Sender: body` and `D/M/YYYY, h:mm a - …`
- iOS `[D/M/YY, HH.mm.ss] Sender: body`, seconds optional, `.` or `:` time separator

A header with no `Sender:` is a system line (`sender: null`); `Sender:` with nothing after
it is an empty-body message, not a system line. Non-header lines come back as
continuations for the caller to append to the previous message (multi-line text and
captions). `parseLine` never throws: unmatched input degrades to a continuation.

The header keeps the two leading date numbers as order-agnostic `first`/`second`; the date
order is decided file-wide (E2-3) and applied by `toEpochMs`, which also converts 12h
AM/PM to 24h and reads the export's wall-clock time as local time (exports carry no
timezone).

### `dateOrder.ts` (E2-3: F-PAR-3)

`detectDateOrder` scans every header: a first part over 12 forces DMY, a second part over
12 forces MDY, and the first decisive header wins. When no header is decisive it returns
the contract's `DateOrderChoice` (`needsUserChoice: true`) with up to two sample lines
rendered under both interpretations, for the import-flow prompt (E3-3).

### `classifier.ts` (E2-4: F-PAR-4, F-PAR-5, F-PAR-10)

`classifyMessages` turns the header/continuation stream into `Message[]`. Android
`<file> (file attached)` and iOS `<attached: file>` become a `MediaMessage` whose `MediaRef`
is resolved against the archive's entry list (`resolved: false` when the file is absent,
which the UI shows as a placeholder). Text on the following lines becomes the caption.
`mediaKindFor` classifies by filename prefix (`IMG-`/`PHOTO-`, `VID-`, `PTT-`, `STK-`,
`AUD-`, `.vcf`, `GIF`, else document) and MIME is guessed from the extension. Omitted
notices (`<Media omitted>`, `image omitted`, …) and empty bodies become `empty`; deleted
notices become `deleted` with `byMe`; a bare maps link or `lat,lng` becomes a `location`
media message; anything unrecognized degrades to `text` and nothing throws.

### `metadata.ts` (E2-5: F-PAR-9, F-NAV-1)

`titleFromFileName` reads the contact out of `WhatsApp Chat with X` / `WhatsApp Chat - X`.
`analyzeSenders` builds the participant list (stable id, display name, phone for unsaved
contacts, deterministic `colorIndex` 0..15, avatar initial) and flags group system notices.
It also repairs a Sprint 1 heuristic: a notice that contains a colon can look like
`Sender: body`, so a candidate sender is rejected when it carries a notice verb or merely
extends a sender that stands alone elsewhere. `detectGroup` is >2 senders or a group
notice, and `guessMeId` returns the single non-title sender for a personal chat (null for
a group, where the picker asks instead).

### `zip.ts` (E2-6: F-IMP-2, S-6)

A thin `fflate` wrapper that lists entries without decompressing, drops unsafe paths
(absolute, drive-letter, any `..` segment), refuses an archive whose uncompressed total
exceeds 2 GiB, and inflates a single entry on demand so media stays compressed until the UI
asks for it. `findChatFile` prefers `_chat.txt`, then `WhatsApp Chat with *.txt` / `- *.txt`,
then the only or largest `.txt`. Nothing here throws.

### `protocol.ts` / `pipeline.ts` / `worker.ts` / `client.ts` (E2-6)

`protocol.ts` is the frozen main/worker message contract. `pipeline.ts` exports the pure
`parseChatText` and `createParserSession`, which keeps the archive alive after a parse so
`extract(entryName)` can return one media `Blob` later and `dispose()` can free it.
`worker.ts` binds a session to the worker scope and `client.ts` is the main-thread caller
(`openChatFile`) that the import flow uses. Progress flows through the phases `reading`,
`unzipping`, `parsing`, `ready`; a failing parse never rejects but returns the contract's
error result.

Run from the project root: `npm run typecheck && npm run lint && npm test`.
