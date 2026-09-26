# Notes to AMO Reviewer — PhoenixBox v3.1.0

## What This Extension Does

PhoenixBox is a multi-container browser extension for security testing and penetration testing workflows. It is based on Mozilla's Multi-Account Containers and adds:

- Per-container proxy configuration (HTTP, HTTPS, SOCKS4, SOCKS5)
- A global proxy toggle for routing all container traffic through Burp Suite
- Burp Suite highlighting: each container the user marks gets its own proxy listener in Burp, opened by the companion Burp extension, so Burp can colour and name requests by the listener they arrive on. Requests are never modified for this (see **Burp Highlighter connection**)
- Per-container User-Agent overrides using a curated list from a public CDN
- Optional Mozilla VPN integration via native messaging
- An on-demand endpoint extractor that lists URL paths found in the current page's source (see **Content Script**)

The extension is open source under MPL-2.0:
https://github.com/avihayf/PhoenixBox

---

## Permission Justification

### `<all_urls>` + `webRequest` + `webRequestBlocking`

These three permissions work together and are essential for two core features:

1. **Proxy routing** — The extension uses `browser.proxy.onRequest` (optional `proxy` permission) and `browser.webRequest.onBeforeRequest` to intercept navigation requests and re-open them in the correct container. This must work on any URL the user visits during a security test. A blocking `webRequest.onAuthRequired` listener answers **proxy** authentication challenges (`isProxy` only) with the credentials the user configured for that proxy; it never answers a website's own authentication.

2. **User-Agent override** — When the user enables a User-Agent override, the extension replaces the `User-Agent` header via `webRequest.onBeforeSendHeaders`. This must apply to all URLs because the user may be testing any target site. No other header is added or changed.

The content script is injected on `<all_urls>` at `document_idle`. It reads page content only when the user explicitly runs the endpoint extractor — see **Content Script** below for exactly what it reads and where the results go.

### `cookies`

Required for Firefox to allow the extension to create and manage tabs tied to specific container cookie stores (`cookieStoreId`). Without this permission Firefox does not permit the extension to open URLs in specific container sessions.

The extension also calls `browser.cookies.getAll` and `browser.cookies.remove` for one user-initiated action: **Reset cookies** for a site in the site-assignment editor. It enumerates cookies for that hostname and its parent/sub-domains, scoped to the one container's `storeId`, and removes them. Cookies are never read for any other purpose, stored, or transmitted.

### `contextualIdentities`

Core functionality — creating, updating, querying, and deleting Firefox containers.

### `tabs`

Required to create tabs in specific containers, query which tabs belong to which container, move tabs between windows, and manage hidden/shown tab state.

### `storage` + `unlimitedStorage`

All configuration (container assignments, proxy presets, theme preference, hidden-tab lists) is stored locally via `browser.storage.local`. `unlimitedStorage` marks that storage as persistent, so Firefox will not evict a user's container assignments and hidden tabs under disk pressure.

### `contextMenus`

Adds right-click options: "Always open this site in [container]", "Hide this container", "Move tabs to a new window".

### Optional: `bookmarks`

Only requested when the user interacts with the bookmark context menu feature. Adds "Open bookmark in container" options.

### Optional: `browsingData`

Requested at the moment the user clicks **Reset cookies** for a site, or **Clear container storage** (which asks for a second click to confirm). Both are scoped to a single container (`cookieStoreId`); the former also to one site. Clear container storage removes that container's cookies, localStorage, IndexedDB and service workers.

### Optional: `proxy`

Only requested when the user enables the global proxy toggle or configures per-container proxies. Registers a `proxy.onRequest` listener.

### Optional: `nativeMessaging`

Only requested when the user expands the Mozilla VPN section in the container editor. Connects to the `mozillavpn` native messaging host (the official Mozilla VPN desktop client). No other native hosts are contacted.

---

## External Network Connections

### jsDelivr CDN (User-Agent list)

The extension fetches User-Agent string lists from:

```
https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@e1dad9fe.../src/index.json
https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@e1dad9fe.../src/desktop.json
https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@e1dad9fe.../src/mobile.json
```

Key security details:
- The commit hash is **pinned** (`e1dad9fe2c6255198fff142e36aaddc5b5adc0d2`) — this is not a rolling `@latest` reference
- The data is a simple JSON array of UA strings; each string is validated (must be a non-empty string under 1024 characters)
- Results are cached locally for 7 days
- The fetch is **lazy** — it only occurs when the user actively enables the User-Agent override feature, not on every startup
- No browsing data, container configuration, or user identifiers are transmitted

This is the only connection the extension makes to the internet. The CSP limits `connect-src` to `https://cdn.jsdelivr.net` and the Burp Highlighter's control ports (below).

### Burp Highlighter connection (user-configured, local)

Only after the user pairs PhoenixBox with the companion Burp extension (by pasting a pairing string that Burp shows), the background page makes HTTP `POST` requests to that Burp extension's control server, at the address in the pairing string: the user's own Burp, normally `127.0.0.1:8079`. The body lists the containers the user marked for highlighting (container ID, name, colour), and the reply says which proxy listener each one got. Requests carry the pairing token in an `Authorization` header. Nothing is sent before pairing, and nothing is sent anywhere else.

The Burp extension's control port is 8079–8099 on whichever host Burp runs, which may be a LAN address, so the CSP allows exactly `http://*:8079` … `http://*:8099`.

### No other external connections

- No analytics or telemetry
- No phoning home to developer servers
- `data_collection_permissions.required` is set to `["none"]`

---

## CSP Notes

```
default-src 'self'; script-src 'self'; style-src 'self'; connect-src https://cdn.jsdelivr.net http://*:8079 http://*:8080 … http://*:8099; object-src 'none';
```

- `connect-src https://cdn.jsdelivr.net` is the narrowest origin-level scope CSP allows (path restrictions are not supported in CSP `connect-src` directives). The actual URLs are further restricted in code via pinned commit hash.
- `http://*:8079` … `http://*:8099` (21 explicit ports) is the Burp Highlighter's control server, on whatever host the user's Burp runs. Only the address from the user's pairing string is ever contacted.

---

## Content Script

The content script (`js/content-script.js`, ~120 lines, `document_idle`) only acts on `runtime.onMessage` from the extension's own background page (`sender.id === browser.runtime.id`). It does two things:

1. **Notification toast** — shows a brief slide-down message (e.g. "Successfully assigned site to always open in this container"). It is built inside a closed shadow root with `createElement`/`textContent` and styled through CSSOM — no stylesheet is injected into pages, and never `innerHTML`.
2. **Endpoint extraction** — only when the user explicitly clicks **Extract Endpoints** in the page-action popup (the icon in the address bar). It reads that page's HTML source (`document.documentElement.outerHTML`) and the text of its inline `<script>` elements, and returns the quoted URL paths it finds (e.g. `/api/v1/users`). Nothing else is extracted — no form values, cookies, or credentials.

Extraction results are stored only in `browser.storage.local` so the results tab survives a reload, capped at the five most recent scans, and deleted at every browser startup. They are never transmitted anywhere. The content script does not modify page content.

---

## Known web-ext Lint Warnings

`web-ext lint` reports two `UNSAFE_VAR_ASSIGNMENT` warnings for `innerHTML` in `popup/assets/index-*.js`. These originate entirely from React 18's internal DOM reconciler (minified into the bundle by Vite) — specifically React's synthetic event system probing CSS animation event names on a temporary detached `<div>`. No extension-authored code writes to `innerHTML`. The legacy background scripts and content script use `innerText`, `textContent`, and `createElement` exclusively.

---

## Build Instructions

### Environment Requirements

- **OS**: macOS or Linux (the npm scripts use POSIX shell syntax)
- **Node.js**: 22.18 or later, below 25 (tested with 22.x and 24.x) — https://nodejs.org
- **npm**: bundled with Node; dependencies are pinned by `package-lock.json`

### Steps

```bash
# 1. Install the exact locked dependency tree
npm ci

# 2. Build the extension (outputs zip to web-ext-artifacts/)
npm run build

# 3. Run type-check, linters and unit tests (optional verification)
npm test
```

The built extension will be in `dist/` and the packaged zip in `web-ext-artifacts/phoenixbox-3.1.0.zip`.

### What the build does

The React popup (`src/popup-ui/`) is compiled by Vite into `dist/popup/`. The build script (`scripts/build-extension.mjs`) then copies all legacy JS, CSS, images, fonts, and locales alongside the Vite output into `dist/`, copies `manifest.json`, and `web-ext build` packages the final XPI.

---

## Relationship to Multi-Account Containers

PhoenixBox is based on Mozilla's [Multi-Account Containers](https://github.com/mozilla/multi-account-containers) (MPL-2.0). It retains the core container management, site assignment, and tab routing logic, and adds security-testing-specific features (proxy management, Burp Suite integration, User-Agent spoofing, security-profile containers). The popup UI has been rewritten in React/TypeScript.
