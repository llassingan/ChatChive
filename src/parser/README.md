# src/parser — export parsing (data layer)

Reads a WhatsApp export and turns it into the shared data model in `src/types`. Pure
TypeScript, no DOM; the heavy work runs in a Web Worker (PRD S-6, backlog E2-6). Owned by the
backend track.

Planned modules (backlog E2):

- `fixtures/` — synthetic, anonymized export fixtures (E2-1). No real personal data.
- line header parser — Android + iOS formats, multi-line/caption handling (E2-2).
- date-order detection — DMY vs MDY, with `needsUserChoice` for ambiguous data (E2-3).
- body classifier — message/media types, omitted/deleted/empty, never throws (E2-4).
- chat metadata — title, group detection, participants, "me" guess (E2-5).
- worker pipeline — unzip + parse off the main thread, zip-safety checks (E2-6).

Every parser module ships with Vitest coverage. Nothing in here logs chat content.

## Delivered so far

### `fixtures/` (E2-1)

Eight synthetic `.txt` exports and a typed loader (`fixtures/index.ts`, imported as raw
text so tests see the exact bytes). All content is invented; no real names, numbers or
messages. The real sample zip is gitignored and is never committed.

| Fixture             | Format                                                       | Date order  |
| ------------------- | ------------------------------------------------------------ | ----------- |
| `android-en-md-24h` | Android, English, 24h (mirrors the real sample)              | MDY         |
| `android-id-dm-24h` | Android, Indonesian, 24h dot-time                            | DMY         |
| `android-en-md-12h` | Android, English, 12h AM/PM                                  | MDY         |
| `ios-en-us`         | iOS `[date, time] Sender:` with U+200E / U+202F present      | MDY         |
| `ios-id-id`         | iOS, Indonesian, dot-time                                    | DMY         |
| `group-android-en`  | 4 senders + group system lines (all-small dates → ambiguous) | user choice |
| `android-no-media`  | personal chat, no attachments                                | MDY         |
| `txt-only`          | bare text-only export, references unresolved media           | DMY         |

### `text.ts`

`stripInvisible` removes BOM, LRM/RLM and bidi isolates and turns U+202F into a normal
space (so the iOS narrow space before AM/PM survives). `splitLines` tolerates CRLF, CR and
LF and keeps intentional blank lines inside a message body.

### `header.ts` (E2-2 — F-PAR-1, F-PAR-2, F-PAR-4, F-PAR-10)

`parseLine` classifies one raw line as either a `header` or a `continuation`. Headers are
recognized for both platforms:

- Android `M/D/YY, HH:mm - Sender: body` and `D/M/YYYY, h:mm a - …`
- iOS `[D/M/YY, HH.mm.ss] Sender: body`, seconds optional, `.` or `:` time separator

A header with no `Sender:` is a system line (`sender: null`); `Sender:` with nothing after
it is an empty-body message, not a system line. Non-header lines come back as
continuations for the caller to append to the previous message (multi-line text and
captions). `parseLine` never throws — unmatched input degrades to a continuation.

The header keeps the two leading date numbers as order-agnostic `first`/`second`; the date
order is decided file-wide (E2-3) and applied by `toEpochMs`, which also converts 12h
AM/PM to 24h and reads the export's wall-clock time as local time (exports carry no
timezone).

### `dateOrder.ts` (E2-3 — F-PAR-3)

`detectDateOrder` scans every header: a first part over 12 forces DMY, a second part over
12 forces MDY, and the first decisive header wins. When no header is decisive it returns
the contract's `DateOrderChoice` (`needsUserChoice: true`) with up to two sample lines
rendered under both interpretations, for the import-flow prompt (E3-3).

Run from the project root: `npm run typecheck && npm run lint && npm test`.
