# Changelog

All notable changes to PhoenixBox are recorded here.

## 3.1.0

### Burp Suite integration
- **Container names in Burp.** With the Highlighter on, requests also carry `X-MAC-Container-Name`, so Burp can label Repeater tabs by container. The name is percent-encoded, capped at 64 characters, and cannot inject headers.
- **The name is only sent after you confirm Phoenix Highlighter v1.2.0 or later is loaded in Burp.** Older JARs do not strip it, so it would reach the target. Downloading the JAR does not count as confirming. The colour header is unaffected.
- The Highlighter setting is stored under a new key (`highlighterHeadersEnabled`); existing settings are migrated automatically.

### Proxy
- Authenticated global proxies now work in the session they are configured. The password was being discarded moments after it was entered.
- HTTP and HTTPS proxy credentials are now used. Previously only SOCKS proxies received them, and Firefox showed its own login prompt.
- Service-worker requests and other requests without a tab are routed through the container's proxy instead of going direct.
- Re-granting the proxy permission, or deleting a promoted container, no longer leaves the proxy shown as on while traffic goes direct.
- Passwords are never written to disk, including partially typed ones.
- Proxy URLs accept `socks5://`, `socks5h://`, IPv6 hosts and explicit ports 80/443; percent-encoded credentials are decoded.
- Presets are no longer treated as Mozilla VPN proxies, and the container view shows the proxy the container actually uses.

### Containers
- **Hide** and **Move tabs to a new window** now act on the container's tabs in every window. Un-hiding restores every hidden tab. Tabs that cannot be reopened (`file://`, `view-source:`) are left open instead of being lost.
- Hiding a container while it is being un-hidden no longer loses tabs.
- Your container colours, icons and names are no longer reset. The security-profile defaults apply once, to a fresh profile.
- Deleting a container also removes its proxy promotion, User-Agent, icon and keyboard shortcut.
- **Clear container storage** asks for confirmation and reports whether it worked. It now also clears IndexedDB and service workers.
- Navigating to an assigned site from a background window no longer loses the page.

### Sync
- Container changes are backed up again; they were failing whenever sync was on.
- Deleted proxy presets stay deleted across devices.
- Two synced devices no longer trigger each other's backups indefinitely.

### Interface
- The page-action popup can be used from the keyboard; dialogs close with Escape and have accessible labels.
- The options-page theme menu now applies to every PhoenixBox page.
- User-Agent labels correctly identify Android, iOS/iPadOS and Opera; clearing an override turns the feature off.
- Endpoint extraction says when a page could not be scanned, instead of reporting zero endpoints.
- Sites can no longer detect PhoenixBox through an injected stylesheet.

### Performance and size
- The extension package is 1.5 MB, down from 11.4 MB.
- The popup no longer polls every three seconds, and no longer rewrites your containers each time it opens.
- Fewer whole-storage reads, a proxy fast path when no proxy is configured, and the context menu is rebuilt only for the tab on screen.

### Permissions
- Removed `activeTab`, which was redundant.
