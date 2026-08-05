/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Rewrites outgoing request headers for two features that both need to know
 * which container a request belongs to:
 *
 *   - User-Agent spoofing (per-container overrides win over the global one)
 *   - the X-MAC-Container-Color header used for Burp Suite highlighting
 *
 * They share one blocking onBeforeSendHeaders listener because every extra
 * blocking listener delays every request. Container identity is served from
 * caches kept in sync with the tabs and contextualIdentities events, so the
 * common path resolves synchronously with no API round-trip per request.
 */

const GLOBAL_UA_ENABLED_KEY = "globalUserAgentEnabled";
const GLOBAL_UA_KEY = "globalUserAgent";
const CONTAINER_UAS_KEY = "containerUserAgents";
const COLOR_HEADER_STORAGE_KEY = "addContainerColorHeaderEnabled";
const COLOR_HEADER_NAME = "X-MAC-Container-Color";

// Map Firefox container colors to standard color names for Burp Suite
// highlighting. These are common color names that most tools can recognize.
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

const NON_CONTAINER_COOKIE_STORES = new Set([
  "firefox-default",
  "firefox-private",
]);

const requestHeaders = {
  colorHeaderEnabled: false,
  userAgentEnabled: false,
  globalUserAgent: null,
  containerUserAgents: {},

  /** @type {Map<number, string>} tabId -> cookieStoreId */
  _tabCookieStores: new Map(),
  /** @type {Map<string, string>} cookieStoreId -> container color */
  _containerColors: new Map(),
  _listening: false,
  _boundHandler: null,

  async init() {
    this._boundHandler = this._handleRequest.bind(this);

    const stored = await browser.storage.local.get({
      [GLOBAL_UA_ENABLED_KEY]: false,
      [GLOBAL_UA_KEY]: null,
      [CONTAINER_UAS_KEY]: {},
      [COLOR_HEADER_STORAGE_KEY]: false,
    });

    this.userAgentEnabled = !!stored[GLOBAL_UA_ENABLED_KEY];
    this.globalUserAgent = stored[GLOBAL_UA_KEY];
    this.containerUserAgents = stored[CONTAINER_UAS_KEY] || {};
    this.colorHeaderEnabled = !!stored[COLOR_HEADER_STORAGE_KEY];

    this._watchTabs();
    this._watchContainers();

    // Register before priming the caches: a cache miss only costs an async
    // lookup for that request, whereas waiting would let requests made during
    // startup slip through unmodified.
    this._applyListener();

    await Promise.all([this._primeTabCache(), this._primeContainerColors()]);

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (GLOBAL_UA_ENABLED_KEY in changes) {
        this.userAgentEnabled = !!changes[GLOBAL_UA_ENABLED_KEY].newValue;
      }
      if (GLOBAL_UA_KEY in changes) {
        this.globalUserAgent = changes[GLOBAL_UA_KEY].newValue;
      }
      if (CONTAINER_UAS_KEY in changes) {
        this.containerUserAgents = changes[CONTAINER_UAS_KEY].newValue || {};
      }
      if (COLOR_HEADER_STORAGE_KEY in changes) {
        this.colorHeaderEnabled = !!changes[COLOR_HEADER_STORAGE_KEY].newValue;
      }

      this._applyListener();
    });
  },

  // Any container-scoped UA counts, even when the global toggle is off.
  _hasContainerUserAgents() {
    return Object.keys(this.containerUserAgents || {}).length > 0;
  },

  _shouldListen() {
    const uaActive =
      (this.userAgentEnabled && !!this.globalUserAgent) ||
      this._hasContainerUserAgents();
    return this.colorHeaderEnabled || uaActive;
  },

  _applyListener() {
    const shouldListen = this._shouldListen();
    if (shouldListen && !this._listening) {
      browser.webRequest.onBeforeSendHeaders.addListener(
        this._boundHandler,
        { urls: ["<all_urls>"] },
        ["blocking", "requestHeaders"]
      );
      this._listening = true;
    } else if (!shouldListen && this._listening) {
      browser.webRequest.onBeforeSendHeaders.removeListener(this._boundHandler);
      this._listening = false;
    }
  },

  async _primeTabCache() {
    try {
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.cookieStoreId) {
          this._tabCookieStores.set(tab.id, tab.cookieStoreId);
        }
      }
    } catch (e) {
      // Falling back to a per-request tabs.get is slower but still correct.
      LOG.warn("requestHeaders: could not prime tab cache", e);
    }
  },

  _watchTabs() {
    browser.tabs.onCreated.addListener((tab) => {
      if (tab && tab.cookieStoreId) {
        this._tabCookieStores.set(tab.id, tab.cookieStoreId);
      }
    });

    browser.tabs.onRemoved.addListener((tabId) => {
      this._tabCookieStores.delete(tabId);
    });

    if (browser.tabs.onReplaced) {
      browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
        // The replacement tab keeps the container, but re-resolve lazily
        // rather than assume it.
        this._tabCookieStores.delete(removedTabId);
        this._tabCookieStores.delete(addedTabId);
      });
    }
  },

  async _primeContainerColors() {
    try {
      const identities = await browser.contextualIdentities.query({});
      for (const identity of identities) {
        this._containerColors.set(identity.cookieStoreId, identity.color);
      }
    } catch (e) {
      LOG.warn("requestHeaders: could not prime container colors", e);
    }
  },

  _watchContainers() {
    if (!browser.contextualIdentities) return;

    const upsert = ({ contextualIdentity }) => {
      if (contextualIdentity) {
        this._containerColors.set(
          contextualIdentity.cookieStoreId,
          contextualIdentity.color
        );
      }
    };

    if (browser.contextualIdentities.onCreated) {
      browser.contextualIdentities.onCreated.addListener(upsert);
    }
    if (browser.contextualIdentities.onUpdated) {
      browser.contextualIdentities.onUpdated.addListener(upsert);
    }
    if (browser.contextualIdentities.onRemoved) {
      browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) => {
        if (contextualIdentity) {
          this._containerColors.delete(contextualIdentity.cookieStoreId);
        }
      });
    }
  },

  _isSupportedScheme(url) {
    return (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("ws://") ||
      url.startsWith("wss://")
    );
  },

  _userAgentFor(cookieStoreId) {
    if (cookieStoreId && this.containerUserAgents[cookieStoreId]) {
      return this.containerUserAgents[cookieStoreId];
    }
    // Only fall back to the global UA while the global toggle is on, so a
    // leftover stored value can't keep spoofing after the user turns it off.
    if (this.userAgentEnabled && this.globalUserAgent) {
      return this.globalUserAgent;
    }
    return null;
  },

  /**
   * @returns {string|undefined|null} the color name, `null` when the container
   *   should not be labelled, or `undefined` when the color is not cached yet.
   */
  _colorFor(cookieStoreId) {
    if (!this.colorHeaderEnabled) return null;
    if (!cookieStoreId || NON_CONTAINER_COOKIE_STORES.has(cookieStoreId)) {
      return null;
    }

    const rawColor = this._containerColors.get(cookieStoreId);
    if (rawColor === undefined) return undefined;
    return COLOR_MAP[rawColor] || null;
  },

  _buildHeaders(details, userAgent, color) {
    if (!userAgent && !color) return {};

    const lowerColorHeader = COLOR_HEADER_NAME.toLowerCase();
    const headers = (details.requestHeaders || []).filter((header) => {
      const name = (header.name || "").toLowerCase();
      if (userAgent && name === "user-agent") return false;
      if (color && name === lowerColorHeader) return false;
      return true;
    });

    if (userAgent) headers.push({ name: "User-Agent", value: userAgent });
    if (color) headers.push({ name: COLOR_HEADER_NAME, value: color });

    return { requestHeaders: headers };
  },

  _handleRequest(details) {
    // Requests with no tab (background network activity) have no container.
    if (typeof details.tabId !== "number" || details.tabId < 0) {
      return {};
    }
    if (!this._isSupportedScheme(details.url || "")) {
      return {};
    }

    const cookieStoreId =
      details.cookieStoreId || this._tabCookieStores.get(details.tabId);

    // Nothing cached for this tab yet: resolve it asynchronously this once.
    if (!cookieStoreId) {
      return this._handleRequestAsync(details);
    }

    const color = this._colorFor(cookieStoreId);
    if (color === undefined) {
      return this._handleRequestAsync(details, cookieStoreId);
    }

    return this._buildHeaders(details, this._userAgentFor(cookieStoreId), color);
  },

  async _handleRequestAsync(details, knownCookieStoreId) {
    let cookieStoreId = knownCookieStoreId;

    if (!cookieStoreId) {
      try {
        const tab = await browser.tabs.get(details.tabId);
        cookieStoreId = tab.cookieStoreId;
      } catch {
        // Tab may have been closed or is otherwise inaccessible.
        return {};
      }
      if (!cookieStoreId) return {};
      this._tabCookieStores.set(details.tabId, cookieStoreId);
    }

    let color = this._colorFor(cookieStoreId);
    if (color === undefined) {
      try {
        const identity = await browser.contextualIdentities.get(cookieStoreId);
        this._containerColors.set(cookieStoreId, identity && identity.color);
        color = this._colorFor(cookieStoreId);
      } catch {
        color = null;
      }
      if (color === undefined) color = null;
    }

    return this._buildHeaders(details, this._userAgentFor(cookieStoreId), color);
  },
};

requestHeaders.init();
