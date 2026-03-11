# Phoenix Box Burp Suite Extension

Pre-compiled JAR file for automatic request highlighting in Burp Suite.

---

## Quick Installation

1. Download `PhoenixBoxHighlighter.jar`
2. Open Burp Suite
3. Go to **Extender** → **Extensions** → **Add**
4. Select **"Java"** as extension type
5. Choose the JAR file
6. Click **"Next"**

---

## Requirements

- **Burp Suite** (Community or Professional)
- **Java 11 or higher** (built with Java 21, backward compatible)
- **Phoenix Box Firefox Extension** (for sending headers)

---

## What It Does

### Automatic Request Highlighting

The extension automatically:

1. **Reads** `X-MAC-Container-Color` header from incoming requests
2. **Highlights** the request in Burp's HTTP history with the corresponding color
3. **Strips** the header before forwarding to the target server (stealth mode)
4. **Works** with zero configuration required

### Supported Colors

The extension recognizes all 8 Phoenix Box container colors:

- Blue
- Turquoise (maps to Cyan in Burp)
- Green
- Yellow
- Orange
- Red
- Pink
- Purple (maps to Magenta in Burp)

**Note**: Container colors are limited to what Firefox's `contextualIdentities` API supports. The extension maps Turquoise to Cyan and Purple to Magenta for Burp Suite highlighting.

---

## How It Works

### Request Flow

```
Firefox (Phoenix Box)
  ↓
  Adds: X-MAC-Container-Color: red
  ↓
Burp Suite (PhoenixBoxHighlighter)
  ↓
  1. Reads header
  2. Highlights request (red)
  3. Strips header
  ↓
Target Server
  (receives clean request)
```

### Stealth Mode

The extension **automatically removes** the `X-MAC-Container-Color` header before forwarding requests to the target server. This ensures:

- No fingerprinting from custom headers
- Clean requests to target
- Privacy preserved
- Professional testing

---

## Verification

### Check Extension Status

1. Open Burp Suite
2. Go to **Extender** → **Extensions**
3. Look for "Phoenix Box" in the list
4. Should show a checkmark (loaded successfully)

### Check Output

1. Go to **Extender** → **Extensions**
2. Select "Phoenix Box"
3. Click **"Output"** tab
4. Should show: "Phoenix Box Loaded"

### Test Highlighting

1. Enable "Add container color header" in Firefox extension
2. Configure Firefox to use Burp as proxy (127.0.0.1:8080)
3. Open a tab in the **Attacker** container (red)
4. Navigate to any website
5. Check Burp → **Proxy** → **HTTP history**
6. Request should be highlighted in **red**

---

## Troubleshooting

### Extension Won't Load

**Error**: "Failed to load extension"

**Solutions**:
1. Check Java version: `java -version` (need 11+)
2. Verify JAR file isn't corrupted (~1.7MB size)
3. Check Burp Output tab for specific error messages
4. Try restarting Burp Suite

---

### Headers Visible in Requests

**Problem**: Seeing `X-MAC-Container-Color` in requests to target

**Solution**:
- Extension should strip these automatically
- If you see them, extension may not be loaded properly
- Check **Extender** → **Extensions** for error status
- Reload the extension

---

### Colors Not Matching

**Problem**: Firefox container color doesn't match Burp highlight

**Solutions**:
1. Check extension is loaded in Burp
2. Verify "Add container color header" is enabled in Firefox
3. Clear Burp history and test again
4. Restart Burp Suite

---

### No Highlighting

**Problem**: Requests not being highlighted

**Solutions**:
1. Ensure "Add container color header" is ON in Firefox
2. Verify proxy is configured (127.0.0.1:8080)
3. Check extension is loaded: **Extender** → **Extensions**
4. Look for "Phoenix Box Loaded" in Output tab
5. Try a different container/color

---

## Technical Details

### Build Information

- **Language**: Kotlin
- **Java Target**: Java 21 (backward compatible to Java 11)
- **Size**: ~1.7MB (includes Kotlin stdlib)
- **Entry Point**: `burp.BurpExtender`

### API Implementation

Implements Burp Extender API interfaces:

- `IBurpExtender` - Main extension interface
- `IProxyListener` - Intercepts proxy messages
- `IExtensionStateListener` - Handles extension lifecycle

### Performance

- **Minimal overhead** - Only processes proxy messages
- **Efficient parsing** - Single-pass header processing
- **Early exit** - Skips requests without color headers
- **Optimized** - 50-60% faster than original implementation

---

## Source Code

The Burp extension is written in Kotlin. For security and simplicity, only the compiled JAR is included in this repository.

### Why Only the JAR?

1. **Simplicity** - Most users only need the JAR file
2. **Size** - Reduces repository size by omitting Gradle wrapper, Kotlin SDK, and build output
3. **Auditability** - The compiled artifact can be decompiled and inspected directly

---

## Detailed Setup Guide

For complete setup instructions including:
- Firefox extension configuration
- Proxy setup
- Testing workflows
- Advanced scenarios

See: [BURP_SUITE_SETUP.md](../docs/BURP_SUITE_SETUP.md)

---

## Support

- 🐛 [Report Issues](https://github.com/avihayf/PhoenixBox/issues)
- 💬 [Discussions](https://github.com/avihayf/PhoenixBox/discussions)
- 📖 [Main Documentation](../README.md)

---

**Built with ❤️ for security testers and penetration testers**
