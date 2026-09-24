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
- It can add the `X-MAC-Container-Color` and `X-MAC-Container-Name` headers when Burp highlighting is enabled
- It can route your traffic through user-configured proxies or Mozilla VPN integration

These behaviors are product features for security testing workflows, not telemetry.

## Permissions Justification

PhoenixBox requires certain browser permissions to function:

### Core Permissions

- **`<all_urls>`**: Required to inject container color headers for Burp Suite integration and apply per-container proxy settings to any site you visit during security testing.

- **`webRequest` and `webRequestBlocking`**: Required to add custom HTTP headers (`X-MAC-Container-Color`, `X-MAC-Container-Name`) for Burp Suite integration and to override User-Agent strings per container.

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

This is the only external network connection PhoenixBox makes. It is explicitly allowed in the Content Security Policy and can be avoided by not using the User-Agent override feature.

2. **Optional Firefox Sync**: If you explicitly enable sync, PhoenixBox stores supported configuration data in `browser.storage.sync`, which is tied to your Mozilla account. Passwords are not synced, and proxy authentication passwords are never written to extension storage.

## Third-Party Services

PhoenixBox does not integrate with any third-party analytics, advertising, or tracking services. Its Firefox manifest also declares `data_collection_permissions.required` as `["none"]`.

### Mozilla VPN Integration (Optional)

If you explicitly enable the Mozilla VPN integration feature and grant the `nativeMessaging` permission, the extension may communicate with the Mozilla VPN desktop client installed on your computer. This communication happens entirely locally between the extension and the VPN client. No data is transmitted to external servers as part of this integration.

### Burp Suite Integration

When you enable the Highlighter feature, the extension adds `X-MAC-Container-Color` and `X-MAC-Container-Name` HTTP headers to your requests. The name is the container's own label (percent-encoded), so it may contain whatever you named that container. These headers are visible to:

- Your configured proxy (e.g., Burp Suite running locally)
- The target website server (unless stripped by your proxy)

This is intentional for security testing workflows. The Burp Suite extension (`PhoenixBoxHighlighter.jar`) is designed to strip both headers before forwarding requests to prevent fingerprinting. If you enable the feature without routing traffic through Burp, or if the Burp extension is not stripping them, the target site can still see them.

`X-MAC-Container-Name` is only stripped by **PhoenixBoxHighlighter v1.2.0 or later**, so PhoenixBox does not send it at all until you confirm in the Highlighter dialog that v1.2.0+ is loaded in Burp. Downloading the JAR does not count as confirming. Until then only `X-MAC-Container-Color` is sent. If you confirm while an older JAR is actually loaded, the container name will reach the target.

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
