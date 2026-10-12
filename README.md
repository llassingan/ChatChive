# ChatChive

A static web app that opens a WhatsApp chat export (`.zip` or `.txt`) and shows it the way
WhatsApp does: bubbles, timestamps, date separators, images, voice notes and stickers, on
phone and desktop.

**Your chat never leaves your device.** The file is unzipped, parsed and rendered entirely in
your browser. There is no backend and no upload. You can verify this yourself in your browser's
DevTools → Network panel: after the app loads, there are zero network requests.

> Not affiliated with WhatsApp or Meta. "WhatsApp" is a trademark of Meta Platforms, Inc.
> This project only reads the plain-text export that WhatsApp itself produces.

## Status

Early development (v0.1 / MVP in progress). See `PRD.md`, `DESIGN.md` and `BACKLOG.md`.

## Develop

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright), includes the no-network check
npm run lint       # ESLint
```

## Architecture

Client-side only. Two tracks meet at the shared data model in `src/types/`:

- `src/parser/`: reads the export, parses the text, classifies messages, runs in a Web Worker.
- `src/ui/`: the React view layer, styled from the design tokens in `DESIGN.md`.

## License

MIT. See `LICENSE`. Forks must rename (the ChatChive name and logo are not covered by the code
license).
