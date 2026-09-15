# Privacy policy

AriaFox does not collect telemetry, analytics, or accounts. Nothing is sent to the AriaFox authors or to a third-party service we operate.

## What stays on your computer

- RPC server URLs, names, and secrets
- Capture filters and other add-on settings

These are stored in Firefox `storage.local` on the profile that installed AriaFox.

## What is sent to your aria2 server

When you add a download, or when capture is on and Firefox starts a download AriaFox accepts, the add-on sends that job to the **aria2 JSON-RPC server you configured**. That can include:

- the download URL
- filename, referrer, and user-agent
- cookies for that URL (only if you granted host access, used for authenticated files)

The default server is loopback (`http://127.0.0.1:6800/jsonrpc`). If you point AriaFox at a remote server, that host receives the same job data. HTTP (not HTTPS) to a remote host is in cleartext.

## Permissions

| Permission | Why |
|---|---|
| `downloads` | See new Firefox downloads and cancel them when capture is on |
| `cookies` | Attach cookies so aria2 can fetch the same file the browser would |
| `storage` | Save settings and the RPC secret |
| `notifications` | Tell you if capture failed and Firefox kept the file |
| `menus` | “Send to aria2” on links and media |
| Loopback hosts | Talk to a local aria2 by default |
| Optional `<all_urls>` | Asked when you enable capture, so cookies work on those sites — not to read tabs |

Firefox’s data collection disclosure for this add-on is **none**.

## Contact

Issues: [github.com/ritsar/ariafox](https://github.com/ritsar/ariafox)
