# Privacy Policy for PhoenixBox

**Last Updated:** 2026-09-24 (v3.1.0)

## Overview

PhoenixBox is a browser extension designed for security testing and penetration testing workflows. This privacy policy explains our commitment to protecting your privacy.

## Data Collection

**PhoenixBox does not collect telemetry or send your data to developer-controlled servers.**

Core extension data stays within your local Firefox browser unless you explicitly enable optional sync:

- Container configurations are stored locally using Firefox's `storage.local` API
- Site assignments are stored locally on your device
- Proxy configurations remain local to your browser
- Proxy authentication passwords are kept in memory only for the current browser session
- User-Agent settings are stored locally
- No analytics, telemetry, or tracking of any kind

PhoenixBox's content script does two things, both triggered by the extension itself:

- It displays short notification toasts (for example, when you assign a site to a container).
- When **you** click **Extract Endpoints** in the address-bar popup, it reads that one page's HTML source and inline scripts and lists the URL paths it finds. It does not read form data, cookies, or credentials. The results are kept only in local extension storage so the results tab survives a reload — at most the five most recent scans, all deleted when the browser restarts — and are never sent anywhere.

It does not read page content at any other time.

PhoenixBox does, however, intentionally interact with the sites you browse as part of its core functionality:

- It can modify outbound requests by overriding the `User-Agent` header
- It can send the traffic of containers you mark for Burp highlighting to a dedicated Burp listener (see Burp Suite Integration below); requests themselves are not modified for this
- It can route your traffic through user-configured proxies or Mozilla VPN integration

These behaviors are product features for security testing workflows, not telemetry.

## Permissions Justification

PhoenixBox requires certain browser permissions to function:

### Core Permissions

- **`<all_urls>`**: Required to apply per-container proxy settings (including routing highlighted containers to their Burp listeners) and User-Agent overrides to any site you visit during security testing.

- **`webRequest` and `webRequestBlocking`**: Required to override User-Agent strings per container and to answer proxy authentication challenges.

- **`contextualIdentities`**: Required to create, manage, and isolate browser containers, which is the core functionality of this extension.

- **`cookies`**: Required to manage and clear cookies within specific containers for session isolation during security testing.

- **`tabs`**: Required to open, manage, and organize tabs within their assigned containers.

- **`storage` and `unlimitedStorage`**: Required to store container configurations, site assignments, and user preferences locally on your device.

- **`contextMenus`**: Required to add context menu options for opening sites in specific containers.


### Optional Permissions

- **`bookmarks`**: Only if you enable bookmark menu features
- **`browsingData`**: Only if you use the "clear container storage" feature
- **`proxy`**: Only if you enable advanced proxy configuration features
- **`nativeMessaging`**: Only if you enable Mozilla VPN integration features (not active by default)

## External Connections

The extension may make the following external connections:

1. **User-Agent List Updates**: The extension fetches a pinned, public list of top user agents from `https://cdn.jsdelivr.net` (the microlinkhq/top-user-agents CDN) only when you use the User-Agent override feature. This request is lazy, cached locally for 7 days, and does not transmit browsing history, container configuration, or user identifiers. As with any network request, the CDN operator can see the IP address it comes from and the time it was made; the request is pinned to a fixed revision and is repeated at most once every 7 days.

This is the only connection PhoenixBox makes to a service on the internet. It is explicitly allowed in the Content Security Policy and can be avoided by not using the User-Agent override feature.

2. **Phoenix Highlighter (Burp Suite)**: Only after you pair PhoenixBox with the Highlighter extension in Burp, PhoenixBox sends it the list of containers you marked for highlighting (container ID, name and colour) over HTTP, to the address in the pairing string: your own Burp, normally on `127.0.0.1`. This goes nowhere else. The Content Security Policy allows only the Highlighter's control ports (8079–8099).

3. **Optional Firefox Sync**: If you explicitly enable sync, PhoenixBox stores supported configuration data in `browser.storage.sync`, which is tied to your Mozilla account. Passwords are not synced, and proxy authentication passwords are never written to extension storage.

## Third-Party Services

PhoenixBox does not integrate with any third-party analytics, advertising, or tracking services. Its Firefox manifest also declares `data_collection_permissions.required` as `["none"]`.

### Mozilla VPN Integration (Optional)

If you explicitly enable the Mozilla VPN integration feature and grant the `nativeMessaging` permission, the extension may communicate with the Mozilla VPN desktop client installed on your computer. This communication happens entirely locally between the extension and the VPN client. No data is transmitted to external servers as part of this integration.

### Burp Suite Integration

Burp highlighting does not modify your requests. Each container you mark with the Highlighter button gets its own Burp proxy listener, opened by the companion Burp extension (Phoenix Highlighter, v2.0.0 or later). PhoenixBox sends that container's traffic to its listener, and Burp tells which container a request came from by the listener it arrived on. Nothing is added to the request, so nothing can reach the target site even if the Burp extension is missing or unloaded.

To set this up, PhoenixBox and the Burp extension are paired once: you copy a pairing string (address and secret token) from Burp into PhoenixBox. PhoenixBox then sends the Burp extension the ID, name and colour of each marked container, so Burp can colour and name its traffic. The token is stored in local extension storage and is never synced.

Earlier versions of PhoenixBox added `X-MAC-Container-Color` and `X-MAC-Container-Name` headers instead; this version never adds them.

## Data Sharing

PhoenixBox does not share telemetry or analytics data with third parties. Extension configuration remains local unless you explicitly enable Firefox Sync.

## Your Rights

Since all data is stored locally on your device unless you explicitly enable sync:

- You can view your data through Firefox's extension storage tools
- You can delete all extension data by removing the extension
- You can clear specific container data using the extension's "Clear Container Storage" feature

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date at the top of this document and in new releases of the extension.

## Contact

If you have questions about this privacy policy, please:

- Open an issue on [GitHub](https://github.com/avihayf/PhoenixBox/issues)
- Contact the developer through the GitHub profile

## Open Source

PhoenixBox is open source under the Mozilla Public License 2.0. You can review the complete source code at [https://github.com/avihayf/PhoenixBox](https://github.com/avihayf/PhoenixBox).

---

**Summary**: PhoenixBox does not collect telemetry or track users. It operates locally, keeps proxy passwords in memory only, and makes only one optional external request for User-Agent lists, plus optional Firefox Sync when you choose to enable it.
