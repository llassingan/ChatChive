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
mirror and `X-Frame-Options`, leaving the clickjacking guard undelivered. This
project deploys through **Dokploy**.

`public/_headers` holds that policy. Vite copies `public/` into `dist/` verbatim,
so the file ships as `dist/_headers`. That file is the source of truth for the
policy, and `src/ui/README.md` records the policy the copies have to match.
`_headers` is a Cloudflare Pages / Netlify convention, though, and **Dokploy does
not read it**: Dokploy serves the build through its own proxy, so the same four
headers must be configured there (a Traefik middleware or the static server's
config), taken from `dist/_headers`. This is the one piece of the deploy that
cannot be expressed as a file in the repository, so it is the owner's step and it
is **unverified**.

The build triggers a Dokploy **deployment webhook** through
`.github/workflows/deploy.yml` after a push to `main`. Until the owner adds one
repository secret, the workflow prints a skip notice and exits successfully
rather than failing on every push:

| Kind   | Name                     | Where to find it                                                                   |
| ------ | ------------------------ | ---------------------------------------------------------------------------------- |
| Secret | `DOKPLOY_DEPLOY_WEBHOOK` | Dokploy, application, Deployments tab, Webhook URL (ends in `/api/deploy/<token>`) |

The webhook URL is a bearer credential — anyone holding it can trigger a deploy —
so it is stored as a secret and never echoed to the log. Add the secret, point
Dokploy's application at this repository and branch `main`, and each push to
`main` builds here and triggers the deploy.

Steps for the owner:

1. Enable **Auto Deploy** on the Dokploy application and copy its Webhook URL.
2. Add it as the `DOKPLOY_DEPLOY_WEBHOOK` secret on the repository.
3. Push to `main`, or run the Deploy workflow manually.

Pull requests do not deploy: the workflow runs on `main` and manual dispatch only,
so an untrusted PR cannot reach the webhook. **The live deploy is unverified.** It
has not been run against a real Dokploy instance, because none exists yet.

## Contributing

See `CONTRIBUTING.md` for the gate, the fixture rules and how to add a fixture.
For the name and the mark, see `TRADEMARKS.md`.

## Architecture

Client-side only. Two tracks meet at the shared data model in `src/types/`:

- `src/parser/`: reads the export, parses the text, classifies messages, runs in a Web Worker.
- `src/ui/`: the React view layer, styled from the design tokens in `DESIGN.md`.

## License

MIT. See `LICENSE`.

**The MIT question is settled: this project stays MIT.** MIT lets anyone copy, modify, rebrand and sell this code,
and the project accepts that, because a client-side app ships its source to every visitor's
browser anyway and obfuscating it would work against the promise that you can inspect what
runs on your device. What distinguishes the project is the name, the canonical release, and
following WhatsApp's export format quickly, not the license.

The license covers the code, not the identity: forks must rename, and the ChatChive mark
stays with the project. See `TRADEMARKS.md` for the terms and the reasons.
