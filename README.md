# Phoenix Box

[![License](https://img.shields.io/badge/License-MPL%202.0-blue.svg)](https://opensource.org/licenses/MPL-2.0)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/avihayf/PhoenixBox/releases)

**Run attacker, victim, admin, and member sessions side by side in Firefox, create any custom containers you want, route the right traffic through Burp, and test faster without session collisions.**

---

## Quick Start

1. Download `PhoenixBox.xpi` from [Releases](https://github.com/avihayf/PhoenixBox/releases).
2. Install it in Firefox Developer Edition or Firefox Nightly.
3. Open the Phoenix Box popup and start testing with the built-in Attacker, Victim, Admin, and Member containers.
4. For Burp highlighting, also install `PhoenixBoxHighlighter.jar` in Burp Suite and enable **Add container color header**.

---

## Features

- Preconfigured **Attacker**, **Victim**, **Admin**, and **Member** containers
- Per-container and global **proxy routing** for Burp or other tools
- **Burp Suite highlighting** via `X-MAC-Container-Color` and the companion JAR
- Global and per-container **User-Agent overrides**
- **Site assignments** and site-isolation workflows
- Full **cookie and storage separation** between containers
- **Mozilla VPN integration** for optional per-container VPN routing
- Dark/light themes, accent colors, keyboard shortcuts, and multi-language support

---

## Installation

### End Users

Phoenix Box is currently intended for Firefox Developer Edition or Firefox Nightly.

1. Download the latest release assets from [GitHub Releases](https://github.com/avihayf/PhoenixBox/releases):
   - `PhoenixBox.xpi` for the Firefox extension
   - `PhoenixBoxHighlighter.jar` for Burp Suite integration
2. Open Firefox Developer Edition.
3. Go to `about:config`.
4. Set `xpinstall.signatures.required` to `false`.
5. Drag `PhoenixBox.xpi` into Firefox and confirm the installation prompt.
6. Pin the Phoenix Box toolbar icon if needed.

If you want Burp integration, also install `PhoenixBoxHighlighter.jar` in Burp Suite:

1. Open Burp Suite.
2. Go to **Extender** → **Extensions** → **Add**.
3. Select **Java** as the extension type.
4. Choose `PhoenixBoxHighlighter.jar`.
5. Click **Next** and verify that “Phoenix Box” loads successfully.

### Developers

```bash
git clone https://github.com/avihayf/PhoenixBox.git
cd PhoenixBox
npm install
npm run build
```

Then load the built extension:

1. Open Firefox Developer Edition.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `dist/manifest.json`.

---

## How To Use

1. Click the Phoenix Box toolbar icon.
2. Use the preconfigured containers or create your own.
3. Open tabs in different containers to separate roles, sessions, and identities.
4. Assign sites to containers so important targets always reopen in the right context.
5. Optionally enable proxying, User-Agent overrides, Mozilla VPN, or Burp highlighting.

Popular workflows:

- Open a new tab in a specific container
- Always open a site in one container
- Route all traffic through Burp with the global proxy toggle
- Route only one role through a proxy with per-container settings
- Spoof browser identity with global or per-container User-Agent overrides
- Clear cookies/storage to reset a test flow

---

## Burp Suite Integration

Phoenix Box can add an `X-MAC-Container-Color` header to requests so Burp can visually separate traffic by container role.

Basic setup:

1. Install `PhoenixBoxHighlighter.jar` in Burp Suite.
2. Configure Firefox to send traffic through Burp.
3. Enable **Add container color header** in Phoenix Box.
4. Browse in different containers and check Burp HTTP history.

The Burp companion extension strips the header before the request reaches the target server.

---

## Learn More

- [Features](docs/FEATURES.md)
- [Installation Guide](docs/INSTALLATION.md)
- [Burp Suite Setup](docs/BURP_SUITE_SETUP.md)

---

## Use Cases

- **Isolate every session** so login state, cookies, and storage never bleed between targets or test accounts
- **Test different privilege levels side by side** with separate Attacker, Victim, Admin, and Member flows
- **Replay the same workflow as different users** without logging in and out all day
- **Route specific roles through Burp or another proxy** while keeping the rest of your browsing clean
- **Spoof different User-Agents on demand** to check mobile-only paths, browser-specific logic, and fingerprint-based behavior
- **Track traffic visually in Burp** so you instantly know which container, role, or scenario produced each request

---

## Security Notes

### Proxy Password Storage

Proxy authentication passwords are held **in memory only** for the current browser session. They are never written to `browser.storage.local` or synced across devices. This means:

- Website logins inside containers persist normally across restarts (cookies are stored per-container).
- Proxy auth credentials will need to be re-entered after a Firefox restart.
- Proxy presets (scheme, host, port) are saved and optionally synced, but passwords are excluded.

### Container Color Header (Paint the Burp)

When "Add container color header" is enabled, every HTTP request from a container tab includes an `X-MAC-Container-Color` header. This is intended for local Burp Suite highlighting and should be **disabled when testing against live targets** to avoid:

- Fingerprinting: the non-standard header uniquely identifies Phoenix Box users.
- OPSEC leakage: the color value can reveal your container role (e.g. "red" = Attacker).

The companion Burp Suite extension (`PhoenixBoxHighlighter.jar`) strips this header before forwarding to the target server, so traffic through Burp is clean. Direct browser traffic (without Burp) will carry the header to the server if this feature is on.

### Sync

Profile sync uses `browser.storage.sync` tied to your Mozilla account. Proxy topology metadata (host, port, scheme) may be synced; passwords are never synced. If you are working in a sensitive environment, consider leaving sync disabled.

---

## Support

- 🐛 [Report Issues](https://github.com/avihayf/PhoenixBox/issues)
- 💬 [Discussions](https://github.com/avihayf/PhoenixBox/discussions)
- 📧 Contact: See GitHub profile

---

## License

Mozilla Public License 2.0 - See [LICENSE](LICENSE) file for details.
