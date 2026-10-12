# src/ui/import

The import flow's state machine, kept out of the screens so the session
lifecycle has one owner.

- `useImportFlow.ts`: `useImportFlow()` wraps `openChatFile()` from
  `src/parser/client.ts` and exposes `{state, pick, cancel, chooseDateOrder,
reset}`. States: `landing`, `working`, `choice`, `ready`, `error`. It owns the
  `ChatSession`, so Cancel terminates the worker and frees the archive at any
  point, and it closes the session on unmount.
- `errors.ts`: the user-facing copy per `ParseErrorCode`.

Two deliberate behaviours:

- A file whose name is neither `.zip` nor `.txt` is rejected before the parser
  runs, so a dropped folder or photo gets the unrecognized-format message
  instead of a parse that cannot succeed.
- After a successful parse the session is closed immediately. Nothing calls
  `extract()` yet (media is E5), so holding the archive open would only pin
  memory; the message view will open its own session when it lands.
