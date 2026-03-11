# Notes to AMO Reviewer — Phoenix Box v1.0.0

## What This Extension Does

Phoenix Box is a multi-container browser extension for security testing and penetration testing workflows. It is based on Mozilla's Multi-Account Containers and adds:

- Per-container proxy configuration (HTTP, HTTPS, SOCKS4, SOCKS5)
- A global proxy toggle for routing all container traffic through Burp Suite
- An `X-MAC-Container-Color` HTTP header that lets the companion Burp Suite extension auto-highlight requests by container color
- Per-container User-Agent overrides using a curated list from a public CDN
- Optional Mozilla VPN integration via native messaging

The extension is open source under MPL-2.0:
https://github.com/avihayf/PhoenixBox

---

## Permission Justification

### `<all_urls>` + `webRequest` + `webRequestBlocking`

These three permissions work together and are essential for two core features:

1. **Proxy routing** — The extension uses `browser.proxy.onRequest` (optional `proxy` permission) and `browser.webRequest.onBeforeRequest` to intercept navigation requests and re-open them in the correct container. This must work on any URL the user visits during a security test.

2. **HTTP header modification** — When the user enables "Paint the Burp" or a User-Agent override, the extension adds/replaces headers via `webRequest.onBeforeSendHeaders`. This must apply to all URLs because the user may be testing any target site.

The content script injected on `<all_urls>` at `document_start` is minimal (55 lines) and only listens for `runtime.onMessage` from the extension's own background script to display a brief notification toast. It does not read or modify page content.

### `cookies`

Required for Firefox to allow the extension to create and manage tabs tied to specific container cookie stores (`cookieStoreId`). Without this permission Firefox does not permit the extension to open URLs in specific container sessions. The extension does not call `browser.cookies.*` directly; cookie-clearing within a container is handled by the optional `browsingData` permission.

### `contextualIdentities`

Core functionality — creating, updating, querying, and deleting Firefox containers.

### `tabs`

Required to create tabs in specific containers, query which tabs belong to which container, move tabs between windows, and manage hidden/shown tab state.

### `storage` + `unlimitedStorage`

All configuration (container assignments, proxy presets, theme preference) is stored locally via `browser.storage.local`. `unlimitedStorage` is requested because users with many containers and site assignments may exceed the default 5 MB quota.

### `activeTab`

Used to determine the current tab's container context for page-action and context-menu actions.

### `contextMenus`

Adds right-click options: "Always open this site in [container]", "Hide this container", "Move tabs to a new window".

### Optional: `bookmarks`

Only requested when the user interacts with the bookmark context menu feature. Adds "Open bookmark in container" options.

### Optional: `browsingData`

Only requested when the user clicks "Clear cookies for this site" in the site assignment editor. Scoped to a specific hostname and container.

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

This is the only external connection the extension makes. The CSP explicitly limits `connect-src` to `https://cdn.jsdelivr.net`.

### No other external connections

- No analytics or telemetry
- No phoning home to developer servers
- `data_collection_permissions.required` is set to `["none"]`

---

## CSP Notes

```
default-src 'self'; script-src 'self'; style-src 'self'; connect-src https://cdn.jsdelivr.net; object-src 'none';
```

- `connect-src https://cdn.jsdelivr.net` is the narrowest origin-level scope CSP allows (path restrictions are not supported in CSP `connect-src` directives). The actual URLs are further restricted in code via pinned commit hash.

---

## Content Script

The content script (`js/content-script.js`) is 55 lines and does only one thing: it listens for `runtime.onMessage` from the extension's background script and shows a brief slide-down notification toast (e.g., "Successfully assigned site to always open in this container"). It uses `innerText` (not `innerHTML`) and only accepts messages where `sender.id === browser.runtime.id`. It does not read, modify, or exfiltrate any page content.

---

## Known web-ext Lint Warnings

`web-ext lint` reports two `UNSAFE_VAR_ASSIGNMENT` warnings for `innerHTML` in `popup/assets/index-*.js`. These originate entirely from React 18's internal DOM reconciler (minified into the bundle by Vite) — specifically React's synthetic event system probing CSS animation event names on a temporary detached `<div>`. No extension-authored code writes to `innerHTML`. The legacy background scripts and content script use `innerText`, `textContent`, and `createElement` exclusively.

---

## Build Instructions

```bash
npm install
npm run build    # outputs to dist/ and web-ext-artifacts/
npm test         # runs lint + unit tests
```

The React popup is built with Vite; the build script (`scripts/build-extension.mjs`) copies legacy extension files alongside the Vite output into `dist/`, then `web-ext build` packages the XPI.

Source code is also available as a zip via `npm run package:source`.

---

## Relationship to Multi-Account Containers

Phoenix Box is based on Mozilla's [Multi-Account Containers](https://github.com/mozilla/multi-account-containers) (MPL-2.0). It retains the core container management, site assignment, and tab routing logic, and adds security-testing-specific features (proxy management, Burp Suite integration, User-Agent spoofing, security-profile containers). The popup UI has been rewritten in React/TypeScript.
