# src/types: shared data model

The contract between the two tracks of the app. The parser (`src/parser`) produces these
shapes; the UI (`src/ui`) consumes them. Neither side defines its own copy of a chat/message
type: they both import from here.

- `chat.ts`: `Chat`, `Message` (discriminated union), `Participant`, `MediaRef`, parse
  results and progress events. Every type is traced back to a PRD requirement ID in a comment.
- `index.ts`: barrel export.

Owned by the tech lead. A change here affects both tracks, so it is reviewed as a cross-stack
change, not a local edit.
