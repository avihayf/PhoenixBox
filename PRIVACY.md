# Privacy Policy for Phoenix Box


## Overview

Phoenix Box is a browser extension designed for security testing and penetration testing workflows. This privacy policy explains our commitment to protecting your privacy.

## Data Collection

**Phoenix Box does not collect telemetry or send your data to developer-controlled servers.**

Core extension data stays within your local Firefox browser unless you explicitly enable optional sync:

- Container configurations are stored locally using Firefox's `storage.local` API
- Site assignments are stored locally on your device
- Proxy configurations remain local to your browser
- Proxy authentication passwords are kept in memory only for the current browser session
- User-Agent settings are stored locally
- No analytics, telemetry, or tracking of any kind

Phoenix Box's content script does not read page content, form data, or credentials. It only displays extension-triggered notification toasts on pages when the extension sends a message to it.

Phoenix Box does, however, intentionally interact with the sites you browse as part of its core functionality:

- It can modify outbound requests by overriding the `User-Agent` header
- It can add the `X-MAC-Container-Color` header when Burp highlighting is enabled
- It can route your traffic through user-configured proxies or Mozilla VPN integration

These behaviors are product features for security testing workflows, not telemetry.

## Permissions Justification

Phoenix Box requires certain browser permissions to function:

### Core Permissions

- **`<all_urls>`**: Required to inject container color headers for Burp Suite integration and apply per-container proxy settings to any site you visit during security testing.

- **`webRequest` and `webRequestBlocking`**: Required to add custom HTTP headers (`X-MAC-Container-Color`) for Burp Suite integration and to override User-Agent strings per container.

- **`contextualIdentities`**: Required to create, manage, and isolate browser containers, which is the core functionality of this extension.

- **`cookies`**: Required to manage and clear cookies within specific containers for session isolation during security testing.

- **`tabs`**: Required to open, manage, and organize tabs within their assigned containers.

- **`storage` and `unlimitedStorage`**: Required to store container configurations, site assignments, and user preferences locally on your device.

- **`contextMenus`**: Required to add context menu options for opening sites in specific containers.

- **`activeTab`**: Required to determine the current tab's container for page-specific actions.

- **`history`**: Required only to remove internal confirmation-page URLs from your browsing history so they don't clutter the address bar. Phoenix Box does not read or query your browsing history.

### Optional Permissions

- **`bookmarks`**: Only if you enable bookmark menu features
- **`browsingData`**: Only if you use the "clear container storage" feature
- **`proxy`**: Only if you enable advanced proxy configuration features
- **`nativeMessaging`**: Only if you enable Mozilla VPN integration features (not active by default)

## External Connections

The extension may make the following external connections:

1. **User-Agent List Updates**: The extension fetches a pinned, public list of top user agents from `https://cdn.jsdelivr.net` (the microlinkhq/top-user-agents CDN) only when you use the User-Agent override feature. This request is lazy, cached locally for 7 days, and does not transmit browsing history, container configuration, or user identifiers.

This is the only external network connection Phoenix Box makes. It is explicitly allowed in the Content Security Policy and can be avoided by not using the User-Agent override feature.

2. **Optional Firefox Sync**: If you explicitly enable sync, Phoenix Box stores supported configuration data in `browser.storage.sync`, which is tied to your Mozilla account. Passwords are not synced, and proxy authentication passwords are never written to extension storage.

## Third-Party Services

Phoenix Box does not integrate with any third-party analytics, advertising, or tracking services. Its Firefox manifest also declares `data_collection_permissions.required` as `["none"]`.

### Mozilla VPN Integration (Optional)

If you explicitly enable the Mozilla VPN integration feature and grant the `nativeMessaging` permission, the extension may communicate with the Mozilla VPN desktop client installed on your computer. This communication happens entirely locally between the extension and the VPN client. No data is transmitted to external servers as part of this integration.

### Burp Suite Integration

When you enable the "Add container color header" feature, the extension adds an `X-MAC-Container-Color` HTTP header to your requests. This header is visible to:

- Your configured proxy (e.g., Burp Suite running locally)
- The target website server (unless stripped by your proxy)

This is intentional for security testing workflows. The Burp Suite extension (`PhoenixBoxHighlighter.jar`) is designed to strip this header before forwarding requests to prevent fingerprinting. If you enable the header without routing traffic through Burp, or if the Burp extension is not stripping it, the target site can still see it.

## Data Sharing

Phoenix Box does not share telemetry or analytics data with third parties. Extension configuration remains local unless you explicitly enable Firefox Sync.

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

Phoenix Box is open source under the Mozilla Public License 2.0. You can review the complete source code at [https://github.com/avihayf/PhoenixBox](https://github.com/avihayf/PhoenixBox).

---

**Summary**: Phoenix Box does not collect telemetry or track users. It operates locally, keeps proxy passwords in memory only, and makes only one optional external request for User-Agent lists, plus optional Firefox Sync when you choose to enable it.
