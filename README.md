# PhoenixBox

[![License](https://img.shields.io/badge/License-MPL%202.0-blue.svg)](https://opensource.org/licenses/MPL-2.0)
[![Version](https://img.shields.io/badge/version-2.0.0-green.svg)](https://github.com/avihayf/PhoenixBox/releases)

**Run different sessions side by side in Firefox, create any custom containers you want, route the right traffic through Burp and Highlight your traffic, and test faster without session collisions.**

https://github.com/user-attachments/assets/a523d122-7a06-4dc4-a637-e08beb440f68

---

## Quick Start

1. Install PhoenixBox from [Firefox Add-ons (AMO)](https://addons.mozilla.org/firefox/addon/phoenix-box/) or download `PhoenixBox.xpi` from [Releases](https://github.com/avihayf/PhoenixBox/releases).
2. Open the PhoenixBox popup and start testing with the built-in Attacker, Victim, Admin, and Member containers.
3. For Burp highlighting, also install `PhoenixBoxHighlighter.jar` in Burp Suite and enable **PhoenixBox Highlighter**.

---

## Features

- **Ready-to-go containers** — Attacker, Victim, Admin, Member ship out of the box. Create as many custom ones as you need.
- **Proxy routing (global + per-container)** — send everything through Burp, or route only one role through a proxy while keeping the rest clean. Save custom presets and switch with one click.
- **User-Agent spoofing** — swap browser identity globally or per-container. Pick from a live top-100 list (desktop, mobile, all), paste a custom string, or save presets for quick switching.
- **Burp Suite highlighting** — the `X-MAC-Container-Color` header lets the companion JAR color-code HTTP history by container so you instantly see which role fired each request.
- **Site assignments** — lock a domain to a container and it always opens there. No more "wrong session" surprises.
- **Full session isolation** — cookies, storage, and cache stay walled off between containers. Zero bleed.
- **Mozilla VPN integration** — route specific containers through VPN while the rest go direct.
- **Dark/light themes, accent colors, keyboard shortcuts** — make it yours.
- **Security-focused icons** (skull, user-x, user-cog, user-minus) — display correctly in the PhoenixBox UI; Firefox's URL bar falls back to **fingerprint** since custom icons aren't part of the native `contextualIdentities` API.

---

## Installation

### End Users

Works on any Firefox (release, ESR, Developer Edition, or Nightly).

**Option A — Firefox Add-ons (recommended):**
Search for "PhoenixBox" on [addons.mozilla.org](https://addons.mozilla.org) and click **Add to Firefox**.

**Option B — Manual install from GitHub Releases:**
1. Download `PhoenixBox.xpi` from [GitHub Releases](https://github.com/avihayf/PhoenixBox/releases) and `PhoenixBoxHighlighter.jar` from the [PhoenixBox-Highlighter releases page](https://github.com/avihayf/PhoenixBox-Highlighter/releases/tag/v1.0.0).
2. Drag `PhoenixBox.xpi` into Firefox and confirm the installation prompt.
3. Pin the PhoenixBox toolbar icon if needed.

If you want Burp integration, also install `PhoenixBoxHighlighter.jar` in Burp Suite:

1. Open Burp Suite.
2. Go to **Extender** → **Extensions** → **Add**.
3. Select **Java** as the extension type.
4. Choose `PhoenixBoxHighlighter.jar`.
5. Click **Next** and verify that “PhoenixBox” loads successfully.

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

1. Click the PhoenixBox toolbar icon.
2. Use the preconfigured containers or create your own.
3. Open tabs in different containers to separate roles, sessions, and identities.
4. Assign sites to containers so important targets always reopen in the right context.
5. Optionally enable proxying, User-Agent overrides, Mozilla VPN, or Burp highlighting.

Popular workflows:

- Open a new tab in a specific container
- Always open a site in one container
- Route all traffic through Burp with the global proxy toggle
- Route only one role through a proxy with per-container settings
- Spoof User-Agent globally or per-container — pick from the top-100 list, paste a custom string, or load a saved preset
- Clear cookies/storage to reset a test flow

---

## Burp Suite Integration

PhoenixBox can add an `X-MAC-Container-Color` header to requests so Burp can visually separate traffic by container role.

Basic setup:

1. Download and install `PhoenixBoxHighlighter.jar` from the [PhoenixBox-Highlighter releases page](https://github.com/avihayf/PhoenixBox-Highlighter/releases/tag/v1.0.0) into Burp Suite via **Extender → Extensions → Add**.
2. Configure Firefox to send traffic through Burp.
3. Enable **Add container color header** in PhoenixBox.
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
- **Spoof User-Agents on demand** — flip to a mobile string for one container, keep desktop on another, or save presets so you switch in one click
- **Track traffic visually in Burp** so you instantly know which container, role, or scenario produced each request

---

## Privacy & Security

No telemetry, no data collection. See [PRIVACY.md](PRIVACY.md) for full details on data handling, proxy password storage, the container color header, and sync behavior.

---

## Support

- 🐛 [Report Issues](https://github.com/avihayf/PhoenixBox/issues)
- 💬 [Discussions](https://github.com/avihayf/PhoenixBox/discussions)
- 📧 Contact: See GitHub profile

---

## License

Mozilla Public License 2.0 - See [LICENSE](LICENSE) file for details.
