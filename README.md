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
npm run format:check  # Prettier
```

## Deploy

The app is static files, so any host that can serve a folder will do, but the
privacy policy needs real response headers and that rules some hosts out. GitHub
Pages cannot set response headers at all: it would drop the `Content-Security-Policy`
mirror and `X-Frame-Options`, leaving the clickjacking guard undelivered. The
target is therefore **Cloudflare Pages**, which reads a `_headers` file from the
publish directory.

`public/_headers` holds that policy. Vite copies `public/` into `dist/` verbatim,
so the file ships as `dist/_headers`, which is where Cloudflare Pages reads it.
`src/ui/README.md` records the policy the two copies have to match.

The build uploads through `.github/workflows/deploy.yml`. Until the owner adds
these three repository values, the workflow prints a skip notice and exits
successfully rather than failing on every push:

| Kind     | Name                       | Where to find it                                                         |
| -------- | -------------------------- | ------------------------------------------------------------------------ |
| Secret   | `CLOUDFLARE_API_TOKEN`     | Cloudflare dashboard, API Tokens, with Account > Cloudflare Pages > Edit |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`    | Cloudflare dashboard, account ID                                         |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | the Pages project name you created                                       |

Steps for the owner:

1. Create a Pages project (Direct Upload) and note its name.
2. Add the two secrets and the variable above to the repository.
3. Push to `main`, or run the Deploy workflow manually.

Push to `main` deploys to production; a pull request deploys to a preview URL and
leaves production alone. **The live deploy is unverified.** It has not been run
against a real Cloudflare project, because none exists yet.

## Contributing

See `CONTRIBUTING.md` for the gate, the fixture rules and how to add a fixture.
For the name and the mark, see `TRADEMARKS.md`.

## Architecture

Client-side only. Two tracks meet at the shared data model in `src/types/`:

- `src/parser/`: reads the export, parses the text, classifies messages, runs in a Web Worker.
- `src/ui/`: the React view layer, styled from the design tokens in `DESIGN.md`.

## License

MIT. See `LICENSE`.

**The MIT question is settled: this project stays MIT.** PRD §11 and §15 Q1 asked whether to
switch to a copyleft license (AGPL-3.0 or MPL-2.0) so forks would have to stay open. That
trade was considered and declined. MIT lets anyone copy, modify, rebrand and sell this code,
and the project accepts that, because a client-side app ships its source to every visitor's
browser anyway and obfuscating it would work against the promise that you can inspect what
runs on your device. What distinguishes the project is the name, the canonical release, and
following WhatsApp's export format quickly, not the license.

The license covers the code, not the identity: forks must rename, and the ChatChive mark
stays with the project. See `TRADEMARKS.md` for the terms and the reasons.
