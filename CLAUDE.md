# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Phoenix Box is a Firefox WebExtension (Manifest V2) for security testing workflows. It provides multi-container browser sessions with per-container proxy routing, User-Agent spoofing, Burp Suite integration, and site assignment — so pentesters can run Attacker/Victim/Admin/Member roles side by side without session collisions.

Requires Firefox Developer Edition or Nightly (min version 138.0). Extension ID: `phoenix-box@0xr3db0mb.com`.

## Build & Development Commands

```bash
npm install                  # Install dependencies
npm run build                # Build extension to dist/ and package as .xpi
npm run dev                  # Build + launch Firefox Dev Edition with extension loaded
npm test                     # Run all linters + unit tests
npm run test:unit            # Unit tests only (mocha)
npm run lint                 # All linters (addon, css, html, js)
npm run lint:js              # ESLint only
npm run lint:css             # Stylelint only
npm run lint:html            # html-validate only
npm run lint:addon           # web-ext lint on dist/
npm run package              # Build and produce addon.xpi
npm run package:source       # Zip source for AMO review submission
npx mocha test/review-fixes.test.js  # Run a single test file
```

To load for development: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `dist/manifest.json`.

## Architecture

### Two-layer UI

- **Popup UI** (`src/popup-ui/`): React + TypeScript + Tailwind CSS, built with Vite. This is the main popup users interact with. Entry point is `src/popup-ui/main.tsx`, root component is `src/popup-ui/app/App.tsx`. Views are in `src/popup-ui/app/components/views/`.
- **Legacy JS** (`src/js/`): Plain JavaScript that runs as background scripts and content scripts. These are NOT built by Vite — they're copied directly to `dist/` by the build script.

### Build pipeline

`scripts/build-extension.mjs` orchestrates the full build:
1. Vite builds `src/popup-ui/` → `dist/popup/`
2. Copies `src/js/`, `src/css/`, `src/img/`, `src/fonts/`, `src/_locales/` → `dist/`
3. Copies and patches `manifest.json` into `dist/`

### Background scripts (`src/js/background/`)

These run as a background page (not a service worker). Key modules are global objects that reference each other directly (no import/export):
- `backgroundLogic.js` — Core container lifecycle, keyboard shortcuts, install/startup hooks
- `messageHandler.js` — Central message router (`browser.runtime.onMessage`) dispatching to other modules
- `assignManager.js` — Site-to-container assignments, proxy configuration (global + per-container)
- `identityState.js` — Container state management and storage
- `sync.js` — Profile sync via `browser.storage.sync`
- `colorHeaders.js` — Injects `X-MAC-Container-Color` header for Burp Suite highlighting
- `userAgentHandler.js` — Per-container User-Agent spoofing via `webRequest.onBeforeSendHeaders`
- `badge.js` — Toolbar badge updates

### Communication pattern

Popup ↔ Background communication uses `browser.runtime.sendMessage()` with a `method` string switch in `messageHandler.js`. When adding new functionality, add a case to the message handler switch and send messages from the popup via `requireWebExt()` (which wraps `browser` for type safety).

### Key conventions

- Global objects in background scripts (e.g., `backgroundLogic`, `assignManager`) are declared in `eslint.config.js` globals
- HTML sanitization: use `Utils.escaped` tagged template (enforced by `eslint-plugin-no-unsanitized`)
- Localization is English-only (`src/_locales/en/`). Legacy HTML pages use `browser.i18n.getMessage()` and `__MSG_keyName__` in manifest; the React popup uses hardcoded English strings
- Proxy passwords are held in memory only, never persisted to storage
- The `X-MAC-Container-Color` header is stripped by the companion Burp extension before reaching targets

## Code Style

- 2-space indentation, double quotes, semicolons required
- `===` required (eqeqeq), `const`/`let` only (no `var`)
- CSS: stylelint-config-standard with 2-space indent
- License header: MPL-2.0 on background JS files

## Tests

Tests are in `test/` using Mocha + Chai + Sinon. Test files import helper modules from `src/js/` directly (the modules under test expose global objects). The `browser` global is restricted in test files via ESLint (`no-restricted-globals`) to prevent accidental use of real WebExtension APIs.

## Companion Burp Extension

`burp/PhoenixBoxHighlighter.jar` — Java extension that highlights Burp HTTP history by container color header and strips the header before forwarding.
