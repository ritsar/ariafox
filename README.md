# AriaFox

Firefox extension that sends downloads to [aria2](https://aria2.github.io/) and manages them in the browser. Inspired by [AriaNg](https://github.com/mayswind/AriaNg); it does not bundle AriaNg.

## Requirements

- Firefox 128+ (LibreWolf is fine)
- aria2 with JSON-RPC, for example:

```bash
aria2c --enable-rpc --rpc-listen-port=6800 --rpc-secret=YOUR_SECRET
```

## Develop

```bash
npm install
npm test
npm start   # web-ext run against LibreWolf
```

Temporary install: `about:debugging` → This Firefox → Load Temporary Add-on → `dist/manifest.json`.

Open the toolbar popup, then Settings. Default RPC is `http://127.0.0.1:6800/jsonrpc`. Enter your secret, Test connection, optionally enable capture.

## Shortcuts

- `Alt+A` — open manager
- `Alt+Shift+A` — toggle capture

## License

MIT. Not affiliated with AriaNg or the aria2 project.
