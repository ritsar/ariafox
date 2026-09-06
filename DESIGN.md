# AriaFox — Design Document

**Status:** Proposed  
**Date:** 2026-09-06  
**Working name:** AriaFox (see §2)  
**Target:** Firefox Desktop, Manifest V3, AMO-listed add-on

A Firefox extension that talks to a user-operated [aria2](https://aria2.github.io/) JSON-RPC server: a small native UI for queues and tasks, plus optional capture of browser downloads. The UI is **inspired by** [AriaNg](https://github.com/mayswind/AriaNg).

---

## 1. Problem

aria2 is a strong download engine with no browser UI. The usual answer is AriaNg in a tab, plus copying URLs by hand. Existing Firefox add-ons either embed a stale AriaNg tree, intercept downloads with almost no manager, or both.

We need something that is a real Firefox add-on first:

1. Open a download manager that is just RPC + UI, with no extra web server.
2. Optionally send Firefox downloads to aria2, including cookies / referrer / user-agent.
3. Manifest V3, capture, popup, and sidebar share one settings model.
4. Ship a useful v1 without cloning AriaNg’s full surface (i18n, every aria2 option, BT peer maps, charts).

AriaNg is a JSON-RPC dashboard. That is the right architecture. We implement that dashboard ourselves, scoped to daily use, and leave room to grow.

---

## 2. Name

The repo folder is still `ariang-firefox`. Rename it when the name sticks. The add-on **must not** be called AriaNg; that would impersonate [mayswind](https://github.com/mayswind).

| Name | Slug | Why it works | Risk |
|------|------|----------------|------|
| **AriaFox** | `ariafox` | aria2 + Firefox, short, sayable | “Aria” is crowded; still clearly not AriaNg |
| **Foxaria** | `foxaria` | Same idea, unique string | Slightly awkward to say |
| **Aria Catch** | `aria-catch` | Leads with capture | Undersells the manager UI |
| **Tow** | `tow` | Browser tows jobs to aria2 | Opaque until you read the listing |
| **Haul** | `haul` | Same metaphor | Generic; trademark-ish |
| **Keel** | `keel` | Engine under the browser | Cute, unexplained |

**Recommendation: AriaFox.** Display name `AriaFox`, AMO slug `ariafox`, gecko id `ariafox@addons.mozilla.org` (or a domain you control). Description line: “Send Firefox downloads to aria2 and manage them in the browser.”

Credit AriaNg in the README as inspiration, not as a bundled product.

Until a final pick, this document uses **AriaFox**.

---

## 3. Goals

| ID | Goal |
|----|------|
| G1 | Custom manager UI in extension pages (tab, popup, later sidebar). No third-party frontend. |
| G2 | All aria2 I/O through the **background** page so UI never hits CORS. |
| G3 | Optional **download capture**: cancel the Firefox download and `aria2.addUri` / `addTorrent` / `addMetalink`. |
| G4 | Preserve **Cookie**, **Referer**, and **User-Agent** on captured jobs. |
| G5 | Firefox-native chrome: toolbar popup, context menus, magnet protocol handler, badge. |
| G6 | One settings store for RPC + capture + UI. |
| G7 | v1 is English-only and feature-narrow; structure (message ids, option keys) does not block i18n or extra aria2 options later. |
| G8 | AMO-reviewable: readable source, clear permissions, privacy policy. |

## 4. Non-goals (v1)

- Bundling or launching `aria2c`. The user already runs it (local, NAS, Docker, Motrix, …).
- Vendoring or forking AriaNg.
- Chrome / Edge as a first-class target.
- Matching AriaNg: translations, speed charts, BT peer/client tables, piece bitfields, drag-reorder, debug console, Command API, export/import of AriaNg settings, generated forms for every aria2 option.
- Capturing `blob:`, `data:`, or `file:` URLs (aria2 cannot fetch those).

Those are **later**, not never. See §12.

---

## 5. Design principles

1. **aria2 is the engine; we are a client.** No parallel download stack in the extension.
2. **Background owns the wire.** Popup, tab, and options send `runtime` messages. The event page is the only process that `fetch`es the RPC URL. That avoids page CORS, keeps the secret out of page JS as much as practical, and lets capture and UI share one client.
3. **Fail open on capture errors.** If RPC is down, notify and restore a Firefox download instead of dropping the file.
4. **Least privilege that still works.** Cookie forwarding needs host access; `<all_urls>` is optional and explained on the options page.
5. **v1 is a slice, not a stub.** Queues, progress, pause/resume/remove, add URL/magnet/torrent, capture, and RPC settings should feel complete. Depth (BT internals, 100+ global options) waits.
6. **Leave room without building it.** String tables, RPC method wrappers, and settings types should extend without migrations where possible.

---

## 6. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Firefox                                                   │
│  web pages ── downloads.onCreated ──► background         │
│           ── contextMenus / magnet ─► (event page)       │
│                                           capture.ts      │
│  popup  ── runtime.messages ────────► rpc.ts             │
│  manager tab                         menus.ts / badge.ts │
│  options                                  │ JSON-RPC HTTP │
│                                           ▼               │
│                                      aria2c :6800         │
└──────────────────────────────────────────────────────────┘
```

| Layer | Role |
|-------|------|
| Background | Capture, RPC, menus, badge, notifications |
| Popup | Capture toggle, connection, active summary, open manager |
| Manager | Full-page queues + task detail + add task |
| Options | RPC profiles, capture filters, permissions |

No iframe, no sandbox, no `unsafe-eval`. Extension CSP stays strict (`script-src 'self'`). Default MV3 `upgrade-insecure-requests` is **omitted** so `http://127.0.0.1:6800` works; warn when the RPC host is not loopback and protocol is `http`.

### 6.1 RPC client

Typed wrapper around JSON-RPC 2.0 POST:

```ts
rpc.call("aria2.tellActive", [])
rpc.call("aria2.addUri", [[url], options])
```

Token: if `secret` is set, params are `["token:…", ...rest]`, else `rest` only.

v1 methods:

| Method | Use |
|--------|-----|
| `aria2.getVersion` | Connection test |
| `aria2.getGlobalStat` | Badge, popup speeds |
| `aria2.tellActive` / `tellWaiting` / `tellStopped` | Queues |
| `aria2.tellStatus` | Task detail |
| `aria2.addUri` / `addTorrent` / `addMetalink` | New tasks + capture |
| `aria2.pause` / `unpause` / `remove` | Row actions |
| `aria2.pauseAll` / `unpauseAll` | Popup / manager toolbar |
| `aria2.removeDownloadResult` | Clear a stopped row |
| `aria2.purgeDownloadResult` | Clear stopped list |
| `system.multicall` | One round-trip for the three `tell*` lists |

WebSocket RPC is **later**. HTTP polling is enough (1s while manager visible, 5s with capture on, 30s idle). The event page can suspend between polls.

Keep `rpc.ts` as a thin map of method names so `getFiles`, `getPeers`, `changeGlobalOption`, etc. can be added without rewriting the transport.

### 6.2 UI stack

- TypeScript
- No AriaNg, no Angular
- Prefer **vanilla TS + CSS** (or Preact if the manager grows). Do not pull React.
- Light / dark via `prefers-color-scheme` (this is not i18n; it is cheap and expected)
- English copy in a `messages` module (`t("queue.active")`) so `_locales` can slot in later without hunting string literals

Do not run AriaNg or any other UI through the bundler. There is nothing to vendor.

---

## 7. Repository layout

```
ariafox/                          # rename from ariang-firefox
├── DESIGN.md
├── README.md
├── LICENSE
├── package.json
├── web-ext.config.js
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   ├── capture.ts
│   │   ├── filters.ts
│   │   ├── rpc.ts
│   │   ├── menus.ts
│   │   └── badge.ts
│   ├── popup/
│   ├── manager/                  # full-page UI
│   ├── options/
│   ├── shared/
│   │   ├── settings.ts
│   │   ├── messages.ts           # English string table
│   │   └── types.ts              # aria2 DTOs
│   └── _locales/en/messages.json # extension chrome strings (toolbar title)
└── assets/icons/
```

`web-ext` (or WXT) compiles `src/` only. No `vendor/`.

---

## 8. Settings

`browser.storage.local` is the only store. Secrets never go to `storage.sync`.

```ts
type RpcProfile = {
  id: string;
  name: string;
  protocol: "http" | "https";   // ws/wss later
  host: string;                 // default 127.0.0.1
  port: number;                 // default 6800
  path: string;                 // default jsonrpc
  secret: string;
};

type CaptureSettings = {
  enabled: boolean;
  minSizeBytes: number | null;
  excludeUrlGlobs: string[];
  excludePageGlobs: string[];   // DownloadItem.referrer
  excludeExtensions: string[];  // default html, htm, php, aspx?
  excludeMimes: string[];
  capturePdf: boolean;          // default false
  capturePrivate: boolean;      // default false
  torrentHandling: "uri" | "upload";
};

type Settings = {
  activeProfileId: string;
  profiles: RpcProfile[];       // v1 UI can show one; type is already a list
  capture: CaptureSettings;
  notifications: { capture: boolean; rpcError: boolean };
  pollMsVisible: number;        // default 1000
  pollMsBackground: number;     // default 5000
};
```

Options page: Test connection (`getVersion` + `getGlobalStat`). Saving a non-loopback host calls `permissions.request({ origins: [origin + "/*"] })`. Loopback is pre-granted in `host_permissions`.

---

## 9. Manager UI (v1)

AriaNg’s useful core is three queues and a detail pane. That is the whole manager.

### 9.1 Layout

- Sidebar or top tabs: Active, Waiting, Stopped
- Header: global ↓/↑, pause all / resume all, add, settings
- List rows: name, size, progress bar, percent, speed, ETA, status, actions
- Click row → detail: GID, status, URIs, simple file list (`tellStatus` files[]), error string if any
- Add sheet: URL(s) / magnet / torrent file, optional filename (`out`)

Empty states: not connected (CTA to options), connected but idle, capture off reminder.

### 9.2 What we render from aria2

From `tell*` / `tellStatus` only, no extra protocol:

- `bittorrent.info.name` or first file path or URI basename
- `completedLength / totalLength`
- `downloadSpeed`, `uploadSpeed`
- `status`, `errorMessage`
- `files[].path`, `files[].length`, `files[].selected` (show; toggling selection is later)

No peer table, no piecemap, no speed chart in v1.

### 9.3 Popup

Not a second manager. ~360px:

- Capture on/off
- Connection pill
- Active count + global speeds
- Up to 5 active names + percent
- Open manager, pause all, options

### 9.4 Visual language

Clean, dense, download-manager — not a clone of AriaNg’s Bootstrap theme and not a Firefox Settings clone. Dark/light. Icon: simple fox + down arrow or a geometric “A” — distinct from AriaNg’s logo.

---

## 10. Download capture

Same pipeline as before; this is the extension’s special feature, not the UI’s.

```
downloads.onCreated
  → filters (scheme, globs, extension, PDF, private, min size, our own id)
  → cancel + erase
  → cookies.getAll({ url, storeId, firstPartyDomain })
  → addUri | addTorrent | addMetalink
  → on RPC failure: downloads.download(original) + notify
```

Tiny-file race: if the item completes before `cancel()`, `removeFile` after a successful add so the user does not get a duplicate.

**Defaults** (avoid hijacking navigations):

| Filter | Default |
|--------|---------|
| Enabled | Off until a successful connection test, then prompt to enable |
| Skip extensions | `htm, html, php, asp, aspx, mhtml, shtml` |
| Skip PDF | yes |
| Private windows | off |
| Protocols | `http:` / `https:` |

Toolbar command `Alt+Shift+A` toggles capture without clearing filters.

Context menus always work, even with capture off: link, selection, media, page URL.

Firefox `protocol_handlers` for `magnet:`; background `addUri` so it works with the manager closed.

Containers: use the download’s `cookieStoreId` for `cookies.getAll`.

`out` is the basename of `DownloadItem.filename`. Do not set `dir` unless a later profile option exists — NAS users rely on aria2’s `--dir`.

No blocking `webRequest` in v1.

---

## 11. Manifest (sketch)

```json
{
  "manifest_version": 3,
  "name": "AriaFox",
  "version": "1.0.0",
  "browser_specific_settings": {
    "gecko": {
      "id": "ariafox@addons.mozilla.org",
      "strict_min_version": "128.0"
    }
  },
  "permissions": [
    "downloads",
    "cookies",
    "storage",
    "notifications",
    "contextMenus",
    "menus",
    "tabs"
  ],
  "host_permissions": [
    "http://127.0.0.1/*",
    "http://localhost/*",
    "http://[::1]/*"
  ],
  "optional_host_permissions": ["<all_urls>"],
  "background": { "scripts": ["background.js"], "type": "module" },
  "action": { "default_popup": "popup/index.html", "default_title": "AriaFox" },
  "options_ui": { "page": "options/index.html", "open_in_tab": true },
  "commands": {
    "toggle-capture": { "suggested_key": { "default": "Alt+Shift+A" } },
    "open-manager": { "suggested_key": { "default": "Alt+A" } }
  },
  "protocol_handlers": [
    {
      "protocol": "magnet",
      "name": "AriaFox",
      "uriTemplate": "/manager/index.html#magnet=%s"
    }
  ],
  "content_security_policy": {
    "extension_pages": "default-src 'self'; script-src 'self'; connect-src 'self' http: https: ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'"
  }
}
```

`connect-src` includes `http:` for loopback aria2. `ws:` is reserved for a later transport; unused in v1.

`<all_urls>` is optional: capture without it still sends the URL; cookie-gated files will fail until the user grants it.

`sidebar_action` is **later** (one line in the manifest + reuse manager CSS). Default open is a tab.

---

## 12. Later (explicit room)

Do not implement these in v1. Do not paint them out.

| Area | How we leave room |
|------|-------------------|
| i18n | `shared/messages.ts` + `_locales`; no concatenated sentences in JS |
| Sidebar | Manager is a page; `sidebar_action` can point at it |
| Multi-profile UI | `profiles[]` already in storage |
| WebSocket RPC | `rpc.ts` transport interface; `protocol` union can grow `ws` / `wss` |
| Full aria2 options | `getGlobalOption` / `changeGlobalOption` when we want a form; until then, `aria2.conf` |
| BT detail | `getPeers`, `getFiles` selection via `changeOption select-file` |
| Charts | Sample `downloadSpeed` into a ring buffer in the manager only |
| Chrome port | Separate background entry (service worker); after Firefox v1 is boring |

AriaNg itself remains a fine **companion** for power users: same aria2, their bookmark. We do not need to replace it to be useful.

---

## 13. Privacy and AMO

| Data | Where | Why |
|------|--------|-----|
| URL, filename, referrer, UA, cookies | User’s RPC | Job creation |
| RPC secret | `storage.local` | Auth |
| Settings | `storage.local` | UI |

No telemetry. Privacy policy: cookies and URLs go only to the configured RPC; default is loopback; warn on cleartext remote.

About page: MIT license, “inspired by AriaNg, not affiliated.”

---

## 14. Implementation phases

### Phase 0 — scaffolding

Manifest, TS build, `web-ext run`, icons, English string table, settings types, RPC `getVersion` from options.

**Exit:** options page talks to local aria2.

### Phase 1 — manager + popup

Queues, row actions, add URL/magnet, polling, popup summary, badge.

**Exit:** usable as a tab against an existing aria2 session.

### Phase 2 — capture + menus

Filters, cancel/erase, cookies, fallback, toggle, context menus, magnet handler.

**Exit:** authenticated zip from a website lands in aria2; toggle off restores Firefox.

### Phase 3 — AMO

Privacy policy, lint, test matrix, screenshots, signing. Sidebar and extra RPC methods only if they are still small.

---

## 15. Test plan

Automated:

- Filter unit tests (scheme, globs, PDF, private, `byExtensionId`, min size)
- RPC envelope (token on/off, `out` basename)
- String table: every `t()` key exists

Manual:

| Case | Expect |
|------|--------|
| Manager, public files in aria2 | Lists update ~1s |
| Pause / resume / remove | Matches `aria2` CLI |
| Capture on, public zip | Firefox row gone; task appears |
| Capture off | Normal Firefox download |
| Cookie-gated file, permission granted | Succeeds |
| PDF | Stays in Firefox |
| RPC down during capture | Notification + Firefox download |
| Magnet | Task added with manager closed |
| Container tab | Cookies from that store only |

---

## 16. Risks

| Risk | Mitigation |
|------|------------|
| Scope creep toward “full AriaNg” | §4 / §12 are the contract; new UI needs a reason beyond parity |
| `upgrade-insecure-requests` | CSP without it |
| AMO vs `http:` connect-src and `<all_urls>` | Loopback default; optional hosts; remote HTTP warning |
| Download cancel race | `removeFile` after successful add |
| Users expect AriaNg | Listing and About: inspired by AriaNg; they can keep using AriaNg on the same server |

CORS is **not** a v1 risk: only the background talks to aria2.

---

## 17. Decision summary

| Topic | Decision |
|-------|----------|
| Frontend | Custom, TypeScript, no AriaNg |
| Name (working) | AriaFox |
| Manifest | Firefox MV3, event page |
| RPC | HTTP JSON-RPC from background only |
| Capture | `downloads.onCreated` → cancel → add* |
| v1 UI | Queues, basic detail, add task, popup, options |
| Deferred | i18n, charts, full option forms, BT peers, sidebar, WebSocket |
| Not included | aria2 binary, Chrome, vendoring AriaNg |
