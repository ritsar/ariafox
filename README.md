# AriaFox

Firefox extension that sends downloads to [aria2](https://aria2.github.io/) and manages them in the browser. Inspired by [AriaNg](https://github.com/mayswind/AriaNg); it does not bundle AriaNg.

Add-on id: `@ariafox`. [Privacy policy](PRIVACY.md).

## Requirements

- Firefox 140+
- aria2 with JSON-RPC, for example:

```bash
aria2c --enable-rpc --rpc-listen-port=6800 --rpc-secret=YOUR_SECRET
```

## Develop

```bash
npm install
npm test
npm start
```

Temporary install: `about:debugging` → This Firefox → Load Temporary Add-on → `dist/manifest.json`.

Open the toolbar popup, then Settings. Default RPC is `http://127.0.0.1:6800/jsonrpc`. Enter your secret, Test connection, optionally enable capture.

## Install for personal use

```bash
npm run package
```

That writes an unsigned zip under `.web-ext-artifacts/`. In LibreWolf (or Firefox Developer Edition / Nightly with unsigned add-ons allowed): `about:addons` → gear → Install Add-on From File.

Release Firefox will not keep an unsigned add-on. For that, Mozilla must sign it (unlisted is enough; it does not need a public store page). See [Signing and publishing](#signing-and-publishing).

Changing the gecko id later makes Firefox treat this as a different add-on. Keep `@ariafox`.

## Signing and publishing

You need a [Firefox Add-on Developer](https://addons.mozilla.org/developers/) account and [API credentials](https://addons.mozilla.org/developers/addon/api/key/).

```bash
npm run package
npm run source-zip
npx web-ext sign --channel=unlisted \
  --api-key="$AMO_JWT_ISSUER" \
  --api-secret="$AMO_JWT_SECRET" \
  --upload-source-code=.web-ext-artifacts/ariafox-source.zip
```

`--channel=unlisted` signs an XPI you can install yourself. `--channel=listed` submits a public [AMO](https://addons.mozilla.org) listing. Use the same id (`@ariafox`) for both.

## Building for reviewers

AMO reviewers rebuild from source and diff against the uploaded zip. From a clean checkout:

```bash
npm ci
npm test
npm run build
```

Compare `dist/` to the submitted package. `npm run build` does not emit source maps. `npm run source-zip` is a git archive of HEAD (no `node_modules` or `dist`).

## Shortcuts

- `Alt+A` — open manager
- `Alt+Shift+A` — toggle capture

## License

MIT. Not affiliated with AriaNg or the aria2 project.
