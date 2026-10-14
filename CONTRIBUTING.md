# Contributing

Thanks for helping. This is a small, static, client-side project with an unusual
constraint that shapes most of the rules below: the app must never send chat data
anywhere, and a reader has to be able to verify that claim in their own browser.

## Getting set up

```bash
npm install
npm run dev        # dev server
```

Node 22 is what CI uses. No other toolchain is required.

## The gate

Run all of these before you call your change done. CI (`.github/workflows/ci.yml`)
runs the same commands on every push and pull request, so a local pass is what
keeps the suite green for everyone else:

```bash
npm run format:check   # prettier --check .
npm run lint           # eslint .
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run build          # tsc --noEmit && vite build
npm run test:e2e       # playwright test, builds and previews the app first
```

`npm run format` rewrites files into the Prettier style if `format:check` fails.
The e2e suite builds the app and serves the built output on port 4173 before it
runs, so it needs no separate terminal.

Two notes on the e2e run:

- It runs in Chromium and WebKit. A change that behaves differently in the two
  engines is a finding worth reporting, not noise to route around.
- Visual regression baselines are committed for CI's platform, Ubuntu. If a
  visual test fails on your machine and passes in CI, the difference is usually
  your platform's font rendering. Do not run `--update-snapshots` to fix that.

## Fixtures: never commit a real export

**This is the one rule with no exceptions.** A real WhatsApp export contains other
people's messages, phone numbers and photos. Never commit one, never attach one to
an issue, and never paste one into a test.

- Use a synthetic fixture, or anonymize a real one until no real name, number,
  photo or message survives.
- Chat exports dropped in the repository root or in the fixtures folders are
  personal data. They match the gitignore rules for `.zip`, `sample/` and
  `WhatsApp Chat with*`, and they are never committed.
- Synthetic fixtures live in two places:
  - `tests/e2e/fixtures/`: files the browser tests open through the real file
    input. Shapes are described in `tests/e2e/fixtures/README.md`.
  - `src/parser/fixtures/`: `.txt` exports the parser unit tests import as raw
    text, so the tests see the exact bytes. Described in `src/parser/README.md`.

`*.zip` is gitignored, with an explicit exception per committed fixture, so a real
export dropped into the fixtures folder stays out of the repository. A new `.zip`
fixture therefore needs its own `!tests/e2e/fixtures/<name>.zip` line in
`.gitignore`; `.txt` fixtures are not ignored.

## How to add a fixture

For a parser unit test:

1. Add the `.txt` file to `src/parser/fixtures/`.
2. Import it in `src/parser/fixtures/index.ts`, add its name to the `FixtureName`
   union, and add it to the `fixtures` record.
3. Add a row to the fixture table in `src/parser/README.md`, saying which format
   and which date order it covers.
4. Reference it in a test by name, for example `fixtures['android-en-md-24h']`.

For an e2e test:

1. Add the file to `tests/e2e/fixtures/`.
2. If it is a `.zip`, add the `.gitignore` exception described above.
3. Add a row to `tests/e2e/fixtures/README.md` describing its shape.
4. Load it in the spec through the file input, using a path relative to the
   project root:
   `await page.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/export.zip')`.

If your fixture is binary (a zip carrying media bytes), say in the README row how
it was generated and with which tool, so the next person can rebuild it instead of
committing over it.

## House rules

These are not style preferences. Each one is enforced by the code or by a test,
and a change that breaks one will fail CI.

### No chat content in any log

Nothing in `src/` calls `console`. Message text, sender names, phone numbers and
file names do not go to the console, to an error message, or to a network
endpoint. The parser's error contract carries a developer-facing `detail` field
that never contains chat content (`src/types/chat.ts`), and that is the channel
for anything diagnostic.

The reason is the product promise: a log entry with a message in it is chat data
leaving the device, and the whole point of this app is that it does not.

### Message text is rendered as text, never as HTML

Rendering a message builds React text nodes and elements. `dangerouslySetInnerHTML`
and equivalents do not appear in this codebase, because a chat export is
attacker-controlled input: anyone can send a message containing a `<script>` tag,
and the export will faithfully contain it.

If you touch the formatting tokenizer or the message row, keep the existing
coverage green: `tests/e2e/fixtures/script-injection.txt` carries a `<script>` and
an `<img onerror>` payload, and the tests in `tests/e2e/format.spec.ts` and
`tests/e2e/chat.spec.ts` assert both that the characters are shown literally and
that nothing executed.

### Parser changes are deliberate

The parser handles a format that changes under us, from phones in several locales,
so its behaviour on unexpected input is part of the contract:

- Nothing throws. Unrecognized input degrades: a line that is not a header becomes
  a continuation, and unknown content falls back to text.
- A behaviour change needs a fixture that demonstrates it. "It parses the file I
  have" is a report; a fixture is a test.
- Locale and date-order handling is data-driven. If a format is not covered, add
  the fixture and the rule together, rather than special-casing one file.

### No third-party runtime code

No analytics, no error reporting service, no web fonts, no CDN, no icon font.
The CSP in `index.html` and the response headers in `public/_headers` block these
anyway, and the e2e suite asserts that importing a chat makes zero network
requests (`tests/e2e/no-network.spec.ts`). A dependency that fetches anything at
runtime is not a candidate regardless of how useful it is.

### Keep the deploy headers in step

`public/_headers` carries the CSP as a real response header, including
`frame-ancestors 'none'`, which a `<meta>` tag cannot deliver. If you change the
policy in `index.html`, change `public/_headers` in the same commit, and keep the
two identical except for `frame-ancestors`. `src/ui/README.md` records the policy
both files have to match.

Note that `_headers` is a Cloudflare Pages / Netlify convention. The deploy host
(Dokploy) does not read it, so the same four headers must also be set in the
host's proxy config, copied from `dist/_headers`. Changing the policy is a
three-place change when the host is wired: `index.html`, `public/_headers`, and
the host's proxy.

## Reporting an export the app cannot read

Open an issue with the "Unsupported export format" template. It asks for the
platform, the WhatsApp version, the locale and date style, and an anonymized
snippet: the shape of the lines is what identifies the format, so redact the names,
numbers and message text but keep the punctuation, spacing and separators.

## License and branding

Contributions are accepted under the MIT license in `LICENSE`. By opening a pull
request you agree your contribution can be distributed under those terms.

The license covers the code, not the project's name or visual mark. See
`TRADEMARKS.md`: forks must rename and must not use the ChatChive mark as their own.
