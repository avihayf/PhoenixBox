/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Modifies User-Agent headers for requests based on global or per-container settings.
 * Enables differential testing across different browsers and devices.
 */

const GLOBAL_UA_ENABLED_KEY = "globalUserAgentEnabled";
const GLOBAL_UA_KEY = "globalUserAgent";
const CONTAINER_UAS_KEY = "containerUserAgents";

const userAgentHandler = {
  enabled: false,
  globalUserAgent: null,
  containerUserAgents: {},

  async init() {
    // Load settings from storage
    const stored = await browser.storage.local.get({
      [GLOBAL_UA_ENABLED_KEY]: false,
      [GLOBAL_UA_KEY]: null,
      [CONTAINER_UAS_KEY]: {}
    });
    
    this.enabled = !!stored[GLOBAL_UA_ENABLED_KEY];
    this.globalUserAgent = stored[GLOBAL_UA_KEY];
    this.containerUserAgents = stored[CONTAINER_UAS_KEY] || {};
    
    this._applyListener();

    // Listen for storage changes
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      
      if (GLOBAL_UA_ENABLED_KEY in changes) {
        this.enabled = !!changes[GLOBAL_UA_ENABLED_KEY].newValue;
        this._applyListener();
      }
      
      if (GLOBAL_UA_KEY in changes) {
        this.globalUserAgent = changes[GLOBAL_UA_KEY].newValue;
      }
      
      if (CONTAINER_UAS_KEY in changes) {
        this.containerUserAgents = changes[CONTAINER_UAS_KEY].newValue || {};
        this._applyListener();
      }
    });
  },

  _applyListener() {
    const hasListener = browser.webRequest.onBeforeSendHeaders.hasListener(this._handler);
    
    // Enable listener if global UA is enabled OR any container has a UA configured
    const hasContainerUAs = Object.keys(this.containerUserAgents).length > 0;
    const shouldListen = this.enabled || hasContainerUAs;
    
    if (shouldListen && !hasListener) {
      browser.webRequest.onBeforeSendHeaders.addListener(
        this._handler,
        { urls: ["<all_urls>"] },
        ["blocking", "requestHeaders"]
      );
    } else if (!shouldListen && hasListener) {
      browser.webRequest.onBeforeSendHeaders.removeListener(this._handler);
    }
  },

  // Handler function for onBeforeSendHeaders.
  // NOTE: Keep as an arrow function property so `hasListener(this._handler)` stays stable.
  _handler: async function(details) {
    // Skip requests not associated with a tab
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
    
    // Try to get cookieStoreId from details first, else from tab
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

    // Determine which User-Agent to use
    // Priority: Per-container UA > Global UA
    let userAgent = null;
    
    // Check for per-container User-Agent first
    if (cookieStoreId && userAgentHandler.containerUserAgents[cookieStoreId]) {
      userAgent = userAgentHandler.containerUserAgents[cookieStoreId];
    }
    // Fall back to global User-Agent
    else if (userAgentHandler.globalUserAgent) {
      userAgent = userAgentHandler.globalUserAgent;
    }

    // If no User-Agent is configured, don't modify headers
    if (!userAgent) {
      return {};
    }

    // Modify the User-Agent header
    const requestHeaders = details.requestHeaders || [];
    const filtered = requestHeaders.filter(
      h => (h.name || "").toLowerCase() !== "user-agent"
    );
    filtered.push({ name: "User-Agent", value: userAgent });

    return { requestHeaders: filtered };
  }
};

userAgentHandler.init();

