# Differential Security Review — PhoenixBox branch `dev-1.3`

**Reviewer:** Claude (automated)
**Date:** 2026-03-17
**Base:** `main` | **Head:** `dev-1.3` (working tree)
**Codebase size:** SMALL — deep analysis applied
**Coverage confidence:** HIGH — all changed files read in full

---

## Executive Summary

This branch introduces three independent features:
1. **Endpoint Extraction** — scan a page's HTML/JS for URL paths and display them in a results tab
2. **Proxy "Disable" shortcut** — a synthetic `__direct__` preset to bypass proxy per-container
3. **Accent colour inheritance** — endpoint-results and pageAction pages read `localStorage.accentColor`

Plus a minor robustness fix: `OnboardingView.tsx` wraps `resetSync` calls in try/catch.

**Overall risk: LOW.** No authentication bypasses, no privilege escalation, no XSS sinks found. Two low-severity issues and several informational findings documented below.

---

## Files Reviewed

| File | Risk | Notes |
|------|------|-------|
| `src/js/content-script.js` | MEDIUM | New message handler on page content |
| `src/js/background/messageHandler.js` | MEDIUM | New `extractEndpoints` case, tabId forwarding |
| `src/js/pageAction.js` | LOW | Button wiring + localStorage read |
| `src/js/endpoint-results.js` | LOW | Results display, clipboard, localStorage |
| `src/js/extract-endpoints-injected.js` | INFO | Untracked file — not wired in |
| `src/pageActionPopup.html` | LOW | Button added |
| `src/css/pageAction.css` | LOW | Cosmetic |
| `src/css/endpoint-results.css` | LOW | Cosmetic |
| `src/popup-ui/app/App.tsx` | LOW | `__direct__` proxy preset handling |
| `src/popup-ui/app/components/views/ContainerDetailView.tsx` | LOW | `__direct__` select option |
| `src/popup-ui/app/components/views/OnboardingView.tsx` | LOW | try/catch around resetSync |
| `scripts/build-extension.mjs` | INFO | Adds endpoint-results.html to copy list |

---

## Findings

### [LOW-1] `endpointTextColor` from localStorage injected directly as CSS custom property

**File:** `src/js/endpoint-results.js:136`

```js
const savedColor = localStorage.getItem(COLOR_KEY);
if (savedColor) {
  document.documentElement.style.setProperty("--endpoint-color", savedColor);
```

**Issue:** The value of `endpointTextColor` in `localStorage` is taken without validation and set as a CSS custom property on the document root. Values written by the extension itself are always safe hex strings (`#00c8ff`, `#3fb950`, etc.), but any code with access to the extension's origin (e.g. a compromised extension page or a future XSS in an extension page) could write an arbitrary value.

**Exploitability:** Very low. The extension origin (`moz-extension://`) is isolated — web pages cannot read or write to it. However, custom property injection could set `--endpoint-color` to a value like `red; }  body { background: url(https://attacker.com/log)` which would be consumed by `color: var(--endpoint-color)`. In practice, CSS custom properties used only in `color:` cannot cause data exfiltration, but this is an untrusted-data-to-CSS-sink pattern.

**Recommendation:** Validate `savedColor` against the known swatch list before applying:
```js
const VALID_COLORS = new Set(["#00c8ff","#3fb950","#e6edf3","#f0e040","#ff7b3d"]);
if (savedColor && VALID_COLORS.has(savedColor)) {
  document.documentElement.style.setProperty("--endpoint-color", savedColor);
}
```

---

### [LOW-2] `pageUrl` stored from message payload without content validation

**File:** `src/js/background/messageHandler.js:147-162`

```js
case "extractEndpoints": {
  const tabId = m.tabId;
  const pageUrl = m.pageUrl || "";
  ...
  await browser.storage.local.set({
    endpointScanResults: { endpoints, pageUrl, scannedAt: Date.now() }
  });
```

**Issue:** `pageUrl` is taken from the message payload (`m.pageUrl`) sent by `pageAction.js`. In `pageAction.js` this is always `currentTab.url` (from the browser's own tab API), so in normal usage it is trustworthy. However, the background does not independently verify that `pageUrl` matches the tab's actual URL — it trusts the sender to provide the correct value.

If another extension page (or a future bug) sends a crafted `extractEndpoints` message with an arbitrary `pageUrl`, that string is persisted to storage and displayed in the results page. The display is via `textContent` (not `innerHTML`), so XSS is not possible, but misleading content could appear in the UI.

**Exploitability:** Low — only extension pages can call `browser.runtime.sendMessage`.

**Recommendation:** In the background handler, independently look up the tab's URL rather than trusting the message payload:
```js
const tab = await browser.tabs.get(tabId);
const pageUrl = tab?.url || "";
```
This removes the trust on the sender-supplied URL entirely.

---

### [INFO-1] `extract-endpoints-injected.js` is present but not wired in

**File:** `src/js/extract-endpoints-injected.js`

This file is a self-executing function implementing endpoint extraction via a different approach (captured group regex vs lookbehind). It is not referenced in `manifest.json`, not loaded by any HTML page, and not called by any other script in the diff. It appears to be a superseded prototype.

**Risk:** None currently. However, if it were accidentally added to `manifest.json` as a content script it would run on all pages. Recommend deleting it or moving it to a `dev/` directory to avoid confusion.

---

### [INFO-2] Regex runs on full `document.documentElement.outerHTML`

**File:** `src/js/content-script.js:54-57`

```js
const html = document.documentElement.outerHTML;
for (const m of html.matchAll(re)) { found.add(m[0]); }
```

On large SPAs, `outerHTML` can easily exceed 10–50 MB. The lookbehind regex `(?<=["'`])\/[a-zA-Z0-9_?&=\/\-#.]*(?=["'`])` has no catastrophic backtracking risk (character class with no overlap), but iterating millions of characters on the main thread will block UI. For a pentesting tool this is acceptable, but worth noting for pages with large inlined JS bundles (e.g. webpack'd apps).

**No security impact.** Informational only.

---

### [INFO-3] Content-script returns a Promise, old path no longer falls through

**File:** `src/js/content-script.js:52-72`

```js
if (message && typeof message.text === "string") {
  addMessage(message);
  return;   // <-- newly added early return
}
if (message && message.method === "scanEndpoints") { ... }
```

The early `return` on the text-message branch is new. Before this change, after calling `addMessage()` the handler would fall through to the `scanEndpoints` check (which would silently no-op). Now it returns `undefined` cleanly. This is a correct improvement — but note that `addMessage` messages no longer have the opportunity to accidentally trigger `scanEndpoints`. Verified correct.

---

### [INFO-4] `__direct__` proxy preset uses a magic string ID

**Files:** `ContainerDetailView.tsx:129`, `App.tsx:1117`

```tsx
} else if (preset.id === "__direct__") {
  await setProxyForContainer(selectedContainer.cookieStoreId, {
    type: "direct", host: "", port: 0, mozProxyEnabled: false,
  });
```

The `__direct__` ID is a synthetic sentinel that does not exist in the real presets list. It is checked with strict equality (`===`) before the preset lookup, so it cannot collide with a real preset ID. The approach is sound but relies on no real preset ever being named `__direct__`. Given presets come from user input, adding an explicit guard or using a Symbol-style prefix (e.g. `__sys:direct__`) would make this more robust long-term. No current vulnerability.

---

## Security Positives (Confirmed Correct)

| Pattern | Location | Assessment |
|---------|----------|------------|
| All endpoint strings rendered via `textContent` | `endpoint-results.js:65` | XSS prevented |
| Sender identity check before scanning | `content-script.js:51` | Blocks web-page-initiated scans |
| Storage cleared immediately after reading | `endpoint-results.js:95` | Data minimisation |
| Accent hue clamped via `Math.max/min` + `Number()` | `endpoint-results.js:85`, `pageAction.js:148` | CSS injection prevented |
| `pageUrl` displayed via `textContent` and `.title` | `endpoint-results.js:105-106` | No XSS even if URL is adversarial |
| Clipboard fallback uses `textarea.value` (not innerHTML) | `endpoint-results.js:28-33` | Safe |
| Button disabled on click, prevents double-submission | `pageAction.js:144` | Prevents duplicate scans |
| `browser.runtime.id` checked for all messages | `content-script.js:51` | Correct MV2 sender validation |

---

## Test Coverage

No unit tests exist for the new endpoint extraction feature. Given this is a pentesting-tool feature (not an auth or value-transfer path), this is acceptable risk but worth noting. The following scenarios have no automated coverage:

- `scanEndpoints` message returns a non-array value
- `extractEndpoints` called with an invalid/privileged tab ID (e.g. `about:config`)
- Very large `outerHTML` (>10 MB) performance regression

---

## Summary Table

| ID | Severity | Title | File |
|----|----------|-------|------|
| LOW-1 | Low | Unvalidated localStorage value as CSS property | `endpoint-results.js:136` |
| LOW-2 | Low | pageUrl trusted from message payload, not re-fetched from tabs API | `messageHandler.js:147` |
| INFO-1 | Informational | Dead file `extract-endpoints-injected.js` not removed | — |
| INFO-2 | Informational | Full outerHTML regex scan may be slow on large pages | `content-script.js:54` |
| INFO-3 | Informational | Early return added to content-script message handler | `content-script.js:52` |
| INFO-4 | Informational | `__direct__` magic string could collide with future preset ID | `ContainerDetailView.tsx`, `App.tsx` |

**No high or critical findings.** The codebase applies correct mitigations (textContent, sender validation, input clamping) for the highest-risk patterns. The two Low findings are hardening recommendations, not exploitable vulnerabilities in the current threat model.
