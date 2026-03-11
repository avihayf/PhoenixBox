/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_TAB = "about:newtab";

const FIREFOX_DEFAULT_ICONS = new Set([
  "fingerprint", "briefcase", "dollar", "cart", "circle",
  "gift", "vacation", "food", "fruit", "pet", "tree", "chill"
]);

const backgroundLogic = {
  NEW_TAB_PAGES: new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
  ]),
  NUMBER_OF_KEYBOARD_SHORTCUTS: 10,
  unhideQueue: [],
  init() {

    browser.commands.onCommand.addListener(function (command) {
      if (command === "sort_tabs") {
        backgroundLogic.sortTabs();
        return;
      }

      for (let i=0; i < backgroundLogic.NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
        const key = "open_container_" + i;
        const cookieStoreId = identityState.keyboardShortcut[key];
        if (command === key) {
          if (cookieStoreId === "none") return;
          browser.tabs.create({cookieStoreId});
        }
      }
    });

    browser.permissions.onAdded.addListener(permissions => this.resetPermissions(permissions));
    browser.permissions.onRemoved.addListener(permissions => this.resetPermissions(permissions));

    browser.runtime.onInstalled.addListener(() => {
      this.updateTranslationInManifest();
      this._normalizeSecurityProfiles().catch(() => {});
      this._initializeUserAgentCache();
    });
    browser.runtime.onStartup.addListener(() => {
      this.updateTranslationInManifest();
      this._normalizeSecurityProfiles().catch(() => {});
      this._initializeUserAgentCache();
    });
  },

  /**
   * Initialize User-Agent cache on extension startup.
   * Fetches fresh data from CDN if cache is expired or doesn't exist.
   */
  async _initializeUserAgentCache() {
    try {
      const stored = await browser.storage.local.get({
        globalUserAgentEnabled: false,
        globalUserAgent: "",
        containerUserAgents: {},
      });
      const hasContainerUserAgents =
        stored.containerUserAgents &&
        typeof stored.containerUserAgents === "object" &&
        Object.keys(stored.containerUserAgents).length > 0;
      const shouldWarmCache =
        !!stored.globalUserAgentEnabled ||
        !!stored.globalUserAgent ||
        hasContainerUserAgents;
      if (!shouldWarmCache) {
        return;
      }
      const isValid = await userAgentFetcher.isCacheValid();
      if (!isValid) {
        // Cache is expired or doesn't exist, fetch from CDN
        await userAgentFetcher.getUserAgents(false);
      }
    } catch (error) {
      LOG.error("Failed to initialize User-Agent cache:", error);
      // Don't block extension startup on cache failure
    }
  },

  /**
   * Single idempotent pass that normalizes all container identities.
   *
   * Combines what was previously four separate passes:
   * 1. One-time migration of default names (Personal→Attacker, etc.)
   * 2. Enforcement of security-profile names on default container IDs 1-4
   * 3. Icon normalization (custom icons → fingerprint for Firefox URL bar)
   * 4. Preservation of custom icons in storage overrides for the popup UI
   *
   * Queries contextualIdentities once and computes all needed updates in a
   * single loop to avoid redundant API calls.
   */
  async _normalizeSecurityProfiles() {
    const MIGRATION_KEY = "securityDefaultContainerNamesMigrated";
    const PREFIX = "firefox-container-";

    const SECURITY_NAMES = {
      1: "Attacker",
      2: "Victim",
      3: "Admin",
      4: "Member",
    };

    const LEGACY_RENAME = {
      "Personal": "Attacker",
      "Work": "Victim",
      "Banking": "Admin",
      "Shopping": "Member",
    };

    try {
      const stored = await browser.storage.local.get({
        [MIGRATION_KEY]: false,
        containerDisplayIconOverrides: {},
      });
      const migrated = !!stored[MIGRATION_KEY];
      const overrides =
        stored.containerDisplayIconOverrides && typeof stored.containerDisplayIconOverrides === "object"
          ? stored.containerDisplayIconOverrides
          : {};

      const identities = await browser.contextualIdentities.query({});
      let overridesChanged = false;

      for (const identity of identities) {
        if (!identity.cookieStoreId || !identity.cookieStoreId.startsWith(PREFIX)) continue;

        const idNum = Number(identity.cookieStoreId.slice(PREFIX.length));
        const isDefault = Number.isFinite(idNum) && idNum >= 1 && idNum <= 4;

        let desiredName = null;
        let desiredIcon = null;

        if (isDefault) {
          desiredName = SECURITY_NAMES[idNum];

          if (!migrated && LEGACY_RENAME[identity.name]) {
            desiredName = LEGACY_RENAME[identity.name];
          }

          desiredIcon = idNum === 1 ? "circle" : identity.icon;
          if (desiredIcon && !FIREFOX_DEFAULT_ICONS.has(desiredIcon)) {
            desiredIcon = "fingerprint";
          }
        } else {
          if (!migrated && LEGACY_RENAME[identity.name]) {
            desiredName = LEGACY_RENAME[identity.name];
          }
        }

        const isCustomIcon = !FIREFOX_DEFAULT_ICONS.has(identity.icon);
        const targetIcon = desiredIcon || (isCustomIcon ? "fingerprint" : identity.icon);

        if (isCustomIcon && identity.icon && identity.icon !== "fingerprint" && !overrides[identity.cookieStoreId]) {
          overrides[identity.cookieStoreId] = identity.icon;
          overridesChanged = true;
        }

        const nameNeedsUpdate = desiredName && identity.name !== desiredName;
        const iconNeedsUpdate = targetIcon && identity.icon !== targetIcon;

        if (nameNeedsUpdate || iconNeedsUpdate) {
          const patch = {};
          if (nameNeedsUpdate) patch.name = desiredName;
          if (iconNeedsUpdate) patch.icon = targetIcon;
          try {
            await browser.contextualIdentities.update(identity.cookieStoreId, patch);
          } catch {
            // ignore per-identity failures
          }
        }
      }

      const storageUpdates = {};
      if (!migrated) storageUpdates[MIGRATION_KEY] = true;
      if (overridesChanged) storageUpdates.containerDisplayIconOverrides = overrides;
      if (Object.keys(storageUpdates).length) {
        await browser.storage.local.set(storageUpdates);
      }
    } catch {
      // ignore failures (e.g. contextualIdentities unavailable)
    }
  },

  updateTranslationInManifest() {
    for (let index = 0; index < 10; index++) {
      const ajustedIndex = index + 1; // We want to start from 1 instead of 0 in the UI.
      browser.commands.update({
        name: `open_container_${index}`,
        description: browser.i18n.getMessage("containerShortcut", `${ajustedIndex}`)
      });
    }
  },

  async resetPermissions(permissions) {
    for (const permission of permissions.permissions) {
      switch (permission) {
      case "bookmarks":
        assignManager.resetBookmarksMenuItem();
        break;

      case "nativeMessaging":
        {
          const hasNativeMessagingPermission = await browser.permissions.contains({
            permissions: ["nativeMessaging"]
          });
          const plan = PhoenixBoxReviewHelpers.getNativeMessagingPermissionPlan(
            hasNativeMessagingPermission
          );
          if (plan.clearVpnProxies) {
            await MozillaVPN_Background.removeMozillaVpnProxies();
          }
          if (plan.reloadExtension) {
            await browser.runtime.reload();
          }
        }
        break;

      case "proxy":
        // Keep global proxy state consistent with the current permission.
        // This handler is called for both onAdded and onRemoved.
        try {
          const hasProxyPermission = await browser.permissions.contains({ permissions: ["proxy"] });
          if (hasProxyPermission) {
            assignManager.maybeAddProxyListeners();
            // RESCUE STATE: Only auto-enable if the proxy was not explicitly
            // disabled by the user.  When the user toggles the proxy OFF the
            // popup stores globalProxyUserDisabled = true.  We check that flag
            // here so we don't unexpectedly re-enable the proxy after a
            // permission revoke/re-grant cycle.
            const stored = await browser.storage.local.get([
              "globalProxyUrl",
              "globalProxyParsed",
              "globalProxyUserDisabled",
            ]);
            if (stored.globalProxyUrl && stored.globalProxyParsed && !stored.globalProxyUserDisabled) {
              await browser.storage.local.set({ globalProxyEnabled: true });
            }
          } else {
            // If the user revoked proxy permission, make sure global proxy is OFF
            // so the UI and background don't claim it's enabled when it can't work.
            assignManager.resetProxyListener();
            await browser.storage.local.set({ globalProxyEnabled: false });
          }
        } catch (e) {
          LOG.error("Error in resetPermissions for proxy:", e);
        }
        break;
      }
    }
  },

  async getExtensionInfo() {
    const manifestPath = browser.runtime.getURL("manifest.json");
    const response = await fetch(manifestPath);
    const extensionInfo = await response.json();
    return extensionInfo;
  },

  // Remove container data (cookies, localStorage and cache)
  async deleteContainerDataOnly(userContextId) {
    await browser.browsingData.removeCookies({
      cookieStoreId: this.cookieStoreId(userContextId)
    });

    await browser.browsingData.removeLocalStorage({
      cookieStoreId: this.cookieStoreId(userContextId)
    });

    return {done: true, userContextId};
  },

  getUserContextIdFromCookieStoreId(cookieStoreId) {
    if (!cookieStoreId) {
      return false;
    }
    const container = cookieStoreId.replace("firefox-container-", "");
    if (container !== cookieStoreId) {
      return container;
    }
    return false;
  },

  async deleteContainer(userContextId, removed = false) {
    await this._closeTabs(userContextId);

    if (!removed) {
      await browser.contextualIdentities.remove(this.cookieStoreId(userContextId));
    }

    assignManager.deleteContainer(userContextId);

    // Now remove the identity->proxy association in proxifiedContainers also
    proxifiedContainers.delete(this.cookieStoreId(userContextId));

    return {done: true, userContextId};
  },

  async createOrUpdateContainer(options) {
    const desiredIcon = options?.params?.icon;
    const isCustomIcon = desiredIcon && !FIREFOX_DEFAULT_ICONS.has(desiredIcon);
    const params = {
      ...options.params,
      icon: isCustomIcon ? "fingerprint" : desiredIcon,
    };
    let identity;
    if (options.userContextId !== "new") {
      identity = await browser.contextualIdentities.update(
        this.cookieStoreId(options.userContextId),
        params
      );
    } else {
      identity = await browser.contextualIdentities.create(params);
    }

    if (identity?.cookieStoreId && desiredIcon) {
      try {
        const stored = await browser.storage.local.get({ containerDisplayIconOverrides: {} });
        const overrides =
          stored.containerDisplayIconOverrides && typeof stored.containerDisplayIconOverrides === "object"
            ? stored.containerDisplayIconOverrides
            : {};
        overrides[identity.cookieStoreId] = desiredIcon;
        await browser.storage.local.set({ containerDisplayIconOverrides: overrides });
      } catch {
        // ignore
      }
    }

    return identity;
  },

  async openNewTab(options) {
    let url = options.url || undefined;
    const userContextId = ("userContextId" in options) ? options.userContextId : 0;
    const active = ("nofocus" in options) ? options.nofocus : true;
    const discarded = ("noload" in options) ? options.noload : false;

    const cookieStoreId = backgroundLogic.cookieStoreId(userContextId);
    // Autofocus url bar will happen in 54: https://bugzilla.mozilla.org/show_bug.cgi?id=1295072

    // We can't open new tab pages, so open a blank tab. Used in tab un-hide
    if (this.NEW_TAB_PAGES.has(url)) {
      url = undefined;
    }

    if (!this.isPermissibleURL(url)) {
      return;
    }

    return browser.tabs.create({
      url,
      active,
      discarded,
      pinned: options.pinned || false,
      cookieStoreId
    });
  },

  isPermissibleURL(url) {
    try {
      const protocol = new URL(url).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  },

  checkArgs(requiredArguments, options, methodName) {
    for (const argument of requiredArguments) {
      if (!(argument in options)) {
        throw new Error(`${methodName} must be called with ${argument} argument.`);
      }
    }
  },

  async getTabs(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "getTabs");
    const { cookieStoreId, windowId } = options;

    const list = [];
    const tabs = await browser.tabs.query({
      cookieStoreId,
      windowId
    });
    tabs.forEach((tab) => {
      list.push(identityState._createTabObject(tab));
    });

    const containerState = await identityState.storageArea.get(cookieStoreId) || { hiddenTabs: [] };
    return list.concat(containerState.hiddenTabs || []);
  },

  async unhideContainer(cookieStoreId, alreadyShowingUrl) {
    if (!this.unhideQueue.includes(cookieStoreId)) {
      this.unhideQueue.push(cookieStoreId);
      await this.showTabs({
        cookieStoreId,
        alreadyShowingUrl
      });
      this.unhideQueue.splice(this.unhideQueue.indexOf(cookieStoreId), 1);
    }
  },

  // https://github.com/mozilla/multi-account-containers/issues/847
  async addRemoveSiteIsolation(cookieStoreId, remove = false) {
    const containerState = await identityState.storageArea.get(cookieStoreId) || { hiddenTabs: [] };
    try {
      if ("isIsolated" in containerState || remove) {
        delete containerState.isIsolated;
      } else {
        containerState.isIsolated = "locked";
      }
      return await identityState.storageArea.set(cookieStoreId, containerState);
    } catch {
      // Container may have been removed between lookup and update.
    }
  },

  async moveTabsToWindow(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "moveTabsToWindow");
    const { cookieStoreId, windowId } = options;

    const list = await browser.tabs.query({
      cookieStoreId,
      windowId
    });

    const containerState = await identityState.storageArea.get(cookieStoreId);

    // Nothing to do
    if (list.length === 0 &&
        (containerState.hiddenTabs || []).length === 0) {
      return;
    }
    let newWindowObj;
    let hiddenDefaultTabToClose;
    if (list.length) {
      newWindowObj = await browser.windows.create();

      // Pin the default tab in the new window so existing pinned tabs can be moved after it.
      // From the docs (https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/tabs/move):
      //   Note that you can't move pinned tabs to a position after any unpinned tabs in a window, or move any unpinned tabs to a position before any pinned tabs.
      await browser.tabs.update(newWindowObj.tabs[0].id, { pinned: true });

      browser.tabs.move(list.map((tab) => tab.id), {
        windowId: newWindowObj.id,
        index: -1
      });
    } else {
      // As we get a blank tab here we will need to await the tabs creation
      newWindowObj = await browser.windows.create({
      });
      hiddenDefaultTabToClose = true;
    }

    const showHiddenPromises = [];

    // Let's show the hidden tabs.
    if (!this.unhideQueue.includes(cookieStoreId)) {
      this.unhideQueue.push(cookieStoreId);
      for (let object of (containerState.hiddenTabs || [])) { // eslint-disable-line prefer-const
        showHiddenPromises.push(browser.tabs.create({
          url: object.url || DEFAULT_TAB,
          windowId: newWindowObj.id,
          cookieStoreId
        }));
      }
    }

    if (hiddenDefaultTabToClose) {
      // Lets wait for hidden tabs to show before closing the others
      await Promise.all(showHiddenPromises);
    }

    containerState.hiddenTabs = [];

    // Let's close all the normal tab in the new window. In theory it
    // should be only the first tab, but maybe there are addons doing
    // crazy stuff.
    const tabs = await browser.tabs.query({windowId: newWindowObj.id});
    for (let tab of tabs) { // eslint-disable-line prefer-const
      if (tab.cookieStoreId !== cookieStoreId) {
        browser.tabs.remove(tab.id);
      }
    }
    const rv = await identityState.storageArea.set(cookieStoreId, containerState);
    this.unhideQueue.splice(this.unhideQueue.indexOf(cookieStoreId), 1);
    return rv;
  },

  async _closeTabs(userContextId, windowId = false) {
    const cookieStoreId = this.cookieStoreId(userContextId);
    let tabs;
    /* if we have no windowId we are going to close all this container (used for deleting) */
    if (windowId !== false) {
      tabs = await browser.tabs.query({
        cookieStoreId,
        windowId
      });
    } else {
      tabs = await browser.tabs.query({
        cookieStoreId
      });
    }
    const tabIds = tabs.map((tab) => tab.id);
    return browser.tabs.remove(tabIds);
  },

  async queryIdentitiesState(windowId) {
    const identities = await browser.contextualIdentities.query({});
    const identitiesOutput = {};
    const identitiesPromise = identities.map(async (identity) => {
      const { cookieStoreId } = identity;
      const containerState = await identityState.storageArea.get(cookieStoreId) || { hiddenTabs: [] };
      const openTabs = await browser.tabs.query({
        cookieStoreId,
        windowId
      });
      identitiesOutput[cookieStoreId] = {
        hasHiddenTabs: !!(containerState.hiddenTabs || []).length,
        hasOpenTabs: !!openTabs.length,
        numberOfHiddenTabs: (containerState.hiddenTabs || []).length,
        numberOfOpenTabs: openTabs.length,
        isIsolated: !!containerState.isIsolated
      };
      return;
    });
    await Promise.all(identitiesPromise);
    return identitiesOutput;
  },

  async sortTabs() {
    const windows = await browser.windows.getAll();
    for (let windowObj of windows) { // eslint-disable-line prefer-const
      // First the pinned tabs, then the normal ones.
      await this._sortTabsInternal(windowObj, true);
      await this._sortTabsInternal(windowObj, false);
    }
  },

  async _sortTabsInternal(windowObj, pinnedTabs) {
    const tabs = await browser.tabs.query({windowId: windowObj.id});
    let pos = 0;

    // Let's collect UCIs/tabs for this window.
    /** @type {Map<string, {order: string, tabs: Tab[]}>} */
    const map = new Map;

    const lastTab = tabs.at(-1);
    /** @type {boolean} */
    let lastTabIsInTabGroup = !!lastTab && lastTab.groupId >= 0;

    for (const tab of tabs) {
      if (pinnedTabs && !tab.pinned) {
        // We don't have, or we already handled all the pinned tabs.
        break;
      }

      if (!pinnedTabs && tab.pinned) {
        // pinned tabs must be consider as taken positions.
        ++pos;
        continue;
      }

      if (tab.groupId >= 0) {
        // Skip over tabs in tab groups until it's possible to handle them better.
        continue;
      }

      if (!map.has(tab.cookieStoreId)) {
        const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(tab.cookieStoreId);
        map.set(tab.cookieStoreId, { order: userContextId, tabs: [] });
      }
      map.get(tab.cookieStoreId).tabs.push(tab);
    }

    const containerOrderStorage = await browser.storage.local.get([CONTAINER_ORDER_STORAGE_KEY]);
    const containerOrder =
      containerOrderStorage && containerOrderStorage[CONTAINER_ORDER_STORAGE_KEY];

    if (containerOrder) {
      map.forEach((obj, key) => {
        obj.order = (key in containerOrder) ? containerOrder[key] : -1;
      });
    }

    // Let's sort the map.
    const sortMap = new Map([...map.entries()].sort((a, b) => a[1].order > b[1].order));

    // Let's move tabs.
    for (const { tabs } of sortMap.values()) {
      for (const tab of tabs) {
        ++pos;
        browser.tabs.move(tab.id, {
          windowId: windowObj.id,
          index: pinnedTabs ? pos : -1
        });
        // Pinned tabs are never grouped and always inserted in the front.
        if (!pinnedTabs && lastTabIsInTabGroup && typeof browser.tabs.ungroup === "function") {
          // If the last item in the tab strip is a grouped tab, moving a tab
          // to its position will also add it to the tab group. Since this code
          // is only sorting ungrouped tabs, this forcibly ungroups the first
          // tab to be moved. All subsequent iterations will only be moving
          // ungrouped tabs to the position of other ungrouped tabs.
          lastTabIsInTabGroup = false;
          try {
            await browser.tabs.ungroup(tab.id);
          } catch {
            // ignore
          }
        }
      }
    }
  },

  async hideTabs(options) {
    const requiredArguments = ["cookieStoreId", "windowId"];
    this.checkArgs(requiredArguments, options, "hideTabs");
    const { cookieStoreId, windowId } = options;

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(cookieStoreId);

    const containerState = await identityState.storeHidden(cookieStoreId, windowId);
    await this._closeTabs(userContextId, windowId);
    return containerState;
  },

  async showTabs(options) {
    if (!("cookieStoreId" in options)) {
      return Promise.reject("showTabs must be called with cookieStoreId argument.");
    }

    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(options.cookieStoreId);
    const promises = [];

    const containerState = await identityState.storageArea.get(options.cookieStoreId) || { hiddenTabs: [] };

    for (let object of (containerState.hiddenTabs || [])) { // eslint-disable-line prefer-const
      // do not show already opened url
      const noload = !object.pinned;
      if (object.url !== options.alreadyShowingUrl) {
        promises.push(this.openNewTab({
          userContextId: userContextId,
          url: object.url,
          nofocus: options.nofocus || false,
          noload: noload,
          pinned: object.pinned,
        }));
      }
    }

    containerState.hiddenTabs = [];

    await Promise.all(promises);
    return identityState.storageArea.set(options.cookieStoreId, containerState);
  },

  cookieStoreId(userContextId) {
    if(userContextId === 0) return "firefox-default";
    return `firefox-container-${userContextId}`;
  }
};


backgroundLogic.init();
