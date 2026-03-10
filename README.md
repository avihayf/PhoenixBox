# Phoenix Box

[![License](https://img.shields.io/badge/License-MPL%202.0-blue.svg)](https://opensource.org/licenses/MPL-2.0)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/avihaife-cmyk/PhoenixBox/releases)

**PhoenixBox Multi-Container extension for security testing with Burp Suite**

A powerful Firefox multi-container extension specifically designed for security testing and penetration testing workflows with seamless Burp Suite integration.

---

## Features

### Core Features

- 🎨 **8 Container Colors** - Visual organization with Firefox container colors: blue, turquoise, green, yellow, orange, red, pink, and purple
- 🌓 **Dark/Light Mode** - Full theme support with 5 accent color schemes (Cyan, Green/Matrix, Purple/Cyberpunk, Pink/Neon, Orange/Warm)
- 🔥 **Burp Suite Integration** - Auto-highlight HTTP requests by container color in Burp Suite
- 🎯 **Pre-configured Security Containers** - Ready-to-use Attacker, Victim, Admin, and Member containers
- 🔧 **Flexible Proxy Management** - Set one global proxy for all containers or configure each individually
- 🛡️ **Session Isolation** - Complete cookie and storage separation between containers
- 👤 **User-Agent Spoofing** - Top 100 user agents from CDN, auto-updated weekly (300M+ requests data, bot-filtered)
- 🔒 **Stealth Mode** - Container color headers stripped before reaching target servers
- 📦 **Container Management** - Create, edit, delete, and organize unlimited containers
- 🔗 **Site Assignments** - Automatically open specific sites in designated containers
- 🌐 **Multi-language Support** - Available in 50+ languages

### Developer Features

- Built with **React**, **TypeScript**, and **Vite**
- Modern UI with **Radix UI** and **Tailwind CSS**
- WebExtension API
- **Mozilla Public License 2.0**

---

## Installation

### Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/avihaife-cmyk/PhoenixBox.git
cd PhoenixBox

# Install dependencies
npm install

# Build the extension
npm run build

# Load in Firefox Developer Edition
# 1. Open Firefox Developer Edition
# 2. Go to about:debugging#/runtime/this-firefox
# 3. Click "Load Temporary Add-on"
# 4. Select dist/manifest.json
```

### For End Users (Pre-built Release)

1. Download the latest `.xpi` file from [GitHub Releases](https://github.com/avihaife-cmyk/PhoenixBox/releases)
2. Open Firefox Developer Edition
3. Go to `about:config` and set `xpinstall.signatures.required` to `false`
4. Drag and drop the `.xpi` file into Firefox
5. Download `Phoenix-Highlighter.jar` for Burp Suite integration (see below)

---

## Burp Suite Integration

Phoenix Box automatically adds `X-MAC-Container-Color` headers to HTTP requests, allowing you to visually distinguish traffic from different containers in Burp Suite.

### Setup

1. **Download the Burp Extension**

   - Download `Phoenix-Highlighter.jar` from [Releases](https://github.com/avihaife-cmyk/PhoenixBox/releases)

2. **Install in Burp Suite**

   - Open Burp Suite
   - Go to **Extender** → **Extensions** → **Add**
   - Select **"Java"** as extension type
   - Choose the downloaded JAR file
   - Click **"Next"**

3. **Enable in Firefox**

   - Click the Phoenix Box icon in Firefox toolbar
   - Toggle **"Add container color header"** to ON

4. **Test It**
   - Open a tab in the **Attacker** container (red)
   - Navigate to any website
   - Check Burp's **Proxy** → **HTTP history**
   - Request should be automatically highlighted in **red**

### How It Works

1. **Firefox Extension** adds `X-MAC-Container-Color` header to each request
2. **Burp Extension** reads the header and auto-highlights the request
3. **Burp Extension** strips the header before forwarding to the target (stealth mode)

See [`docs/BURP_SUITE_SETUP.md`](docs/BURP_SUITE_SETUP.md) for detailed setup instructions and troubleshooting.

---

## Key Features Explained

### Theme System

- **Light Mode** - Clean, vibrant interface with enhanced contrast
- **Dark Mode** - Cyberpunk-inspired dark theme with glow effects
- **5 Accent Colors:**
  - Cyan (Default)
  - Green (Matrix/Hacker)
  - Purple (Cyberpunk)
  - Pink (Neon)
  - Orange (Warm)

### User-Agent Management

- Auto-fetches from [microlinkhq/top-user-agents](https://github.com/microlinkhq/top-user-agents) CDN
- Top 100 user agents (desktop, mobile, or all)
- Based on 300M+ monthly requests from real-world usage
- Bot-filtered data for realistic user agent strings
- 7-day cache with automatic refresh
- Per-container user agent configuration

### Container Colors (8 Total)

Blue • Turquoise • Green • Yellow • Orange • Red • Pink • Purple

### Proxy Features

- **Supported Protocols:** HTTP, HTTPS, SOCKS4, SOCKS5
- **Global Proxy:** Apply one proxy to all containers
- **Per-Container Proxy:** Configure each container individually
- **Quick Toggle:** Enable/disable proxy with one click
- **Authentication:** Username/password support (session-only — see Security Notes)
- **Proxy Presets:** Save and reuse common proxy configurations

---

## Documentation

- 📖 [**FEATURES.md**](docs/FEATURES.md) - Comprehensive feature documentation
- 📦 [**INSTALLATION.md**](docs/INSTALLATION.md) - Detailed installation guide
- 🎯 [**BURP_SUITE_SETUP.md**](docs/BURP_SUITE_SETUP.md) - Burp Suite integration guide
- ✅ [**PRE_RELEASE_FAILURE_SCENARIOS.md**](docs/PRE_RELEASE_FAILURE_SCENARIOS.md) - QA checklist and troubleshooting

---

## Development

### Build Commands

```bash
npm run build          # Build extension to dist/
npm run package        # Create XPI file
npm run dev           # Development mode with auto-reload
npm run lint          # Run linters
npm run test          # Run tests
```

### Project Structure

```
PhoenixBox/
├── src/                    # Extension source code
│   ├── js/                # Background scripts
│   ├── popup-ui/          # React-based popup UI
│   ├── css/               # Stylesheets
│   └── img/               # Icons and images
├── burp/                  # Burp Suite extension (JAR only)
├── docs/                  # Documentation
├── scripts/               # Build scripts
└── test/                  # Regression tests
```

---

## Use Cases

### Security Testing Workflows

1. **Attacker Container (Red)** - Send malicious payloads
2. **Victim Container (Orange)** - Test as a normal user
3. **Admin Container (Green)** - Test administrative functions
4. **Member Container (Yellow)** - Test authenticated user flows

### Benefits

- **Session Isolation** - No cookie contamination between tests
- **Visual Identification** - Instantly recognize traffic sources in Burp
- **Proxy Flexibility** - Route different containers through different proxies
- **User-Agent Variety** - Test with realistic user agent strings

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

The companion Burp Suite extension (`Phoenix-Highlighter.jar`) strips this header before forwarding to the target server, so traffic through Burp is clean. Direct browser traffic (without Burp) will carry the header to the server if this feature is on.

### Sync

Profile sync uses `browser.storage.sync` tied to your Mozilla account. Proxy topology metadata (host, port, scheme) may be synced; passwords are never synced. If you are working in a sensitive environment, consider leaving sync disabled.

---

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

Mozilla Public License 2.0 - See [LICENSE](LICENSE) file for details.

---

## Credits

- Based on [Firefox Multi-Account Containers](https://github.com/mozilla/multi-account-containers)
- Enhanced for security testing by [0xR3dB0mb](https://github.com/avihayf)

---

## Support

- 🐛 [Report Issues](https://github.com/avihaife-cmyk/PhoenixBox/issues)
- 💬 [Discussions](https://github.com/avihaife-cmyk/PhoenixBox/discussions)
- 📧 Contact: See GitHub profile

---

**⚡ Start your security testing with Phoenix Box today!**
