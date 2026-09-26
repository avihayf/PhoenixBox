# Changelog

All notable changes to PhoenixBox are recorded here.

## 3.1.0

### Burp Suite integration
- **Highlighting no longer touches your requests.** Mark a container with the new highlighter button (next to Promote) and it gets its own Burp proxy listener; Burp colours its traffic and notes the container name by the listener it arrives on. The `X-MAC-Container-Color` header is gone, so nothing can reach the target even if the Burp extension isn't loaded. Requires **Phoenix Highlighter v2.0.0 or later**.
- **Pair once.** Copy the pairing string from Burp's new PhoenixBox tab into the Highlighter tile. The tile now shows whether PhoenixBox is connected and why a container has no listener.
- Listeners use free ports from 18080 on the Burp preset's IP and never take a port another program holds. A container keeps its port, and can be pinned to an exact address, including a listener you built in Burp.
- The global Highlighter switch, the JAR-version confirmation and the preset's "Turn on the Highlighter" option are gone. Highlighting is off until you mark containers.

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
