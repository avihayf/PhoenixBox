/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Rewrites outgoing request headers for two features that both need to know
 * which container a request belongs to:
 *
 *   - User-Agent spoofing (per-container overrides win over the global one)
 *   - the X-MAC-Container-Color and X-MAC-Container-Name headers used for Burp
 *     Suite highlighting
 *
 * They share one blocking onBeforeSendHeaders listener because every extra
 * blocking listener delays every request. Container identity is served from
 * caches kept in sync with the tabs and contextualIdentities events, so the
 * common path resolves synchronously with no API round-trip per request.
 *
 * This file owns the browser I/O and the caches; every decision it makes is
 * delegated to the pure helpers in shared/requestHeaderHelpers.js, which are
 * unit-tested.
 */

const H = PhoenixBoxRequestHeaderHelpers;

const GLOBAL_UA_ENABLED_KEY = "globalUserAgentEnabled";
const GLOBAL_UA_KEY = "globalUserAgent";
const CONTAINER_UAS_KEY = "containerUserAgents";
const HIGHLIGHTER_HEADERS_KEY = H.HIGHLIGHTER_HEADERS_KEY;
const LEGACY_HIGHLIGHTER_HEADERS_KEY = H.LEGACY_HIGHLIGHTER_HEADERS_KEY;
// The Highlighter JAR version the user confirmed. The container name is only
// sent once that is new enough to strip it before it reaches the target.
const JAR_ACK_VERSION_KEY = H.JAR_ACK_VERSION_KEY;

const requestHeaders = {
  // Arms both the colour and the name header, hence not named for the colour.
  highlighterHeadersEnabled: false,
  jarAcknowledged: false,
  userAgentEnabled: false,
  globalUserAgent: null,
  containerUserAgents: {},

  /** @type {Map<number, string>} tabId -> cookieStoreId */
  _tabCookieStores: new Map(),
  /** @type {Map<string, {color: string|undefined, name: string|undefined}>} cookieStoreId -> identity */
  _containerIdentities: new Map(),
  _listening: false,
  _boundHandler: null,

  async init() {
    this._boundHandler = this._handleRequest.bind(this);

    const stored = await browser.storage.local.get({
      [GLOBAL_UA_ENABLED_KEY]: false,
      [GLOBAL_UA_KEY]: null,
      [CONTAINER_UAS_KEY]: {},
      [HIGHLIGHTER_HEADERS_KEY]: undefined,
      [LEGACY_HIGHLIGHTER_HEADERS_KEY]: false,
      [JAR_ACK_VERSION_KEY]: null,
    });

    this.userAgentEnabled = !!stored[GLOBAL_UA_ENABLED_KEY];
    this.globalUserAgent = stored[GLOBAL_UA_KEY];
    this.containerUserAgents = stored[CONTAINER_UAS_KEY] || {};
    this.highlighterHeadersEnabled = H.resolveHighlighterHeadersEnabled(stored);
    this.jarAcknowledged = H.isJarAcknowledged(stored[JAR_ACK_VERSION_KEY]);

    this._watchTabs();
    this._watchContainers();

    // Register before priming the caches: a cache miss only costs an async
    // lookup for that request, whereas waiting would let requests made during
    // startup slip through unmodified.
    this._applyListener();
    this._watchSettings();

    await Promise.all([this._primeTabCache(), this._primeContainerIdentities()]);
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
      // Both names are watched: the migration may not have run yet, and an
      // older profile can still be writing the legacy key.
      if (HIGHLIGHTER_HEADERS_KEY in changes) {
        this.highlighterHeadersEnabled = !!changes[HIGHLIGHTER_HEADERS_KEY].newValue;
      } else if (LEGACY_HIGHLIGHTER_HEADERS_KEY in changes) {
        this.highlighterHeadersEnabled = !!changes[LEGACY_HIGHLIGHTER_HEADERS_KEY].newValue;
      }
      // Picked up live, so confirming the JAR starts sending the name on the
      // very next request rather than after a restart.
      if (JAR_ACK_VERSION_KEY in changes) {
        this.jarAcknowledged = H.isJarAcknowledged(changes[JAR_ACK_VERSION_KEY].newValue);
      }

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

  async _primeContainerIdentities() {
    try {
      const identities = await browser.contextualIdentities.query({});
      for (const identity of identities) {
        this._containerIdentities.set(identity.cookieStoreId, {
          color: identity.color,
          name: identity.name,
        });
      }
    } catch (e) {
      LOG.warn("requestHeaders: could not prime container identities", e);
    }
  },

  _watchContainers() {
    if (!browser.contextualIdentities) return;

    const upsert = ({ contextualIdentity }) => {
      if (contextualIdentity) {
        this._containerIdentities.set(contextualIdentity.cookieStoreId, {
          color: contextualIdentity.color,
          name: contextualIdentity.name,
        });
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
          this._containerIdentities.delete(contextualIdentity.cookieStoreId);
        }
      });
    }
  },

  _isSupportedScheme(url) {
    return H.isSupportedScheme(url);
  },

  _userAgentFor(cookieStoreId) {
    return H.resolveUserAgent(cookieStoreId, this);
  },

  /**
   * @returns {string|undefined|null} the color name, `null` when the container
   *   should not be labelled, or `undefined` when the color is not cached yet.
   */
  _colorFor(cookieStoreId) {
    return H.resolveContainerColor(
      cookieStoreId,
      this.highlighterHeadersEnabled,
      this._containerIdentities
    );
  },

  /**
   * @returns {string|undefined|null} the percent-encoded container name, with
   *   the same three states as {@link _colorFor}.
   */
  _nameFor(cookieStoreId) {
    return H.resolveContainerName(
      cookieStoreId,
      this.highlighterHeadersEnabled,
      this._containerIdentities,
      this.jarAcknowledged
    );
  },

  _buildHeaders(details, userAgent, color, containerName) {
    return H.buildRequestHeaders(
      details && details.requestHeaders,
      userAgent,
      color,
      containerName
    );
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

    // Both resolvers gate on the same cache entry, so a defined color means the
    // name is resolvable without another lookup.
    return this._buildHeaders(
      details,
      this._userAgentFor(cookieStoreId),
      color,
      this._nameFor(cookieStoreId)
    );
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
        // Always populate the cache, even with an absent color: resolveContainerColor
        // tests for presence, so this is what stops the container falling down
        // this async path on every subsequent request.
        this._containerIdentities.set(cookieStoreId, {
          color: identity && identity.color,
          name: identity && identity.name,
        });
      } catch {
        // Container is gone or unreadable; cache that so we don't retry per request.
        this._containerIdentities.set(cookieStoreId, { color: undefined, name: undefined });
      }
      color = this._colorFor(cookieStoreId);
      if (color === undefined) color = null;
    }

    let containerName = this._nameFor(cookieStoreId);
    if (containerName === undefined) containerName = null;

    return this._buildHeaders(
      details,
      this._userAgentFor(cookieStoreId),
      color,
      containerName
    );
  },
};

requestHeaders.init().catch((e) => LOG.error("requestHeaders: init failed", e));
