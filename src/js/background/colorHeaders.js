/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Adds a container color header to requests (for Burp highlighting).
 * Enabled via options checkbox stored in browser.storage.local.
 */

const COLOR_HEADER_STORAGE_KEY = "addContainerColorHeaderEnabled";
const COLOR_HEADER_NAME = "X-MAC-Container-Color";

// Map Firefox container colors to standard color names for Burp Suite highlighting.
// These are common color names that most tools can recognize.
const COLOR_MAP = {
  blue: "blue",
  turquoise: "cyan",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  red: "red",
  pink: "pink",
  purple: "magenta",
};

const colorHeaders = {
  enabled: false,

  async init() {
    const stored = await browser.storage.local.get({ [COLOR_HEADER_STORAGE_KEY]: false });
    this.enabled = !!stored[COLOR_HEADER_STORAGE_KEY];
    this._applyListener();

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (!(COLOR_HEADER_STORAGE_KEY in changes)) return;
      this.enabled = !!changes[COLOR_HEADER_STORAGE_KEY].newValue;
      this._applyListener();
    });
  },

  _applyListener() {
    const has = browser.webRequest.onBeforeSendHeaders.hasListener(this._handler);
    if (this.enabled && !has) {
      browser.webRequest.onBeforeSendHeaders.addListener(
        this._handler,
        { urls: ["<all_urls>"] },
        ["blocking", "requestHeaders"]
      );
    } else if (!this.enabled && has) {
      browser.webRequest.onBeforeSendHeaders.removeListener(this._handler);
    }
  },

  // Handler function for onBeforeSendHeaders.
  // NOTE: Keep as an arrow function property so `hasListener(this._handler)` stays stable.
  _handler: async function(details) {
    // Skip requests not associated with a tab (e.g., background/network activity)
    if (details.tabId === null || details.tabId === undefined || details.tabId < 0) {
      return {};
    }

    // Only process http(s) and ws(s) schemes
    const url = details.url || "";
    if (!url.startsWith("http://") && !url.startsWith("https://") &&
        !url.startsWith("ws://") && !url.startsWith("wss://")) {
      return {};
    }

    let cookieStoreId;

    // Try to get cookieStoreId from details first (if available), else from tab
    if (details.cookieStoreId) {
      cookieStoreId = details.cookieStoreId;
    } else {
      try {
        const tab = await browser.tabs.get(details.tabId);
        cookieStoreId = tab.cookieStoreId;
      } catch {
        // Tab may have been closed or inaccessible
        return {};
      }
    }

    // Skip default and private containers
    if (!cookieStoreId) return {};
    if (cookieStoreId === "firefox-default" || cookieStoreId === "firefox-private") {
      return {};
    }

    // Get container identity to read its color
    let identity;
    try {
      identity = await browser.contextualIdentities.get(cookieStoreId);
    } catch {
      // Container may not exist or be inaccessible
      return {};
    }

    const rawColor = identity && identity.color;
    if (!rawColor) return {};

    const value = COLOR_MAP[rawColor];
    if (!value) return {};

    // Build new headers, replacing any existing header with the same name
    const requestHeaders = details.requestHeaders || [];
    const filtered = requestHeaders.filter(
      h => (h.name || "").toLowerCase() !== COLOR_HEADER_NAME.toLowerCase()
    );
    filtered.push({ name: COLOR_HEADER_NAME, value });

    return { requestHeaders: filtered };
  }
};

colorHeaders.init();

