/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

window.assignManager = {
  MENU_ASSIGN_ID: "open-in-this-container",
  MENU_REMOVE_ID: "remove-open-in-this-container",
  MENU_SEPARATOR_ID: "separator",
  MENU_HIDE_ID: "hide-container",
  MENU_MOVE_ID: "move-to-new-window-container",
  OPEN_IN_CONTAINER: "open-bookmark-in-container-tab",
  GLOBAL_PROXY_ENABLED_KEY: "globalProxyEnabled",
  GLOBAL_PROXY_URL_KEY: "globalProxyUrl",
  GLOBAL_PROXY_PARSED_KEY: "globalProxyParsed",
  // Set when the configured global proxy was given a password. The password
  // itself is deliberately never persisted, so this flag is what lets us
  // notice that the in-memory copy is gone after a restart.
  GLOBAL_PROXY_NEEDS_PASSWORD_KEY: "globalProxyNeedsPassword",
  // Signal for the popup: the proxy is enabled and needs a password we no
  // longer hold, so requests through it will fail until the user re-enters it.
  GLOBAL_PROXY_CREDENTIALS_MISSING_KEY: "globalProxyCredentialsMissing",
  PROMOTED_PROXY_CONTAINER_ID_KEY: "promotedProxyContainerId",
  PROMOTED_PROXY_CONTAINER_IDS_KEY: "promotedProxyContainerIds",
  _sessionGlobalProxyPassword: null,
  globalProxy: {
    enabled: false,
    proxy: null,
  },
  promotedProxyContainerIds: [],

  _sanitizeGlobalProxyUrl(rawUrl) {
    return PhoenixBoxReviewHelpers.sanitizeGlobalProxyUrl(rawUrl);
  },

  _cacheGlobalProxySecret(proxy) {
    if (!proxy || typeof proxy !== "object") {
      this._sessionGlobalProxyPassword = null;
      return null;
    }

    const nextProxy = { ...proxy };
    if (nextProxy.password) {
      this._sessionGlobalProxyPassword = String(nextProxy.password);
      delete nextProxy.password;
    } else {
      this._sessionGlobalProxyPassword = null;
    }
    delete nextProxy.passwordEnc;
    return nextProxy;
  },

  setGlobalProxyConfig(proxy) {
    const sanitizedProxy = this._cacheGlobalProxySecret(proxy);
    this.globalProxy.proxy = sanitizedProxy;
    // This is the one moment we see the real password, so it is also the only
    // place that can record whether the proxy needs one. Requests are already
    // servable from the in-memory copy, so don't block on the write.
    browser.storage.local.set({
      [this.GLOBAL_PROXY_NEEDS_PASSWORD_KEY]: !!this._sessionGlobalProxyPassword,
      [this.GLOBAL_PROXY_CREDENTIALS_MISSING_KEY]: false,
    }).catch(() => {});
    return sanitizedProxy;
  },

  clearGlobalProxyConfig() {
    this._sessionGlobalProxyPassword = null;
    this.globalProxy.proxy = null;
    browser.storage.local.set({
      [this.GLOBAL_PROXY_NEEDS_PASSWORD_KEY]: false,
      [this.GLOBAL_PROXY_CREDENTIALS_MISSING_KEY]: false,
    }).catch(() => {});
  },
  storageArea: {
    area: browser.storage.local,
    exemptedTabs: {},

    isSiteStoreKey(value) {
      return PhoenixBoxReviewHelpers.isSiteStoreKey(value);
    },

    getSiteStoreKey(pageUrlorUrlKey) {
      if (this.isSiteStoreKey(pageUrlorUrlKey)) return pageUrlorUrlKey;
      const url = new window.URL(pageUrlorUrlKey);
      return PhoenixBoxReviewHelpers.buildSiteStoreKey(url.hostname, url.port);
    },

    getHostnameFromSiteStoreKey(siteStoreKey) {
      return PhoenixBoxReviewHelpers.getHostnameFromSiteStoreKey(siteStoreKey);
    },

    setExempted(pageUrlorUrlKey, tabId) {
      const siteStoreKey = this.getSiteStoreKey(pageUrlorUrlKey);
      if (!(siteStoreKey in this.exemptedTabs)) {
        this.exemptedTabs[siteStoreKey] = [];
      }
      this.exemptedTabs[siteStoreKey].push(tabId);
    },

    removeExempted(pageUrlorUrlKey) {
      const siteStoreKey = this.getSiteStoreKey(pageUrlorUrlKey);
      this.exemptedTabs[siteStoreKey] = [];
    },

    isExempted(pageUrlorUrlKey, tabId) {
      const siteStoreKey = this.getSiteStoreKey(pageUrlorUrlKey);
      if (!(siteStoreKey in this.exemptedTabs)) {
        return false;
      }
      return this.exemptedTabs[siteStoreKey].includes(tabId);
    },

    get(pageUrlorUrlKey) {
      const siteStoreKey = this.getSiteStoreKey(pageUrlorUrlKey);
      return this.getByUrlKey(siteStoreKey);
    },

    async getSyncEnabled() {
      const { syncEnabled } = await browser.storage.local.get("syncEnabled");
      return !!syncEnabled;
    },

    async getReplaceTabEnabled() {
      const { replaceTabEnabled } = await browser.storage.local.get("replaceTabEnabled");
      return !!replaceTabEnabled;
    },

    getByUrlKey(siteStoreKey) {
      return new Promise((resolve, reject) => {
        this.area.get([siteStoreKey]).then((storageResponse) => {
          if (storageResponse && siteStoreKey in storageResponse) {
            resolve(storageResponse[siteStoreKey]);
          } else {
            resolve(null);
          }
        }).catch(() => {
          reject();
        });
      });
    },

    async set(pageUrlorUrlKey, data, exemptedTabIds, backup = true) {
      const siteStoreKey = this.getSiteStoreKey(pageUrlorUrlKey);
      if (exemptedTabIds) {
        exemptedTabIds.forEach((tabId) => {
          this.setExempted(pageUrlorUrlKey, tabId);
        });
      }
      data.identityMacAddonUUID =
        await identityState.lookupMACaddonUUID(data.userContextId);
      if (!data.hostname && !this.isSiteStoreKey(pageUrlorUrlKey)) {
        try {
          const parsed = new window.URL(pageUrlorUrlKey);
          data.hostname = parsed.hostname;
        } catch {
          // ignore invalid URL shape and continue storing assignment
        }
      }
      await this.area.set({
        [siteStoreKey]: data
      });
      const syncEnabled = await this.getSyncEnabled();
      if (backup && syncEnabled) {
        await sync.storageArea.backup({undeleteSiteStoreKey: siteStoreKey});
      }
      return;
    },

    async remove(pageUrlorUrlKey, shouldSync = true) {
      const siteStoreKey = this.getSiteStoreKey(pageUrlorUrlKey);
      // When we remove an assignment we should clear all the exemptions
      this.removeExempted(pageUrlorUrlKey);
      await this.area.remove([siteStoreKey]);
      const syncEnabled = await this.getSyncEnabled();
      if (shouldSync && syncEnabled) await sync.storageArea.backup({siteStoreKey});
      return;
    },

    async deleteContainer(userContextId) {
      // getAssignedSites treats a falsy id as "every container", so without
      // this guard a bad id would delete every site assignment.
      if (!userContextId) return;
      const sitesByContainer = await this.getAssignedSites(userContextId);
      await this.area.remove(Object.keys(sitesByContainer));
      await identityState.storageArea.remove(backgroundLogic.cookieStoreId(userContextId));
    },

    async getAssignedSites(userContextId = null) {
      const sites = {};
      const siteConfigs = await this.area.get();
      for(const urlKey of Object.keys(siteConfigs)) {
        if (this.isSiteStoreKey(urlKey)) {
        // For some reason this is stored as string... lets check
        // them both as that
          if (!!userContextId &&
              String(siteConfigs[urlKey].userContextId)
                !== String(userContextId)) {
            continue;
          }
          const site = siteConfigs[urlKey];
          site.hostname = site.hostname || this.getHostnameFromSiteStoreKey(urlKey);
          sites[urlKey] = site;
        }
      }
      return sites;
    },

    /*
     * Looks for abandoned site assignments. If there is no identity with
     * the site assignment's userContextId (cookieStoreId), then the assignment
     * is removed.
     */
    async upgradeData() {
      const identitiesList = await browser.contextualIdentities.query({});
      const macConfigs = await this.area.get();
      for(const configKey of Object.keys(macConfigs)) {
        if (this.isSiteStoreKey(configKey)) {
          const cookieStoreId =
            "firefox-container-" + macConfigs[configKey].userContextId;
          const match = identitiesList.find(
            localIdentity => localIdentity.cookieStoreId === cookieStoreId
          );
          if (!match) {
            await this.remove(configKey);
            continue;
          }
          const updatedSiteAssignment = macConfigs[configKey];
          updatedSiteAssignment.identityMacAddonUUID =
            await identityState.lookupMACaddonUUID(match.cookieStoreId);
          await this.set(
            configKey,
            updatedSiteAssignment,
            false,
            false
          );
        }
      }

    }

  },

  _neverAsk(m) {
    const pageUrl = m.pageUrl;
    if (m.neverAsk === true) {
      if (m.defaultContainer === true) {
        this.storageArea.remove(pageUrl);
        return;
      }

      // If we have existing data and for some reason it hasn't been
      // deleted etc lets update it
      this.storageArea.get(pageUrl).then((siteSettings) => {
        if (siteSettings) {
          siteSettings.neverAsk = true;
          siteSettings.userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(m.cookieStoreId);
          this.storageArea.set(pageUrl, siteSettings);
        }
      }).catch(() => {
        // ignore
      });
    }
  },

  // We return here so the confirm page can load the tab when exempted
  async _exemptTab(m) {
    const pageUrl = m.pageUrl;
    await this.storageArea.setExempted(pageUrl, m.tabId);
    return true;
  },

  /**
   * Which container a proxied request belongs to.
   *
   * Firefox puts cookieStoreId on proxy.onRequest details when the extension
   * holds the cookies permission — including requests with no tab, such as
   * service-worker fetches and navigation preload. Keying on the tab alone
   * sent all of those DIRECT, straight past Burp or the VPN.
   */
  async _cookieStoreIdForProxyRequest(requestInfo) {
    if (requestInfo.cookieStoreId) return requestInfo.cookieStoreId;
    if (typeof requestInfo.tabId !== "number" || requestInfo.tabId < 0) return null;
    try {
      const tab = await browser.tabs.get(requestInfo.tabId);
      return tab.cookieStoreId || null;
    } catch {
      // Tab may have been closed between request dispatch and lookup.
      LOG.warn("handleProxifiedRequest: tab lookup failed", requestInfo.tabId);
      return null;
    }
  },

  async handleProxifiedRequest(requestInfo) {
    // Runs for every request of every type. When no proxy of either kind is
    // configured, answer without touching tabs or storage.
    if (!this.globalProxy.enabled && proxifiedContainers.hasAnyCached() === false) {
      return { type: "direct" };
    }

    const cookieStoreId = await this._cookieStoreIdForProxyRequest(requestInfo);
    if (!cookieStoreId) {
      // Browser-internal traffic with no container to route by.
      return { type: "direct" };
    }

    // 1) Container-specific proxy has priority (existing behavior).
    const result = await proxifiedContainers.retrieve(cookieStoreId);
    if (result && result.proxy) {
      // proxyDNS only applies to SOCKS proxies.  Respect the stored
      // preference (set via Advanced Proxy Settings); default to true
      // only when no explicit value was saved.
      if (["socks", "socks4"].includes(result.proxy.type)) {
        if (result.proxy.proxyDNS === undefined) {
          result.proxy.proxyDNS = true;
        }
      }

      if (!result.proxy.mozProxyEnabled) {
        return result.proxy;
      }

      // Let's add the isolation key.
      return [{ ...result.proxy, connectionIsolationKey: "" + MozillaVPN_Background.isolationKey }];
    }

    // 2) Global proxy fallback (only when no container-specific proxy exists).
    const globalFallbackAllowed = PhoenixBoxReviewHelpers.shouldAllowGlobalProxyFallback(
      cookieStoreId,
      this.promotedProxyContainerIds
    );
    if (globalFallbackAllowed && this.globalProxy.enabled && this.globalProxy.proxy) {
      const proxy = { ...this.globalProxy.proxy };
      if (!proxy.password && this._sessionGlobalProxyPassword) {
        proxy.password = this._sessionGlobalProxyPassword;
      }
      if (["socks", "socks4"].includes(proxy.type)) {
        // Global proxy is parsed from a URL string and has no UI toggle
        // for proxyDNS, so default to true when unset.
        if (proxy.proxyDNS === undefined) {
          proxy.proxyDNS = true;
        }
      }
      return proxy;
    }

    return { type: "direct" };
  },

  // Before a request is handled by the browser we decide if we should
  // route through a different container
  async onBeforeRequest(options) {
    if (options.frameId !== 0 || options.tabId === -1) {
      return {};
    }
    const [tab, siteSettings] = await Promise.all([
      browser.tabs.get(options.tabId),
      this.storageArea.get(options.url)
    ]);
    if (siteSettings) {
      const container =
        await this._lookupAssignedContainer(siteSettings.userContextId);

      // Lookup failed for a reason we can't attribute to a missing container.
      // Dropping every assignment for the container is irreversible, so leave
      // the stored data alone and let the load continue untouched.
      if (container === null) {
        return {};
      }

      // The container we have in the assignment map isn't present any
      // more so lets remove it then continue the existing load
      if (container === false) {
        await this.deleteContainer(siteSettings.userContextId);
        return {};
      }
    }
    const userContextId = this.getUserContextIdFromCookieStore(tab);

    // https://github.com/mozilla/multi-account-containers/issues/847
    //
    // Handle the case where this request's URL is not assigned to any particular
    // container. We must do the following check:
    //
    // If the current tab's container is "unlocked", we can just go ahead
    // and open the URL in the current tab, since an "unlocked" container accepts
    // any-and-all sites.
    //
    // But if the current tab's container has been "locked" by the user, then we must
    // re-open the page in the default container, because the user doesn't want random
    // sites polluting their locked container.
    //
    // For example:
    //   - the current tab's container is locked and only allows "www.google.com"
    //   - the incoming request is for "www.amazon.com", which has no specific container assignment
    //   - in this case, we must re-open "www.amazon.com" in a new tab in the default container
    const siteIsolatedReloadInDefault =
      await this._maybeSiteIsolatedReloadInDefault(siteSettings, tab);

    if (!siteIsolatedReloadInDefault) {
      if (!siteSettings
          || userContextId === siteSettings.userContextId
          || this.storageArea.isExempted(options.url, tab.id)) {
        return {};
      }
    }
    const replaceTabEnabled = await this.storageArea.getReplaceTabEnabled();
    const removeTab = backgroundLogic.NEW_TAB_PAGES.has(tab.url)
      || (messageHandler.lastCreatedTab
        && messageHandler.lastCreatedTab.id === tab.id)
      || replaceTabEnabled;
    const openTabId = removeTab ? tab.openerTabId : tab.id;

    if (!this.canceledRequests[tab.id]) {
      // we decided to cancel the request at this point, register
      // canceled request
      this.canceledRequests[tab.id] = {
        requestIds: {
          [options.requestId]: true
        },
        urls: {
          [options.url]: true
        }
      };

      // since webRequest onCompleted and onErrorOccurred are not 100%
      // reliable (see #1120)
      // we register a timer here to cleanup canceled requests, just to
      // make sure we don't
      // end up in a situation where certain urls in a tab.id stay canceled
      setTimeout(() => {
        if (this.canceledRequests[tab.id]) {
          delete this.canceledRequests[tab.id];
        }
      }, 2000);
    } else {
      let cancelEarly = false;
      if (this.canceledRequests[tab.id].requestIds[options.requestId] ||
          this.canceledRequests[tab.id].urls[options.url]) {
        // same requestId or url from the same tab
        // this is a redirect that we have to cancel early to prevent
        // opening two tabs
        cancelEarly = true;
      }
      // we decided to cancel the request at this point, register canceled
      // request
      this.canceledRequests[tab.id].requestIds[options.requestId] = true;
      this.canceledRequests[tab.id].urls[options.url] = true;
      if (cancelEarly) {
        return {
          cancel: true
        };
      }
    }

    // The original request is cancelled below either way, so the reopen must
    // succeed before the original tab may be closed — otherwise a failed
    // create (e.g. an opener in another window) loses the navigation and,
    // with replaceTabEnabled, the tab itself.
    const reopened = siteIsolatedReloadInDefault
      ? this.reloadPageInDefaultContainer(
        options.url,
        tab.index + 1,
        tab.active,
        openTabId,
        tab.groupId,
        tab.windowId
      )
      : this.reloadPageInContainer(
        options.url,
        userContextId,
        siteSettings.userContextId,
        tab.index + 1,
        tab.active,
        siteSettings.neverAsk,
        openTabId,
        tab.groupId,
        tab.windowId
      );
    this.refreshContextMenuFor(tab);

    /* Removal of existing tabs:
        We aim to open the new assigned container tab / warning prompt in
        it's own tab:
          - As the history won't span from one container to another it
            seems most sane to not try and reopen a tab on history.back()
          - When users open a new tab themselves we want to make sure we
            don't end up with three tabs as per:
            https://github.com/mozilla/testpilot-containers/issues/421
        If we are coming from an internal url that are used for the new
        tab page (NEW_TAB_PAGES), we can safely close as user is unlikely
        losing history
        Detecting redirects on "new tab" opening actions is pretty hard
        as we don't get tab history:
        - Redirects happen from Short URLs and tracking links that act as
          a gateway
        - Extensions don't provide a way to history crawl for tabs, we
          could inject content scripts to do this
            however they don't run on about:blank so this would likely be
            just as hacky.
        We capture the time the tab was created and close if it was within
        the timeout to try to capture pages which haven't had user
        interaction or history.
    */
    // Not awaited: this is a blocking listener, and cancelling must not wait
    // on tab creation. The close is chained onto the reopen succeeding.
    Promise.resolve(reopened).then(() => {
      if (removeTab) return browser.tabs.remove(tab.id);
    }).catch((e) => {
      LOG.error("Could not reopen the page in its assigned container:", e);
    });
    return {
      cancel: true,
    };
  },

  /**
   * Resolve the container an assignment points at.
   *
   * `contextualIdentities.get` rejects both when the container is genuinely
   * gone and on transient failures, and the caller deletes every assignment
   * for the container on a negative answer. So confirm against the full
   * identity list before reporting the container as missing.
   *
   * @param {string|number} userContextId
   * @returns {Promise<object|false|null>} the identity, `false` when the
   *   container is confirmed missing, or `null` when the state is unknown.
   */
  async _lookupAssignedContainer(userContextId) {
    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    try {
      const identity = await browser.contextualIdentities.get(cookieStoreId);
      return identity || null;
    } catch {
      try {
        const identities = await browser.contextualIdentities.query({});
        const match = identities.find(
          (identity) => identity.cookieStoreId === cookieStoreId
        );
        return match || false;
      } catch (e) {
        LOG.warn("Could not confirm container for assignment", cookieStoreId, e);
        return null;
      }
    }
  },

  async _maybeSiteIsolatedReloadInDefault(siteSettings, tab) {
    // Tab doesn't support cookies, so containers not supported either.
    if (!("cookieStoreId" in tab)) {
      return false;
    }

    // Requested page has been assigned to a specific container.
    // I.e. it will be opened in that container anyway, so we don't need to check if the
    // current tab's container is locked or not.
    if (siteSettings) {
      return false;
    }

    //tab is alredy reopening in the default container
    if (tab.cookieStoreId === "firefox-default") {
      return false;
    }
    // Requested page is not assigned to a specific container. If the current tab's container
    // is locked, then the page must be reloaded in the default container.
    const currentContainerState = await identityState.storageArea.get(tab.cookieStoreId);
    return currentContainerState && currentContainerState.isIsolated;
  },

  /**
   * Answer HTTP(S) proxy authentication challenges.
   *
   * Firefox only uses ProxyInfo username/password for SOCKS. For an HTTP or
   * HTTPS proxy the credentials in the proxy URL were silently ignored: the
   * proxy answered 407 and Firefox showed its own login prompt. Supply them
   * here instead, once per request, so wrong credentials fall through to that
   * prompt rather than looping.
   */
  _proxyAuthAttempts: new Set(),

  async _handleProxyAuth(details) {
    if (!details.isProxy || this._proxyAuthAttempts.has(details.requestId)) return {};
    const challenger = details.challenger || {};

    const candidates = [];
    const cookieStoreId = details.cookieStoreId ||
      await this._cookieStoreIdForProxyRequest(details);
    if (cookieStoreId) {
      const entry = await proxifiedContainers.retrieve(cookieStoreId);
      if (entry && entry.proxy) candidates.push(entry.proxy);
    }
    if (this.globalProxy.enabled && this.globalProxy.proxy) {
      candidates.push({ ...this.globalProxy.proxy, password: this._sessionGlobalProxyPassword });
    }

    const match = candidates.find((proxy) =>
      proxy.username && proxy.password &&
      String(proxy.host || "").toLowerCase() === String(challenger.host || "").toLowerCase() &&
      Number(proxy.port) === Number(challenger.port));
    if (!match) return {};

    this._proxyAuthAttempts.add(details.requestId);
    return { authCredentials: { username: String(match.username), password: String(match.password) } };
  },

  _proxyListenerAdded: false,

  maybeAddProxyListeners() {
    if (browser.proxy && !this._proxyListenerAdded) {
      // Bind handler to keep `this` context
      this._boundHandleProxifiedRequest = this.handleProxifiedRequest.bind(this);
      browser.proxy.onRequest.addListener(this._boundHandleProxifiedRequest, {urls: ["<all_urls>"]});
      this._proxyListenerAdded = true;
    }
  },

  // Remove the proxy.onRequest listener and reset the flag so
  // maybeAddProxyListeners() can re-register it later (e.g. after
  // the optional proxy permission is revoked then re-granted).
  resetProxyListener() {
    if (this._proxyListenerAdded && this._boundHandleProxifiedRequest) {
      try {
        browser.proxy.onRequest.removeListener(this._boundHandleProxifiedRequest);
      } catch (e) {
        // Listener may already have been removed by the browser when the
        // permission was revoked – that's fine.
      }
      this._proxyListenerAdded = false;
    }
  },

  init() {
    this._initGlobalProxy();

    browser.contextMenus.onClicked.addListener((info, tab) => {
      info.bookmarkId ?
        this._onClickedBookmark(info) :
        this._onClickedHandler(info, tab);
    });

    // Before anything happens we decide if the request should be proxified
    this.maybeAddProxyListeners();

    // When proxy permission is granted later, add the listener
    browser.permissions.onAdded.addListener((permissions) => {
      if (permissions.permissions && permissions.permissions.includes("proxy")) {
        this.maybeAddProxyListeners();
      }
    });

    this.canceledRequests = {};
    browser.webRequest.onBeforeRequest.addListener((options) => {
      return this.onBeforeRequest(options);
    },{urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);

    // Clean up canceled requests
    browser.webRequest.onCompleted.addListener((options) => {
      if (this.canceledRequests[options.tabId]) {
        delete this.canceledRequests[options.tabId];
      }
    },{urls: ["<all_urls>"], types: ["main_frame"]});
    browser.webRequest.onErrorOccurred.addListener((options) => {
      if (this.canceledRequests[options.tabId]) {
        delete this.canceledRequests[options.tabId];
      }
    },{urls: ["<all_urls>"], types: ["main_frame"]});

    if (browser.webRequest.onAuthRequired) {
      browser.webRequest.onAuthRequired.addListener(
        (details) => this._handleProxyAuth(details),
        { urls: ["<all_urls>"] },
        ["blocking"]
      );
      const forget = (details) => this._proxyAuthAttempts.delete(details.requestId);
      browser.webRequest.onCompleted.addListener(forget, { urls: ["<all_urls>"] });
      browser.webRequest.onErrorOccurred.addListener(forget, { urls: ["<all_urls>"] });
    }

    this.resetBookmarksMenuItem();
  },

  /**
   * Adopt a proxy config that arrived through storage.
   *
   * Stored configs are password-less by design. The popup sends the real
   * config (password included) by message first and then writes the stripped
   * copy, so that write echoes back here. Re-caching from it blindly wiped the
   * password milliseconds after it was set, and an authenticated global proxy
   * never worked in the session it was configured. Keep the in-memory password
   * while the stored config is still the same endpoint and user.
   */
  _applyStoredGlobalProxy(stored) {
    if (stored && !stored.password && this._sessionGlobalProxyPassword &&
        PhoenixBoxReviewHelpers.isSameProxyEndpoint(stored, this.globalProxy.proxy)) {
      const password = this._sessionGlobalProxyPassword;
      this.globalProxy.proxy = this._cacheGlobalProxySecret(stored);
      this._sessionGlobalProxyPassword = password;
      return;
    }
    this.globalProxy.proxy = this._cacheGlobalProxySecret(stored);
  },

  /** Load the stored global proxy when it is enabled without being resent. */
  async _reloadStoredGlobalProxy() {
    const stored = await browser.storage.local.get({
      [this.GLOBAL_PROXY_PARSED_KEY]: null,
      [this.GLOBAL_PROXY_NEEDS_PASSWORD_KEY]: false,
    });
    if (!this.globalProxy.proxy) {
      this._applyStoredGlobalProxy(stored[this.GLOBAL_PROXY_PARSED_KEY] || null);
    }
    // Same signal as at startup: enabled, needs a password, none in memory.
    const credentialsMissing =
      !!this.globalProxy.proxy &&
      !!stored[this.GLOBAL_PROXY_NEEDS_PASSWORD_KEY] &&
      !this._sessionGlobalProxyPassword;
    await browser.storage.local.set({ [this.GLOBAL_PROXY_CREDENTIALS_MISSING_KEY]: credentialsMissing });
  },

  _sanitizePromotedProxyContainerIds(rawIds) {
    return PhoenixBoxReviewHelpers.sanitizePromotedProxyContainerIds(rawIds);
  },

  async _initGlobalProxy() {
    const stored = await browser.storage.local.get({
      [this.GLOBAL_PROXY_ENABLED_KEY]: false,
      [this.GLOBAL_PROXY_URL_KEY]: "",
      [this.GLOBAL_PROXY_PARSED_KEY]: null,
      [this.GLOBAL_PROXY_NEEDS_PASSWORD_KEY]: false,
      [this.PROMOTED_PROXY_CONTAINER_ID_KEY]: "",
      [this.PROMOTED_PROXY_CONTAINER_IDS_KEY]: null,
    });
    this.globalProxy.enabled = !!stored[this.GLOBAL_PROXY_ENABLED_KEY];

    // Migrate the legacy single promoted container ID into the array key when
    // the new key has never been written.
    const storedIds = stored[this.PROMOTED_PROXY_CONTAINER_IDS_KEY];
    let needsPromotedMigration = false;
    if (Array.isArray(storedIds)) {
      this.promotedProxyContainerIds = this._sanitizePromotedProxyContainerIds(storedIds);
    } else {
      const legacyId = String(stored[this.PROMOTED_PROXY_CONTAINER_ID_KEY] || "");
      this.promotedProxyContainerIds = legacyId ? [legacyId] : [];
      needsPromotedMigration = true;
    }
    if (needsPromotedMigration) {
      await browser.storage.local.set({
        [this.PROMOTED_PROXY_CONTAINER_IDS_KEY]: this.promotedProxyContainerIds,
      });
    }

    // Use the private cache helper rather than setGlobalProxyConfig(): the
    // stored config has already had its password stripped, so the public
    // setter would record "this proxy needs no password" and mask the very
    // situation we are about to detect.
    const sanitizedProxy = this._cacheGlobalProxySecret(stored[this.GLOBAL_PROXY_PARSED_KEY] || null);
    this.globalProxy.proxy = sanitizedProxy;

    const sanitizedUrl = this._sanitizeGlobalProxyUrl(stored[this.GLOBAL_PROXY_URL_KEY]);
    const needsProxyScrub = JSON.stringify(sanitizedProxy) !== JSON.stringify(stored[this.GLOBAL_PROXY_PARSED_KEY] || null);
    const needsUrlScrub = sanitizedUrl !== String(stored[this.GLOBAL_PROXY_URL_KEY] || "");

    // Passwords only ever live in memory, so a configured authenticated proxy
    // always comes back credential-less after a restart. Flag it so the popup
    // can say so instead of the user seeing unexplained proxy failures.
    const credentialsMissing =
      this.globalProxy.enabled &&
      !!stored[this.GLOBAL_PROXY_NEEDS_PASSWORD_KEY] &&
      !this._sessionGlobalProxyPassword;

    const updates = {};
    if (needsProxyScrub) updates[this.GLOBAL_PROXY_PARSED_KEY] = sanitizedProxy;
    if (needsUrlScrub) updates[this.GLOBAL_PROXY_URL_KEY] = sanitizedUrl;
    updates[this.GLOBAL_PROXY_CREDENTIALS_MISSING_KEY] = credentialsMissing;
    await browser.storage.local.set(updates);

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (this.GLOBAL_PROXY_ENABLED_KEY in changes) {
        this.globalProxy.enabled = !!changes[this.GLOBAL_PROXY_ENABLED_KEY].newValue;
        if (!this.globalProxy.enabled) {
          // Drop the secret, but keep the endpoint. Clearing the whole config
          // here meant a later re-enable that did not also resend it — the
          // permission re-grant "rescue" in backgroundLogic — showed the proxy
          // as ON while every request went DIRECT.
          this._sessionGlobalProxyPassword = null;
        } else {
          // Re-check if we need to add the proxy listener (in case permission was just granted)
          this.maybeAddProxyListeners();
          this._reloadStoredGlobalProxy().catch((e) =>
            LOG.error("Failed to reload the global proxy on enable:", e));
        }
      }
      if (this.GLOBAL_PROXY_PARSED_KEY in changes) {
        this._applyStoredGlobalProxy(changes[this.GLOBAL_PROXY_PARSED_KEY].newValue || null);
      }
      if (this.PROMOTED_PROXY_CONTAINER_IDS_KEY in changes) {
        this.promotedProxyContainerIds = this._sanitizePromotedProxyContainerIds(
          changes[this.PROMOTED_PROXY_CONTAINER_IDS_KEY].newValue
        );
      }
    });
  },

  async resetBookmarksMenuItem() {
    const hasPermission = await browser.permissions.contains({
      permissions: ["bookmarks"]
    });
    if (this.hadBookmark === hasPermission) {
      return;
    }
    this.hadBookmark = hasPermission;
    if (hasPermission) {
      this.initBookmarksMenu();
      browser.contextualIdentities.onCreated
        .addListener(this.contextualIdentityCreated);
      browser.contextualIdentities.onUpdated
        .addListener(this.contextualIdentityUpdated);
      browser.contextualIdentities.onRemoved
        .addListener(this.contextualIdentityRemoved);
    } else {
      this.removeBookmarksMenu();
      browser.contextualIdentities.onCreated
        .removeListener(this.contextualIdentityCreated);
      browser.contextualIdentities.onUpdated
        .removeListener(this.contextualIdentityUpdated);
      browser.contextualIdentities.onRemoved
        .removeListener(this.contextualIdentityRemoved);
    }
  },

  contextualIdentityCreated(changeInfo) {
    browser.contextMenus.create({
      parentId: assignManager.OPEN_IN_CONTAINER,
      id: changeInfo.contextualIdentity.cookieStoreId,
      title: changeInfo.contextualIdentity.name,
      icons: { "16": `img/usercontext.svg#${
        changeInfo.contextualIdentity.icon
      }` }
    });
  },

  contextualIdentityUpdated(changeInfo) {
    browser.contextMenus.update(
      changeInfo.contextualIdentity.cookieStoreId, {
        title: changeInfo.contextualIdentity.name,
        icons: { "16": `img/usercontext.svg#${
          changeInfo.contextualIdentity.icon}` }
      });
  },

  // Registered as a listener, unbound: `this` is not assignManager here, so it
  // used to throw and leave the deleted container in the bookmark submenu.
  contextualIdentityRemoved(changeInfo) {
    assignManager.removeMenuItem(changeInfo.contextualIdentity.cookieStoreId);
  },

  async _onClickedHandler(info, tab) {
    const userContextId = this.getUserContextIdFromCookieStore(tab);
    // Mapping ${URL(info.pageUrl).hostname} to ${userContextId}
    let remove;
    if (userContextId) {
      switch (info.menuItemId) {
      case this.MENU_ASSIGN_ID:
      case this.MENU_REMOVE_ID:
        if (info.menuItemId === this.MENU_ASSIGN_ID) {
          remove = false;
        } else {
          remove = true;
        }
        await this._setOrRemoveAssignment(
          tab.id, info.pageUrl, userContextId, remove
        );
        break;
      case this.MENU_MOVE_ID:
        // Container-scoped: gathers this container's tabs from every window.
        backgroundLogic.moveTabsToWindow({
          cookieStoreId: tab.cookieStoreId,
        });
        break;
      case this.MENU_HIDE_ID:
        // Container-scoped: hides this container's tabs in every window.
        backgroundLogic.hideTabs({
          cookieStoreId: tab.cookieStoreId,
        });
        break;
      }
    }
  },

  async _onClickedBookmark(info) {

    async function _getBookmarksFromInfo(info) {
      const [bookmarkTreeNode] =
        await browser.bookmarks.get(info.bookmarkId);
      if (bookmarkTreeNode.type === "folder") {
        return browser.bookmarks.getChildren(bookmarkTreeNode.id);
      }
      return [bookmarkTreeNode];
    }

    const bookmarks = await _getBookmarksFromInfo(info);
    for (const bookmark of bookmarks) {
      if ( !/^(javascript|place):/i.test(bookmark.url) &&
          bookmark.type !== "folder") {
        const openInReaderMode = bookmark.url.startsWith("about:reader");
        if(openInReaderMode) {
          try {
            const parsed = new URL(bookmark.url);
            const innerUrl = parsed.searchParams.get("url");
            if (!innerUrl || /^(javascript|data|blob|place):/i.test(innerUrl)) {
              continue;
            }
            bookmark.url = innerUrl + (parsed.hash || "");
          } catch {
            continue;
          }
        }
        browser.tabs.create({
          cookieStoreId: info.menuItemId,
          url: bookmark.url,
          openInReaderMode: openInReaderMode
        });
      }
    }
  },


  deleteContainer(userContextId) {
    return this.storageArea.deleteContainer(userContextId);
  },

  getUserContextIdFromCookieStore(tab) {
    if (!("cookieStoreId" in tab)) {
      return false;
    }
    return backgroundLogic.getUserContextIdFromCookieStoreId(
      tab.cookieStoreId
    );
  },

  isTabPermittedAssign(tab) {
    // Ensure we are not an important about url
    const url = new URL(tab.url);
    if (url.protocol === "about:"
        || url.protocol === "moz-extension:") {
      return false;
    }
    return true;
  },

  /**
   * Clear cookies for a site within one container.
   *
   * browsingData.removeCookies only matches the exact hostnames it is given,
   * so on its own it leaves behind the two kinds of cookie that matter most
   * here: cookies set on subdomains (api.example.com) and domain cookies set
   * on a parent (.example.com) that are still sent to this host. Both would
   * keep a session alive after the user asked for a reset, so enumerate via
   * the cookies API and delete those explicitly too.
   */
  async _resetCookiesForSite(hostname, cookieStoreId) {
    // Assignment keys can carry a ":port" suffix, but cookies are not scoped
    // by port, so drop it before matching.
    const host = String(hostname || "").trim()
      .replace(/^\.+/, "")
      .replace(/:\d+$/, "");
    if (!host) {
      return false;
    }
    const bare = host.replace(/^www\./, "");
    const hostnames = [...new Set([host, bare, `www.${bare}`])];

    await browser.browsingData.removeCookies({
      cookieStoreId: cookieStoreId,
      hostnames
    });

    await this._removeRelatedCookies(bare, cookieStoreId);
    return true;
  },

  async _removeRelatedCookies(bareHostname, cookieStoreId) {
    const collected = new Map();
    const collect = (cookies) => {
      for (const cookie of cookies || []) {
        // domain + path + name identifies a cookie within a store.
        collected.set(`${cookie.domain}|${cookie.path}|${cookie.name}`, cookie);
      }
    };

    // `domain` covers the host and its subdomains; the `url` query additionally
    // returns parent-domain cookies that apply to the host.
    const queries = [
      { domain: bareHostname, storeId: cookieStoreId, firstPartyDomain: null },
      { url: `https://${bareHostname}/`, storeId: cookieStoreId, firstPartyDomain: null },
      { url: `http://${bareHostname}/`, storeId: cookieStoreId, firstPartyDomain: null },
    ];

    for (const query of queries) {
      try {
        collect(await browser.cookies.getAll(query));
      } catch (e) {
        LOG.warn("resetCookiesForSite: cookie lookup failed", query, e);
      }
    }

    await Promise.all(
      [...collected.values()].map(async (cookie) => {
        const domain = cookie.domain.replace(/^\./, "");
        const scheme = cookie.secure ? "https" : "http";
        const removal = {
          url: `${scheme}://${domain}${cookie.path}`,
          name: cookie.name,
          storeId: cookieStoreId,
        };
        if (cookie.firstPartyDomain !== undefined) {
          removal.firstPartyDomain = cookie.firstPartyDomain;
        }
        if (cookie.partitionKey !== undefined) {
          removal.partitionKey = cookie.partitionKey;
        }
        try {
          await browser.cookies.remove(removal);
        } catch (e) {
          LOG.warn("resetCookiesForSite: could not remove cookie", cookie.name, e);
        }
      })
    );
  },

  async _setOrRemoveAssignment(tabId, pageUrl, userContextId, remove) {
    let actionName;
    // https://github.com/mozilla/testpilot-containers/issues/626
    // Context menu has stored context IDs as strings, so we need to coerce
    // the value to a string for accurate checking
    userContextId = String(userContextId);

    if (!remove) {
      const tabs = await browser.tabs.query({});
      const assignmentStoreKey = this.storageArea.getSiteStoreKey(pageUrl);
      const exemptedTabIds = tabs.filter((tab) => {
        const tabStoreKey = this.storageArea.getSiteStoreKey(tab.url);
        /* Auto exempt all tabs that exist for this hostname that are not in the same container */
        if (tabStoreKey === assignmentStoreKey &&
            this.getUserContextIdFromCookieStore(tab) !== userContextId) {
          return true;
        }
        return false;
      }).map((tab) => {
        return tab.id;
      });

      await this.storageArea.set(pageUrl, {
        userContextId,
        neverAsk: false
      }, exemptedTabIds);
      actionName = "assigned site to always open in this container";
    } else {
      // The container that actually held the assignment. The page action's
      // "Default" entry removes with userContextId false, which re-checked
      // isolation for a non-existent "firefox-container-false" and left the
      // real container locked with zero sites.
      const existing = await this.storageArea.get(pageUrl);
      const owner = existing && existing.userContextId ? String(existing.userContextId) : userContextId;

      // Remove assignment
      await this.storageArea.remove(pageUrl);

      actionName = "removed from assigned sites list";

      // remove site isolation if now empty
      if (owner && owner !== "false") {
        await this._maybeRemoveSiteIsolation(owner);
      }
    }

    if (tabId) {
      await this._announceToTab(tabId, `Successfully ${actionName}`);
    }
  },

  /**
   * Show the in-page confirmation toast once the tab can receive it.
   *
   * The content script runs at document_idle, so a fixed one-second delay
   * could arrive before it existed and the toast silently never appeared.
   * Wait for the tab to finish loading (bounded), then send. Best-effort:
   * pages the content script cannot run in simply get no toast.
   */
  async _announceToTab(tabId, text) {
    let tab;
    try {
      tab = await browser.tabs.get(tabId);
    } catch {
      return;
    }
    this.refreshContextMenuFor(tab);

    if (tab.status !== "complete") {
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          browser.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        };
        const onUpdated = (id, changeInfo) => {
          if (id === tabId && changeInfo.status === "complete") done();
        };
        const timer = setTimeout(done, 10000);
        browser.tabs.onUpdated.addListener(onUpdated, { tabId, properties: ["status"] });
      });
    }
    browser.tabs.sendMessage(tabId, { text }).catch(() => {});
  },

  async _maybeRemoveSiteIsolation(userContextId) {
    const assignments = await this.storageArea.getAssignedSites(userContextId);
    const hasAssignments = assignments && Object.keys(assignments).length > 0;
    if (hasAssignments) {
      return;
    }
    await backgroundLogic.addRemoveSiteIsolation(
      backgroundLogic.cookieStoreId(userContextId),
      true
    );
  },

  async _getAssignment(tab) {
    const cookieStore = this.getUserContextIdFromCookieStore(tab);
    // Ensure we have a cookieStore to assign to
    if (cookieStore
        && this.isTabPermittedAssign(tab)) {
      return this.storageArea.get(tab.url);
    }
    return false;
  },

  _getByContainer(userContextId) {
    return this.storageArea.getAssignedSites(userContextId);
  },

  removeContextMenu() {
    // There is a focus issue in this menu where if you change window with a context menu click
    // you get the wrong menu display because of async
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1215376#c16
    // We also can't change for always private mode
    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1352102
    this.removeMenuItem(this.MENU_ASSIGN_ID);
    this.removeMenuItem(this.MENU_REMOVE_ID);
    this.removeMenuItem(this.MENU_SEPARATOR_ID);
    this.removeMenuItem(this.MENU_HIDE_ID);
    this.removeMenuItem(this.MENU_MOVE_ID);
  },

  /**
   * Rebuild the context menu for a tab only if it is the one on screen.
   *
   * The menu is global, not per tab. Every main-frame load in any tab used to
   * tear it down and rebuild it for that tab, so a background tab finishing a
   * load left the active tab with the wrong menu, or none at all.
   */
  refreshContextMenuFor(tab) {
    if (!tab || !tab.active) return;
    this.calculateContextMenu(tab).catch((e) =>
      LOG.error("Failed to update the context menu:", e));
  },

  async calculateContextMenu(tab) {
    this.removeContextMenu();
    const siteSettings = await this._getAssignment(tab);
    // Return early and not add an item if we have false
    // False represents assignment is not permitted
    if (siteSettings === false) {
      return false;
    }
    let checked = false;
    let menuId = this.MENU_ASSIGN_ID;
    const tabUserContextId = this.getUserContextIdFromCookieStore(tab);
    if (siteSettings &&
        Number(siteSettings.userContextId) === Number(tabUserContextId)) {
      checked = true;
      menuId = this.MENU_REMOVE_ID;
    }
    browser.contextMenus.create({
      id: menuId,
      title: browser.i18n.getMessage("alwaysOpenSiteInContainer"),
      checked,
      type: "checkbox",
      contexts: ["all"],
    });

    browser.contextMenus.create({
      id: this.MENU_SEPARATOR_ID,
      type: "separator",
      contexts: ["all"],
    });

    browser.contextMenus.create({
      id: this.MENU_HIDE_ID,
      title: browser.i18n.getMessage("hideThisContainer"),
      contexts: ["all"],
    });

    browser.contextMenus.create({
      id: this.MENU_MOVE_ID,
      title: browser.i18n.getMessage("moveTabsToANewWindow"),
      contexts: ["all"],
    });
  },

  encodeURLProperty(url) {
    return encodeURIComponent(url).replace(/[!'()*]/g, (c) => {
      const charCode = c.charCodeAt(0).toString(16);
      return `%${charCode}`;
    });
  },

  /**
   * @param {string} url
   * @param {number} index
   * @param {boolean} active
   * @param {number} [openerTabId]
   * @param {number} [groupId]
   * @returns {void}
   */
  reloadPageInDefaultContainer(url, index, active, openerTabId, groupId, windowId) {
    // To create a new tab in the default container, it is easiest just to omit the
    // cookieStoreId entirely.
    //
    // Unfortunately, if you create a new tab WITHOUT a cookieStoreId but WITH an openerTabId,
    // then the new tab automatically inherits the opener tab's cookieStoreId.
    // I.e. it opens in the wrong container!
    //
    // So we have to explicitly pass in a cookieStoreId when creating the tab, since we
    // are specifying the openerTabId. There doesn't seem to be any way
    // to look up the default container's cookieStoreId programatically, so sadly
    // we have to hardcode it here as "firefox-default". This is potentially
    // not cross-browser compatible.
    //
    // Note that we could have just omitted BOTH cookieStoreId and openerTabId. But the
    // drawback then is that if the user later closes the newly-created tab, the browser
    // does not automatically return to the original opener tab. To get this desired behaviour,
    // we MUST specify the openerTabId when creating the new tab.
    const cookieStoreId = "firefox-default";
    return this.createTabWrapper(url, cookieStoreId, index, active, openerTabId, groupId, windowId);
  },


  /**
   * Wraps around `browser.tabs.create` and `browser.tabs.group` to create a
   * tab and ensure that it ends up in the requested tab group, if applicable.
   *
   * @param {string} url
   * @param {string} cookieStoreId
   * @param {number} index
   * @param {boolean} active
   * @param {number} openerTabId
   * @param {number} [groupId] Tab group ID
   * @returns {Promise<Tab>}
   */
  async createTabWrapper(url, cookieStoreId, index, active, openerTabId, groupId, windowId) {
    // In the navigating tab's own window: `index` is a position in that
    // window, and without it Firefox uses the last-focused window instead.
    const props = { url, cookieStoreId, index, active, openerTabId };
    if (typeof windowId === "number" && windowId >= 0) props.windowId = windowId;

    let newTab;
    try {
      newTab = await browser.tabs.create(props);
    } catch (e) {
      // Firefox rejects an opener in another window. The opener only decides
      // which tab gets focus when this one closes, so drop it rather than
      // lose the navigation.
      if (!openerTabId) throw e;
      delete props.openerTabId;
      newTab = await browser.tabs.create(props);
    }

    if (groupId >= 0 && typeof browser.tabs.group === "function") {
      // If the original tab was in a tab group, make sure that the reopened tab
      // stays in the same tab group.
      try {
        await browser.tabs.group({ groupId, tabIds: newTab.id });
      } catch {
        // ignore
      }
    }

    return newTab;
  },

  /**
   * @param {string} url
   * @param {string} currentUserContextId
   * @param {string} userContextId
   * @param {number} index
   * @param {boolean} active
   * @param {boolean} [neverAsk=false]
   * @param {number} [openerTabId=null]
   * @param {number} [groupId]
   * @returns {Promise<Tab>}
   */
  reloadPageInContainer(url, currentUserContextId, userContextId, index, active, neverAsk = false, openerTabId = null, groupId = undefined, windowId = undefined) {
    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    const loadPage = browser.runtime.getURL("confirm-page.html");
    // False represents assignment is not permitted
    // If the user has explicitly checked "Never Ask Again" on the warning page we will send them straight there
    if (neverAsk) {
      return this.createTabWrapper(url, cookieStoreId, index, active, openerTabId, groupId, windowId);
    } else {
      let confirmUrl = `${loadPage}?url=${this.encodeURLProperty(url)}&cookieStoreId=${this.encodeURLProperty(cookieStoreId)}`;
      let currentCookieStoreId;
      if (currentUserContextId) {
        currentCookieStoreId = backgroundLogic.cookieStoreId(currentUserContextId);
        confirmUrl += `&currentCookieStoreId=${this.encodeURLProperty(currentCookieStoreId)}`;
      }
      return this.createTabWrapper(
        confirmUrl,
        currentCookieStoreId,
        index,
        active,
        openerTabId,
        groupId,
        windowId
      );
    }
  },

  async initBookmarksMenu() {
    browser.contextMenus.create({
      id: this.OPEN_IN_CONTAINER,
      title: browser.i18n.getMessage("openBookmarkInContainerTab"),
      contexts: ["bookmark"],
    });

    const identities = await browser.contextualIdentities.query({});
    for (const identity of identities) {
      browser.contextMenus.create({
        parentId: this.OPEN_IN_CONTAINER,
        id: identity.cookieStoreId,
        title: identity.name,
        icons: { "16": `img/usercontext.svg#${identity.icon}` }
      });
    }
  },

  async removeBookmarksMenu() {
    this.removeMenuItem(this.OPEN_IN_CONTAINER);
    const identities = await browser.contextualIdentities.query({});
    for (const identity of identities) {
      this.removeMenuItem(identity.cookieStoreId);
    }
  },

  removeMenuItem(menuItemId) {
    // Callers do not check whether the menu exists before attempting to remove
    // it. contextMenus.remove rejects when the menu does not exist, so we need
    // to catch and swallow the error to avoid logspam.
    browser.contextMenus.remove(menuItemId).catch(() => {});
  }
};

assignManager.init();
