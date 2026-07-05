# Installation Guide

Complete installation instructions for PhoenixBox.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [For End Users](#for-end-users)
- [For Developers](#for-developers)
- [Building from Source](#building-from-source)
- [Burp Suite Extension](#burp-suite-extension)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- **Firefox 142.0 or later** — any edition works (standard release, ESR, Developer Edition, or Nightly). Developer Edition is **not** required.
  - Download: [Firefox](https://www.mozilla.org/firefox/)

### For building from source (developers only)

- **Node.js 22+**
  - Download: [Node.js](https://nodejs.org/)

### Optional

- **Burp Suite** (Community or Professional) - For request highlighting
  - Download: [Burp Suite](https://portswigger.net/burp/communitydownload)
- **Java 11 or higher** - For Burp extension
  - Usually included with Burp Suite

---

## For End Users

Install the signed build from **Firefox Add-ons (AMO)**, where Mozilla signs the extension. That signed version installs on **any** Firefox 142.0 or later — standard release, ESR, Developer Edition, or Nightly — with no `about:config` changes.

### Firefox Add-ons (recommended)

1. **Open the listing**
   - Go to [PhoenixBox on addons.mozilla.org](https://addons.mozilla.org/firefox/addon/phoenix-box/), or search "PhoenixBox" on [addons.mozilla.org](https://addons.mozilla.org).
2. **Install**
   - Click **Add to Firefox**, then **Add** when prompted.
3. **Verify**
   - Look for the PhoenixBox icon in the toolbar (pin it if needed) and click it — you'll see the pre-configured Attacker, Victim, Admin, and Member containers.

Firefox keeps the extension updated automatically as new versions are published.

> **Note:** The `.xpi` attached to [GitHub Releases](https://github.com/avihayf/PhoenixBox/releases) is an **unsigned** developer build. Standard Firefox won't install it permanently — use it with Firefox Developer Edition or Nightly (see [For Developers](#for-developers)).

---

## For Developers

### Development Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/avihayf/PhoenixBox.git
   cd PhoenixBox
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Extension**
   ```bash
   npm run build
   ```
   
   This creates a `dist/` directory with the built extension.

4. **Load in Firefox**
   - Open Firefox Developer Edition
   - Go to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on..."
   - Select `dist/manifest.json`

### Installing the release .xpi (unsigned)

The `.xpi` attached to GitHub Releases is unsigned, so it only installs permanently on Firefox Developer Edition or Nightly:

1. Open Firefox Developer Edition (or Nightly).
2. Go to `about:config` and set `xpinstall.signatures.required` to `false`.
3. Download the `.xpi` from the [Releases page](https://github.com/avihayf/PhoenixBox/releases).
4. Drag the `.xpi` into the browser (or **File → Open File**), then click **Add**.

On standard Firefox, use the signed [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/phoenix-box/) build instead.

### Development Mode with Auto-reload

```bash
npm run dev
```

This will:
- Build the extension
- Launch Firefox Developer Edition
- Load the extension
- Watch for changes and auto-reload

### Linting

```bash
npm run lint        # Run all linters
npm run lint:js     # JavaScript/TypeScript only
npm run lint:css    # CSS only
npm run lint:html   # HTML only
```

### Testing

PhoenixBox includes a comprehensive test suite using Vitest:

```bash
npm run test        # Run all tests
npm run test:unit   # Run unit tests only
npm run coverage    # Generate test coverage report
```

**Test Coverage**:
- Proxy URL parsing and validation
- Container color mapping and hex conversion
- Burp Suite header integration
- Error handling and edge cases

Tests are located in the `test/` directory and use Vitest as the test runner.

---

## Building from Source

### Build Commands

```bash
# Build extension
npm run build

# Create XPI package
npm run package

# Development mode
npm run dev

# Run tests
npm run test
```

### Build Output

```
dist/
├── manifest.json
├── background.html
├── popup.html
├── js/
├── css/
├── img/
└── _locales/
```

### Creating Release Package

```bash
# Build and package
npm run build
npm run package

# Output: phoenix_proxy-1.0.0.xpi in root directory
```

---

## Burp Suite Extension

### Installation

1. **Download the JAR**
   ```
   Go to: https://github.com/avihayf/PhoenixBox/releases
   Download: PhoenixBoxHighlighter.jar
   ```

2. **Install in Burp Suite**
   - Open Burp Suite
   - Go to **Extender** → **Extensions** → **Add**
   - Extension type: **Java**
   - Click "Select file..."
   - Choose `PhoenixBoxHighlighter.jar`
   - Click **"Next"**

3. **Verify Installation**
   - Check Extensions list
   - "PhoenixBox" should appear with checkmark
   - Output window shows "PhoenixBox Loaded"

4. **Enable in Firefox**
   - Click PhoenixBox icon in Firefox
   - Toggle "Add container color header" to ON

### Requirements

- Burp Suite Community or Professional
- Java 11 or higher
- PhoenixBox Firefox extension installed

See [BURP_SUITE_SETUP.md](BURP_SUITE_SETUP.md) for detailed setup.

---

## Troubleshooting

### Extension Won't Install

**Problem**: "This add-on could not be installed because it appears to be corrupt"

**Solutions**:
1. Make sure you're on Firefox 142.0 or later (`about:support` shows your version)
2. Install from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/phoenix-box/) or use the signed `PhoenixBox.xpi` from [Releases](https://github.com/avihayf/PhoenixBox/releases) — don't sideload an unsigned `dist/` build
3. Download the file again (it may have been corrupted during download)

---

### Extension Disappears After Firefox Restart

**Problem**: Extension loaded as temporary add-on

**Solution**:
- Temporary add-ons unload when Firefox closes
- Use permanent installation method (Option 1 above)
- OR: Reload temporary add-on each time

---

### Build Fails

**Problem**: `npm run build` fails with errors

**Solutions**:
1. Ensure Node.js 18+ is installed: `node --version`
2. Delete `node_modules` and `package-lock.json`, run `npm install` again
3. Check for errors in console output
4. Ensure all dependencies installed: `npm install`

---

### Burp Extension Won't Load

**Problem**: Burp reports errors loading extension

**Solutions**:
1. Verify Java version: `java -version` (need 11+)
2. Check Burp Output tab for error messages
3. Ensure JAR file isn't corrupted (should be ~1.7MB)
4. Try re-downloading the JAR file

---

### Proxy Not Working

**Problem**: Proxy enabled but traffic doesn't go through Burp

**Solutions**:
1. Verify Burp is listening on configured port (usually 8080)
2. Check Firefox proxy settings (should be configured by extension)
3. Ensure "Intercept" is off in Burp Proxy tab
4. Try toggling proxy off and on in PhoenixBox
5. Check for conflicting proxy extensions

---

### Headers Not Showing in Burp

**Problem**: X-MAC-Container-Color headers visible in Burp

**Solutions**:
1. Ensure "Add container color header" is enabled in Firefox
2. Verify PhoenixBoxHighlighter.jar is loaded in Burp
3. Check Burp Output tab for extension errors
4. Extension should strip headers - if you see them, extension may not be working

---

### Container Colors Not Syncing

**Problem**: Colors in Firefox don't match Burp highlights

**Solutions**:
1. Reload Burp extension
2. Restart Burp Suite
3. Clear browser cache
4. Verify extension versions match

---

## Platform-Specific Notes

### macOS

- Firefox Developer Edition installs to `/Applications/Firefox Developer Edition.app`
- Java typically at `/usr/libexec/java_home -v 11`
- May need to allow unsigned extensions in Security preferences

### Linux

- Install Firefox Developer Edition via package manager or tarball
- Java via apt/yum: `sudo apt install openjdk-11-jdk`
- Check SELinux if extension loading fails

### Windows

- Download Firefox Developer Edition installer
- Java from Oracle or OpenJDK
- May need to run Firefox as administrator for extension installation

---

## Next Steps

After installation:

1. **Configure Proxy** - Set up Burp Suite connection
2. **Create Containers** - Customize containers for your workflow
3. **Assign Sites** - Configure automatic site assignments
4. **Choose Theme** - Select your preferred UI theme

See [FEATURES.md](FEATURES.md) for complete feature documentation.

---

## Support

- 🐛 [Report Issues](https://github.com/avihayf/PhoenixBox/issues)
- 💬 [Discussions](https://github.com/avihayf/PhoenixBox/discussions)
- 📖 [Documentation](../README.md)
