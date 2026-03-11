# Phoenix Box Features

Comprehensive guide to all features available in Phoenix Box.

---

## Table of Contents

- [Container System](#container-system)
- [Theme System](#theme-system)
- [User-Agent Management](#user-agent-management)
- [Proxy Features](#proxy-features)
- [Burp Suite Integration](#burp-suite-integration)
- [Site Management](#site-management)
- [Security Features](#security-features)

---

## Container System

### Container Colors (8 Total)

Phoenix Box supports 8 Firefox-native container colors for visual organization. These colors are limited to what Firefox's `contextualIdentities` API supports:

| Color      | Hex Code  | Use Case Example           |
|------------|-----------|----------------------------|
| Blue       | #4A90E2   | Victim/Normal User         |
| Turquoise  | #1ABC9C   | API Testing                |
| Green      | #2ECC71   | Member/Registered User     |
| Yellow     | #F1C40F   | Development                |
| Orange     | #F97316   | Authenticated User         |
| Red        | #B91C1C   | Attacker/Malicious         |
| Pink       | #E91E63   | Testing/Experimental       |
| Purple     | #9B59B6   | Admin/Privileged User      |

**Note**: Container colors are limited by Firefox's API. Only these 8 colors are supported natively by Firefox's container system.

### Pre-configured Containers

Phoenix Box comes with four pre-configured containers for security testing:

1. **Attacker** (Red) - For sending malicious payloads and attack vectors
2. **Victim** (Blue) - For testing as a normal, unauthenticated user
3. **Admin** (Purple) - For testing administrative and privileged functions
4. **Member** (Green) - For testing authenticated user flows

### Container Management

- **Create** unlimited custom containers
- **Edit** container name, color, and icon
- **Delete** containers and associated data
- **Organize** containers with custom sorting
- **Icons** - Choose from multiple icon options for easy identification

### Session Isolation

Each container provides complete isolation:

- **Cookies** - Separate cookie jars
- **Local Storage** - Isolated localStorage
- **Session Storage** - Separate sessionStorage
- **IndexedDB** - Isolated IndexedDB
- **Cache** - Separate browser cache

---

## Theme System

### Light Mode

Clean, vibrant interface optimized for bright environments:

- Enhanced contrast for better readability
- Vibrant accent colors
- Professional appearance
- Smooth transitions

### Dark Mode

Cyberpunk-inspired dark theme perfect for low-light environments:

- Deep dark backgrounds
- Neon accent colors with glow effects
- Reduced eye strain
- Terminal-style aesthetic
- Smooth animations

### Typography

Phoenix Box uses **Audiowide** as its brand font - a retro-futuristic, bold typeface that gives the extension its distinctive identity. The font is included locally (not loaded from external sources) to comply with Firefox extension Content Security Policy requirements.

- **Brand Font**: Audiowide (local file)
- **Font Style**: Retro-futuristic, bold
- **Usage**: Main titles and brand elements
- **License**: Open Font License (OFL)

### Accent Color Schemes (5 Total)

Choose from five distinct accent color themes:

#### 1. Cyan (Default)
- Primary: Bright cyan
- Aesthetic: Modern, tech-focused
- Best for: General security testing

#### 2. Green (Matrix/Hacker)
- Primary: Matrix green
- Aesthetic: Classic hacker terminal
- Best for: Penetration testing

#### 3. Purple (Cyberpunk)
- Primary: Vibrant purple
- Aesthetic: Cyberpunk/futuristic
- Best for: Modern web app testing

#### 4. Pink (Neon)
- Primary: Hot pink
- Aesthetic: Neon/synthwave
- Best for: Visual distinction

#### 5. Orange (Warm)
- Primary: Warm orange
- Aesthetic: Energetic, warm
- Best for: Development workflows

### Theme Features

- **Instant switching** between light and dark modes
- **Persistent** - Your theme choice is saved
- **Glow effects** in dark mode for better visual feedback
- **Smooth transitions** between themes

---

## User-Agent Management

### Overview

Phoenix Box includes advanced user-agent spoofing capabilities with real-world data.

### Data Source

- **Source**: [microlinkhq/top-user-agents](https://github.com/microlinkhq/top-user-agents)
- **CDN**: jsdelivr for fast, reliable access
- **Update Frequency**: Auto-refreshes every 7 days
- **Data Volume**: Based on 300M+ monthly requests
- **Quality**: Bot-filtered for realistic user agents

### User-Agent Categories

1. **All** - Top 100 user agents from all device types
2. **Desktop** - Top 100 desktop browser user agents
3. **Mobile** - Top 100 mobile device user agents

### Configuration

- **Per-Container** - Set different user agents for each container
- **Quick Selection** - Choose from categorized lists
- **Custom Input** - Enter custom user agent strings
- **Reset Option** - Revert to browser default

### Cache System

- **7-day cache** - Data stored locally for 7 days
- **Auto-refresh** - Automatically fetches fresh data when cache expires
- **Offline support** - Uses cached data when offline
- **Background updates** - No interruption to your workflow

---

## Proxy Features

### Supported Protocols

- **HTTP** - Standard HTTP proxy
- **HTTPS** - Encrypted HTTPS proxy
- **SOCKS4** - SOCKS version 4
- **SOCKS5** - SOCKS version 5 (most common for Burp)

### Proxy Modes

#### Global Proxy

Apply one proxy configuration to all containers:

- Quick setup for Burp Suite
- One-click toggle on/off
- Ideal for single-tool testing

#### Per-Container Proxy

Configure different proxies for each container:

- Route Attacker through Burp
- Route Victim through different proxy
- Mix proxied and non-proxied containers
- Advanced testing scenarios

### Proxy Configuration

- **Host** - IP address or hostname
- **Port** - Proxy port number
- **Username** - Optional authentication
- **Password** - Optional authentication
- **DNS over Proxy** - Route DNS queries through proxy

### Proxy Presets

Save and reuse common proxy configurations:

- **Burp Suite** - Pre-configured for 127.0.0.1:8080
- **Custom Presets** - Save your own configurations
- **Quick Switch** - Change proxies with one click

### Proxy Status

- **Visual Indicator** - Know when proxy is active
- **Per-Container Status** - See which containers are proxied
- **Connection Testing** - Verify proxy connectivity

---

## Burp Suite Integration

### Overview

Seamless integration with Burp Suite for request highlighting and identification.

### X-MAC-Container-Color Header

Phoenix Box adds a custom header to all requests:

```
X-MAC-Container-Color: red
```

This header:
- **Identifies** which container sent the request
- **Auto-stripped** by Burp extension before forwarding to target when the companion Burp extension is installed and active
- **Visible to the target** if you enable the header without routing through Burp or if the Burp extension is not stripping it

### Burp Extension Features

The PhoenixBoxHighlighter.jar extension provides:

- **Auto-highlighting** - Requests highlighted by container color
- **Zero configuration** - Works immediately after installation
- **Stealth mode** - Headers stripped automatically
- **All colors supported** - Recognizes all 8 container colors

### Setup Process

1. Install PhoenixBoxHighlighter.jar in Burp Suite
2. Enable "Add container color header" in Firefox extension
3. Configure proxy (127.0.0.1:8080 typically)
4. Start testing - requests auto-highlight

### Use Cases

- **Identify traffic sources** at a glance in HTTP history
- **Filter by color** to focus on specific test scenarios
- **Multi-user testing** - Distinguish between different user roles
- **Session tracking** - Visual confirmation of session isolation

---

## Site Management

### Site Assignments

Automatically open specific sites in designated containers:

- **Domain-based** - Assign entire domains
- **Subdomain support** - Assign specific subdomains
- **Pattern matching** - Use wildcards for flexible matching
- **Quick assignment** - Right-click or use menu

### Assignment Features

- **Always In** - Site always opens in assigned container
- **Auto-switch** - Prompts when opening unassigned sites
- **Exemptions** - Exclude specific pages from assignments
- **Bulk management** - Edit multiple assignments at once

### Use Cases

- Testing site in specific container automatically
- Maintaining persistent sessions per site
- Organizing work/personal browsing
- Automated testing workflows

---

## Security Features

### Session Isolation

Complete separation between containers prevents:

- **Cookie leakage** between sessions
- **Cross-container tracking**
- **Fingerprinting correlation**
- **Storage contamination**

### Stealth Mode

Headers stripped before reaching target:

- **X-MAC-Container-Color** removed by Burp extension
- **No fingerprinting** from custom headers
- **Clean requests** to target servers
- **Privacy preserved**

### Proxy Security

- **Encrypted proxy support** (HTTPS/SOCKS5)
- **Authentication** for proxy access
- **DNS privacy** with DNS-over-proxy
- **Connection validation**

### Data Privacy

- **Local storage only** - No cloud sync (optional)
- **No telemetry** - No data sent to developers
- **Open source** - Code available for audit
- **MPL 2.0 License** - Freedom to modify

---

## Additional Features

### Multi-language Support

Available in 50+ languages including:

- English
- Spanish (multiple variants)
- French
- German
- Japanese
- Chinese (Simplified and Traditional)
- And many more...

### Keyboard Shortcuts

- Quick container switching
- Fast container creation
- Rapid proxy toggling

### Import/Export

- **Export containers** for backup
- **Import configurations** for team sharing
- **Sync support** (optional)

### Performance

- **Lightweight** - Minimal memory footprint
- **Fast switching** - Instant container changes
- **Efficient caching** - Smart data management
- **Optimized UI** - Smooth, responsive interface

### UI Improvements

Phoenix Box features a modern, responsive user interface:

- **Dynamic Height Adjustment** - Popup automatically adjusts to content size using `ResizeObserver`
- **Smart Scrolling** - Content areas scroll independently when needed, keeping footer buttons accessible
- **Maximum Height Limit** - Popup capped at 600px to fit within Firefox's popup constraints
- **Smooth Transitions** - Animated transitions for expanding/collapsing sections
- **Custom Scrollbars** - Styled scrollbars matching the theme accent colors
- **Watermark Background** - Subtle Phoenix logo watermark on main view (light/dark variants)

---

## Coming Soon

Features planned for future releases:

- Custom container icons
- Container templates
- Advanced filtering in Burp
- API for automation
- Container groups

---

For more information, see:
- [Installation Guide](INSTALLATION.md)
- [Burp Suite Setup](BURP_SUITE_SETUP.md)
- [Main README](../README.md)
