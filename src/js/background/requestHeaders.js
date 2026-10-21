/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Rewrites outgoing request headers for two features:
 *
 *   - User-Agent spoofing (per-container overrides win over the global one)
 *   - Burp highlighting's legacy mode: while PhoenixBox is not paired with
 *     Phoenix Highlighter v2 and the Highlighter is on, containers carry X-MAC-Container-Color
 *     for the old v1.x JAR. Paired, highlighting is by listener
 *     (background/highlighterSync.js) and no header is added.
 *
 * The request's container is served from a tab cache kept in sync with the
 * tabs events, so the common path resolves synchronously with no API
 * round-trip per request.
 *
 * This file owns the browser I/O and the caches; every decision it makes is
 * delegated to the pure helpers in shared/requestHeaderHelpers.js, which are
 * unit-tested.
 */

const H = PhoenixBoxRequestHeaderHelpers;
const HSH = PhoenixBoxHighlighterSyncHelpers;

const GLOBAL_UA_ENABLED_KEY = "globalUserAgentEnabled";
const GLOBAL_UA_KEY = "globalUserAgent";
const CONTAINER_UAS_KEY = "containerUserAgents";

const requestHeaders = {
  userAgentEnabled: false,
  globalUserAgent: null,
  containerUserAgents: {},
  // Legacy highlighting: on while the Highlighter is on but not paired.
  legacyHighlighting: false,
  _paired: false,
  _enabled: false,
  /** @type {Map<string, string>} cookieStoreId -> Firefox container colour */
  _containerColors: new Map(),

  /** @type {Map<number, string>} tabId -> cookieStoreId */
  _tabCookieStores: new Map(),
  _listening: false,
  _boundHandler: null,

  async init() {
    this._boundHandler = this._handleRequest.bind(this);

    const stored = await browser.storage.local.get({
      [GLOBAL_UA_ENABLED_KEY]: false,
      [GLOBAL_UA_KEY]: null,
      [CONTAINER_UAS_KEY]: {},
      [HSH.PAIRING_KEY]: null,
      [HSH.ENABLED_KEY]: false,
    });

    this.userAgentEnabled = !!stored[GLOBAL_UA_ENABLED_KEY];
    this.globalUserAgent = stored[GLOBAL_UA_KEY];
    this.containerUserAgents = stored[CONTAINER_UAS_KEY] || {};
    this._paired = !!stored[HSH.PAIRING_KEY];
    this._enabled = stored[HSH.ENABLED_KEY] === true;
    this._updateLegacyHighlighting();

    this._watchTabs();
    this._watchContainerColors();

    // Register before priming the caches: a cache miss only costs an async
    // lookup for that request, whereas waiting would let requests made during
    // startup slip through unmodified.
    this._applyListener();
    this._watchSettings();

    await Promise.all([this._primeTabCache(), this._primeContainerColors()]);
  },

  _updateLegacyHighlighting() {
    this.legacyHighlighting = this._enabled && !this._paired;
  },

  // Registered before the caches are primed so a settings change made during
  // startup isn't dropped. Only mutates plain fields, so it is safe this early.
  _watchSettings() {
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
      // Picked up live: pairing stops the colour header on the very next
      // request, and unpairing starts it.
      if (HSH.PAIRING_KEY in changes) {
        this._paired = !!changes[HSH.PAIRING_KEY].newValue;
      }
      if (HSH.ENABLED_KEY in changes) {
        this._enabled = changes[HSH.ENABLED_KEY].newValue === true;
      }
      this._updateLegacyHighlighting();

      this._applyListener();
    });
  },

  // Any container-scoped UA counts, even when the global toggle is off.
  _hasContainerUserAgents() {
    return H.hasContainerUserAgents(this.containerUserAgents);
  },

  _shouldListen() {
    return H.shouldListen(this);
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
      LOG.warn("requestHeaders: could not read container colours", e);
    }
  },

  _watchContainerColors() {
    if (!browser.contextualIdentities) return;
    const upsert = ({ contextualIdentity }) => {
      if (contextualIdentity) {
        this._containerColors.set(contextualIdentity.cookieStoreId, contextualIdentity.color);
      }
    };
    browser.contextualIdentities.onCreated.addListener(upsert);
    browser.contextualIdentities.onUpdated.addListener(upsert);
    browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) => {
      if (contextualIdentity) this._containerColors.delete(contextualIdentity.cookieStoreId);
    });
  },

  /** The old JAR's colour header for this request, or null. */
  _legacyColorFor(cookieStoreId, details) {
    return HSH.legacyColorHeaderValue({
      paired: this._paired,
      enabled: this._enabled,
      cookieStoreId,
      firefoxColor: this._containerColors.get(cookieStoreId),
      proxyInfo: details && details.proxyInfo,
    });
  },

  _buildHeaders(details, cookieStoreId) {
    return H.buildRequestHeaders(
      details.requestHeaders,
      this._userAgentFor(cookieStoreId),
      this._legacyColorFor(cookieStoreId, details)
    );
  },

  _isSupportedScheme(url) {
    return H.isSupportedScheme(url);
  },

  _userAgentFor(cookieStoreId) {
    return H.resolveUserAgent(cookieStoreId, this);
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

    return this._buildHeaders(details, cookieStoreId);
  },

  async _handleRequestAsync(details) {
    let cookieStoreId;
    try {
      const tab = await browser.tabs.get(details.tabId);
      cookieStoreId = tab.cookieStoreId;
    } catch {
      // Tab may have been closed or is otherwise inaccessible.
      return {};
    }
    if (!cookieStoreId) return {};
    this._tabCookieStores.set(details.tabId, cookieStoreId);

    return this._buildHeaders(details, cookieStoreId);
  },
};

requestHeaders.init().catch((e) => LOG.error("requestHeaders: init failed", e));
