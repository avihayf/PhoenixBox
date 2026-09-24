/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_TAB = "about:newtab";


const backgroundLogic = {
  NEW_TAB_PAGES: new Set([
    "about:startpage",
    "about:newtab",
    "about:home",
    "about:blank"
  ]),
  NUMBER_OF_KEYBOARD_SHORTCUTS: 10,
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
      this._migrateHighlighterHeadersKey().catch(() => {});
    });
    browser.runtime.onStartup.addListener(() => {
      this.updateTranslationInManifest();
      this._normalizeSecurityProfiles().catch(() => {});
      this._initializeUserAgentCache();
      this._migrateHighlighterHeadersKey().catch(() => {});
    });
  },

  /**
   * Move the Highlighter toggle onto its current key.
   *
   * It was named for the colour header back when that was all it added; it now
   * also arms the container-name header. Readers fall back to the legacy key on
   * their own, so this is only tidying — losing the race with a reader cannot
   * lose the setting.
   */
  async _migrateHighlighterHeadersKey() {
    const CURRENT = PhoenixBoxRequestHeaderHelpers.HIGHLIGHTER_HEADERS_KEY;
    const LEGACY = PhoenixBoxRequestHeaderHelpers.LEGACY_HIGHLIGHTER_HEADERS_KEY;

    // Superseded by highlighterJarAckVersion. It never shipped in a release,
    // so there is no acknowledgement in it worth carrying over.
    await browser.storage.local.remove("highlighterJarUpdateNoticePending");

    const stored = await browser.storage.local.get([CURRENT, LEGACY]);
    if (!(LEGACY in stored)) {
      return;
    }
    // Never clobber a value already written under the current key.
    if (!(CURRENT in stored)) {
      await browser.storage.local.set({ [CURRENT]: !!stored[LEGACY] });
    }
    await browser.storage.local.remove(LEGACY);
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
   * Normalize container identities; the single owner of profile defaults.
   *
   * The decisions live in PhoenixBoxReviewHelpers.planProfileNormalization:
   * security-profile names, colours and icons are applied once, by this
   * migration, and afterwards the user's own choices stand. Custom icons are
   * mapped to "fingerprint" for Firefox every time, kept as display overrides.
   */
  async _normalizeSecurityProfiles() {
    const MIGRATION_KEY = "securityDefaultContainerNamesMigrated";
    try {
      const stored = await browser.storage.local.get({
        [MIGRATION_KEY]: false,
        containerDisplayIconOverrides: {},
      });
      const identities = await browser.contextualIdentities.query({});
      const plan = PhoenixBoxReviewHelpers.planProfileNormalization(
        identities, stored.containerDisplayIconOverrides, !!stored[MIGRATION_KEY]
      );

      // Overrides first, so the popup never shows a fingerprint where a
      // security icon belongs while the identity updates are in flight.
      const storageUpdates = {};
      if (!stored[MIGRATION_KEY]) storageUpdates[MIGRATION_KEY] = true;
      if (plan.overridesChanged) storageUpdates.containerDisplayIconOverrides = plan.overrides;
      if (Object.keys(storageUpdates).length) {
        await browser.storage.local.set(storageUpdates);
      }

      for (const { cookieStoreId, patch } of plan.updates) {
        try {
          await browser.contextualIdentities.update(cookieStoreId, patch);
        } catch {
          // ignore per-identity failures
        }
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

  // Remove container data (cookies, localStorage and cache)
  // Remove a container's site data. Cookies and localStorage are required;
  // IndexedDB and service workers are cleared when this Firefox supports
  // container-scoped removal for them. The HTTP cache is shared across
  // containers and cannot be cleared per container.
  async deleteContainerDataOnly(userContextId) {
    const options = { cookieStoreId: this.cookieStoreId(userContextId) };
    await browser.browsingData.removeCookies(options);
    await browser.browsingData.removeLocalStorage(options);
    for (const optional of ["removeIndexedDB", "removeServiceWorkers"]) {
      if (typeof browser.browsingData[optional] !== "function") continue;
      try {
        await browser.browsingData[optional](options);
      } catch (e) {
        LOG.warn(`deleteContainerDataOnly: ${optional} not supported per container`, e);
      }
    }
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

    const cookieStoreId = this.cookieStoreId(userContextId);
    // Awaited so "done" means done: callers refresh their view straight after.
    await assignManager.deleteContainer(userContextId);
    await proxifiedContainers.delete(cookieStoreId);
    await this._cleanupContainerSettings(cookieStoreId);

    return {done: true, userContextId};
  },

  /**
   * Drop every setting that still names a deleted container.
   *
   * The single owner of this cleanup: every deletion path — the popup, Firefox
   * Settings, sync — ends in contextualIdentities.onRemoved, which lands here.
   * Previously only the popup's quick-delete cleaned up the promoted-proxy
   * list, and a stale entry there silently sends all traffic DIRECT.
   */
  async _cleanupContainerSettings(cookieStoreId) {
    const shortcutKeys = [];
    for (let i = 0; i < this.NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
      shortcutKeys.push(`open_container_${i}`);
    }
    const stored = await browser.storage.local.get([
      "promotedProxyContainerIds",
      "containerUserAgents",
      "containerDisplayIconOverrides",
      ...shortcutKeys,
    ]);
    const patch = PhoenixBoxReviewHelpers.planContainerSettingsCleanup(stored, cookieStoreId);
    if (!Object.keys(patch).length) return;

    await browser.storage.local.set(patch);
    for (const key of shortcutKeys) {
      if (key in patch) identityState.keyboardShortcut[key] = patch[key];
    }
  },

  async createOrUpdateContainer(options) {
    // The icon the user picked. Firefox gets the nearest icon it accepts; the
    // real choice is kept as a display override below — in one place, so the
    // popup no longer writes a second, different override after this one.
    const desiredIcon = options?.params?.icon;
    const params = {
      ...options.params,
      icon: desiredIcon ? PhoenixBoxReviewHelpers.firefoxIconFor(desiredIcon) : desiredIcon,
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
    // `active` defaults to true so a plain openNewTab() call focuses the tab.
    // Un-hide passes active:false so restoring a container never steals focus.
    const active = ("active" in options) ? !!options.active : true;
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

    const createProperties = PhoenixBoxReviewHelpers.buildHiddenTabCreateProperties({
      url,
      active,
      discarded,
      pinned: options.pinned || false,
      cookieStoreId,
      title: options.title,
    });

    return browser.tabs.create(createProperties);
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
      // Reject null/undefined, not just a missing key. A null windowId used to
      // pass this check and then reach tabs.query, where it matches nothing —
      // so the action silently did nothing instead of failing loudly.
      if (!(argument in options) || options[argument] === null || options[argument] === undefined) {
        throw new Error(`${methodName} must be called with ${argument} argument.`);
      }
    }
  },

  // Concurrent un-hides are safe without a queue: showTabs claims the hidden
  // list atomically, so a second caller finds it empty.
  unhideContainer(cookieStoreId, alreadyShowingUrl) {
    return this.showTabs({ cookieStoreId, alreadyShowingUrl });
  },

  // https://github.com/mozilla/multi-account-containers/issues/847
  async addRemoveSiteIsolation(cookieStoreId, remove = false) {
    try {
      return await identityState.withContainerState(cookieStoreId, (state) => {
        // Container may have been removed between lookup and update.
        if (!state) return;
        if ("isIsolated" in state || remove) {
          delete state.isIsolated;
        } else {
          state.isIsolated = "locked";
        }
      });
    } catch {
      // Same: nothing to toggle on a container that has gone.
    }
  },

  /**
   * Give a container its own window: gather its tabs — including hidden ones —
   * into a freshly created window.
   *
   * Container-scoped like hideTabs, so a container whose tabs are spread over
   * several windows ends up consolidated rather than partially moved.
   */
  async moveTabsToWindow(options) {
    this.checkArgs(["cookieStoreId"], options, "moveTabsToWindow");
    const { cookieStoreId } = options;

    const list = await browser.tabs.query({ cookieStoreId });
    // Claimed up front and atomically: this call now owns reopening them.
    const hiddenTabs = await identityState.claimHiddenTabs(cookieStoreId);

    // Nothing to do
    if (list.length === 0 && hiddenTabs.length === 0) {
      return;
    }

    const newWindowObj = await browser.windows.create();
    const placeholderIds = (newWindowObj.tabs || []).map((tab) => tab.id);

    if (list.length) {
      // Pin the default tab so existing pinned tabs can be moved after it:
      // pinned tabs cannot sit after unpinned ones, or unpinned before pinned.
      if (placeholderIds.length) {
        await browser.tabs.update(placeholderIds[0], { pinned: true });
      }
      await browser.tabs.move(list.map((tab) => tab.id), {
        windowId: newWindowObj.id,
        index: -1
      });
    }

    const results = await Promise.allSettled(hiddenTabs.map((object) =>
      browser.tabs.create({
        url: object.url || DEFAULT_TAB,
        windowId: newWindowObj.id,
        cookieStoreId
      })
    ));
    // Any hidden tab that failed to reopen goes back on the list, not away.
    const failed = hiddenTabs.filter((_, i) => results[i].status === "rejected");
    await identityState.returnHiddenTabs(cookieStoreId, failed);

    // Close the window's own placeholder tab(s), and anything else an add-on
    // may have opened in it that is not this container's.
    const tabs = await browser.tabs.query({ windowId: newWindowObj.id });
    const strays = tabs
      .filter((tab) => placeholderIds.includes(tab.id) || tab.cookieStoreId !== cookieStoreId)
      .map((tab) => tab.id);
    if (strays.length && strays.length < tabs.length) {
      await browser.tabs.remove(strays);
    }
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

  /**
   * Open/hidden tab state per container.
   *
   * Counted across every window, to match hideTabs: these numbers drive the
   * popup's hide/show toggle, so a per-window count would offer "show" for a
   * container whose tabs are merely in another window.
   *
   * @param {number} [windowId] accepted for backwards compatibility; unused.
   */
  async queryIdentitiesState(windowId) { // eslint-disable-line no-unused-vars
    const identities = await browser.contextualIdentities.query({});
    const identitiesOutput = {};
    const identitiesPromise = identities.map(async (identity) => {
      const { cookieStoreId } = identity;
      const containerState = await identityState.storageArea.get(cookieStoreId) || { hiddenTabs: [] };
      const openTabs = await browser.tabs.query({ cookieStoreId });
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

    // Let's sort the map. `order` can be a container id string or a stored
    // ordering number, so compare numerically and fall back to a string
    // compare for anything non-numeric.
    const sortMap = new Map(
      [...map.entries()].sort(
        (a, b) => PhoenixBoxReviewHelpers.compareContainerOrder(a[1].order, b[1].order)
      )
    );

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

  /**
   * Hide a container: stash its tabs and close them, so the user is left with
   * only the other containers' tabs on screen.
   *
   * Scoped to the container, not to a window. Hiding is a container-level
   * action, so leaving that container's tabs open in a second window defeats
   * the point. Note that un-hide restores them into the focused window, since
   * the tabs API gives no way to reopen a tab in the window it came from.
   */
  async hideTabs(options) {
    this.checkArgs(["cookieStoreId"], options, "hideTabs");
    const { cookieStoreId } = options;

    // One query feeds both the stash and the close, so a tab opened midway
    // through can't be closed without having been recorded.
    const tabs = await browser.tabs.query({ cookieStoreId });
    const { toStore, toClose } =
      PhoenixBoxReviewHelpers.partitionTabsForHide(tabs, this.NEW_TAB_PAGES);

    const containerState = await identityState.storeHidden(cookieStoreId, toStore);
    // Nothing was recorded (the container vanished mid-way), so closing would
    // lose the tabs rather than hide them.
    if (!containerState) return containerState;

    const tabIds = toClose.map((tab) => tab.id);
    if (tabIds.length) {
      await browser.tabs.remove(tabIds);
    }
    return containerState;
  },

  async showTabs(options) {
    if (!("cookieStoreId" in options)) {
      return Promise.reject("showTabs must be called with cookieStoreId argument.");
    }
    const { cookieStoreId } = options;
    const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(cookieStoreId);

    // Claim first, open after: the state is never held while tabs are created,
    // and a hide that lands meanwhile records its own tabs untouched.
    const hiddenTabs = await identityState.claimHiddenTabs(cookieStoreId);
    // The tab that triggered an automatic un-hide is already showing its URL.
    const toOpen = hiddenTabs.filter((object) => object.url !== options.alreadyShowingUrl);

    const results = await Promise.allSettled(toOpen.map((object) =>
      this.openNewTab({
        userContextId,
        url: object.url,
        title: object.title,
        active: false,
        noload: !object.pinned,
        pinned: object.pinned,
      })
    ));
    // One failed create used to skip the state write entirely, so the next
    // un-hide reopened every tab a second time. Keep only the failures.
    const failed = toOpen.filter((_, i) => results[i].status === "rejected");
    await identityState.returnHiddenTabs(cookieStoreId, failed);
  },

  cookieStoreId(userContextId) {
    if(userContextId === 0) return "firefox-default";
    return `firefox-container-${userContextId}`;
  }
};

backgroundLogic.init();
