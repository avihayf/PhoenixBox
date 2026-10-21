/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const messageHandler = {
  // After the timer completes we assume it's a tab the user meant to keep open
  // We use this to catch redirected tabs that have just opened
  // If this were in platform we would change how the tab opens based on "new tab" link navigations such as ctrl+click
  LAST_CREATED_TAB_TIMER: 2000,

  init() {
    // Handles messages from webextension code
    browser.runtime.onMessage.addListener(async (m, sender) => {
      if (!PhoenixBoxReviewHelpers.isExtensionPageSender(
        sender, browser.runtime.id, browser.runtime.getURL(""))) {
        LOG.warn("Ignored a runtime message from outside the extension's pages", sender && sender.url);
        return undefined;
      }
      try {
        let response;
        let tab;

        switch (m.method) {
        case "getShortcuts":
          response = identityState.storageArea.loadKeyboardShortcuts();
          break;
        case "setShortcut":
          // Otherwise this is a write of any value to any storage key.
          if (!PhoenixBoxReviewHelpers.isValidShortcutAssignment(m.shortcut, m.cookieStoreId)) break;
          response = identityState.storageArea.setKeyboardShortcut(m.shortcut, m.cookieStoreId);
          break;
        case "resetSync":
          response = sync.resetSync();
          break;
        case "setGlobalProxyConfig":
          response = assignManager.setGlobalProxyConfig(m.proxy);
          break;
        case "clearGlobalProxyConfig":
          assignManager.clearGlobalProxyConfig();
          break;
        case "deleteContainer":
          response = backgroundLogic.deleteContainer(m.message.userContextId);
          break;
        case "deleteContainerDataOnly":
          response = backgroundLogic.deleteContainerDataOnly(m.message.userContextId);
          break;
        case "createOrUpdateContainer":
          response = backgroundLogic.createOrUpdateContainer(m.message);
          break;
        case "neverAsk":
          assignManager._neverAsk(m);
          break;
        case "addRemoveSiteIsolation":
          response = backgroundLogic.addRemoveSiteIsolation(m.cookieStoreId, !!m.remove);
          break;
        case "getAssignmentObjectByContainer":
          response = assignManager._getByContainer(m.message.userContextId);
          break;
        case "setOrRemoveAssignment":
          // m.tabId is used for where to place the in content message
          // m.url is the assignment to be removed/added
          response = assignManager._setOrRemoveAssignment(m.tabId, m.url, m.userContextId, m.value);
          break;
        case "resetCookiesForSite":
          response = assignManager._resetCookiesForSite(m.hostname, m.cookieStoreId);
          break;
        case "sortTabs":
          backgroundLogic.sortTabs();
          break;
        case "showTabs":
          response = backgroundLogic.unhideContainer(m.cookieStoreId);
          break;
        case "hideTabs":
          response = backgroundLogic.hideTabs({
            cookieStoreId: m.cookieStoreId
          });
          break;
        case "moveTabsToWindow":
          response = backgroundLogic.moveTabsToWindow({
            cookieStoreId: m.cookieStoreId
          });
          break;
        case "queryIdentitiesState":
          response = backgroundLogic.queryIdentitiesState(m.message.windowId);
          break;
        case "exemptContainerAssignment":
          response = assignManager._exemptTab(m);
          break;
        case "reloadInContainer":
          if (!backgroundLogic.isPermissibleURL(m.url)) break;
          response = assignManager.reloadPageInContainer(
            m.url,
            m.currentUserContextId,
            m.newUserContextId,
            m.tabIndex,
            m.active,
            true,
            null,
            m.groupId
          );
          break;
        case "assignAndReloadInContainer":
          if (!backgroundLogic.isPermissibleURL(m.url)) break;
          // Save the assignment before opening the tab. The other way round,
          // the new tab loaded the site while any old assignment was still in
          // force, got bounced back to the old container, and — being the
          // "last created tab" — was closed, so the new assignment was never
          // written.
          await assignManager._setOrRemoveAssignment(null, m.url, m.newUserContextId, m.value);
          tab = await assignManager.reloadPageInContainer(
            m.url,
            m.currentUserContextId,
            m.newUserContextId,
            m.tabIndex,
            m.active,
            true,
            null,
            m.groupId
          );
          if (tab && tab.id) {
            assignManager._announceToTab(tab.id,
              "Successfully assigned site to always open in this container");
          }
          response = tab;
          break;

        case "MozillaVPN_attemptPort":
          MozillaVPN_Background.maybeInitPort();
          break;
        case "MozillaVPN_queryServers":
          MozillaVPN_Background.postToApp("servers");
          break;
        case "MozillaVPN_queryStatus":
          response = MozillaVPN_Background.postToApp("status");
          break;
        case "MozillaVPN_getConnectionStatus":
          response = MozillaVPN_Background.getConnectionStatus();
          break;
        case "MozillaVPN_getInstallationStatus":
          response = MozillaVPN_Background.getInstallationStatus();
          break;
        case "extractEndpoints": {
          const tabId = m.tabId;
          if (!tabId) break;
          // Re-fetch URL from the tabs API rather than trusting the message payload.
          let pageUrl = "";
          try {
            const tab = await browser.tabs.get(tabId);
            pageUrl = tab?.url || "";
          } catch {
            // Tab may have closed between click and handler; pageUrl stays empty.
          }
          let endpoints = [];
          // A failed scan (a page the content script cannot run in, such as
          // about: pages or addons.mozilla.org) is reported as such rather
          // than as "0 endpoints", which read as "this page has none".
          let scanFailed = false;
          try {
            const reply = await browser.tabs.sendMessage(tabId, { method: "scanEndpoints" });
            endpoints = Array.isArray(reply) ? reply.filter((e) => typeof e === "string") : [];
          } catch (scanErr) {
            scanFailed = true;
            LOG.error("[PhoenixBox] extractEndpoints: scan failed:", scanErr);
          }
          // Bounded: a huge bundled page can yield tens of thousands of paths.
          const MAX_ENDPOINTS = 5000;
          const truncated = endpoints.length > MAX_ENDPOINTS;
          if (truncated) endpoints = endpoints.slice(0, MAX_ENDPOINTS);
          // Key each scan separately so two scans in flight can't overwrite
          // each other, and so reloading a results tab still finds its data.
          const scanId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
          const scanKey = `endpointScanResults@@_${scanId}`;
          const scannedAt = Date.now();
          await browser.storage.local.set({
            [scanKey]: {
              endpoints,
              pageUrl,
              scannedAt,
              scanFailed,
              truncated,
            }
          });
          await this.pruneEndpointScanResults(5, { key: scanKey, scannedAt });
          await browser.tabs.create({
            url: browser.runtime.getURL(`endpoint-results.html?scan=${encodeURIComponent(scanId)}`)
          });
          break;
        }
        }
        return response;
      } catch (e) {
        // Never throw from the message handler; it can destabilize the background page.
        LOG.error("Background onMessage failed:", e, m && m.method);
        return undefined;
      }
    });

    // Scan results only need to outlive a tab reload, not the browser session.
    browser.runtime.onStartup.addListener(() => {
      this.pruneEndpointScanResults(0).catch(() => {});
    });

    if (browser.contextualIdentities.onRemoved) {
      browser.contextualIdentities.onRemoved.addListener(({contextualIdentity}) => {
        const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(contextualIdentity.cookieStoreId);
        backgroundLogic.deleteContainer(userContextId, true);
      });
    }

    browser.tabs.onActivated.addListener((info) => {
      assignManager.removeContextMenu();
      browser.pageAction.show(info.tabId).catch(() => {});
      browser.tabs.get(info.tabId).then((tab) => {
        assignManager.calculateContextMenu(tab);
      }).catch((e) => {
        LOG.error("Failed to update context menu onActivated:", e);
      });
    });

    browser.windows.onFocusChanged.addListener((windowId) => {
      this.onFocusChangedCallback(windowId);
    });

    browser.webRequest.onCompleted.addListener((details) => {
      if (details.frameId !== 0 || details.tabId === -1) {
        return {};
      }
      browser.pageAction.show(details.tabId).catch(() => {});

      browser.tabs.get(details.tabId).then((tab) => {
        assignManager.refreshContextMenuFor(tab);
      }).catch((e) => {
        LOG.error("Failed to update context menu onCompleted:", e);
      });
    }, {urls: ["<all_urls>"], types: ["main_frame"]});

    browser.tabs.onCreated.addListener((tab) => {
      // lets remember the last tab created so we can close it if it looks like a redirect
      this.lastCreatedTab = tab;
      if (tab.cookieStoreId) {
        // Don't count firefox-default, firefox-private, nor our own confirm page loads
        if (tab.cookieStoreId !== "firefox-default" &&
            tab.cookieStoreId !== "firefox-private" &&
            !tab.url.startsWith("moz-extension")) {
          // increment the counter of container tabs opened
          this.incrementCountOfContainerTabsOpened();

          {
            const tabUpdateHandler = (tabId, changeInfo) => {
              if (tabId === tab.id && changeInfo.status === "complete") {
                // get current tab's url to not open the same one from hidden tabs
                browser.tabs.get(tabId).then(loadedTab => {
                  backgroundLogic.unhideContainer(tab.cookieStoreId, loadedTab.url);
                }).catch((e) => {
                  LOG.error("Failed to unhide container:", e);
                });

                cleanup();
              }
            };

            const tabRemoveHandler = (tabId) => {
              if (tabId === tab.id) {
                cleanup();
              }
            };

            const cleanup = () => {
              browser.tabs.onUpdated.removeListener(tabUpdateHandler);
              browser.tabs.onRemoved.removeListener(tabRemoveHandler);
            };

            // if it's a container tab wait for it to complete and
            // unhide other tabs from this container
            if (tab.cookieStoreId.startsWith("firefox-container")) {
              // Filtered to this tab, so a burst of new tabs does not make
              // every handler run for every other tab's status change.
              browser.tabs.onUpdated.addListener(tabUpdateHandler, {
                tabId: tab.id,
                properties: ["status"]
              });
              // Clean up the listener if the tab is closed before loading completes
              browser.tabs.onRemoved.addListener(tabRemoveHandler);
            }
          }
        }
      }
      // Only forget *this* tab: an earlier tab's timer used to clear a later
      // one, so a redirect in the second tab left a stray tab behind.
      setTimeout(() => {
        if (this.lastCreatedTab === tab) this.lastCreatedTab = null;
      }, this.LAST_CREATED_TAB_TIMER);
    });
  },

  // Scan results are kept so their tab survives a reload, so they need a cap.
  // Keep the newest few and drop the legacy single-key entry on the way past.
  /**
   * Cap the stored endpoint scans, optionally recording a new one first.
   *
   * Scans are tracked in a small index key. This used to read the whole of
   * storage.local — every container's hidden tabs and site assignments — on
   * every scan just to find these few keys. A profile without the index
   * (upgraded from an older version) is read in full once to build it.
   */
  async pruneEndpointScanResults(keep = 5, added = null) {
    const INDEX_KEY = "endpointScanIndex";
    try {
      const { [INDEX_KEY]: index } = await browser.storage.local.get(INDEX_KEY);
      let candidates;
      if (Array.isArray(index)) {
        candidates = {};
        for (const entry of index) {
          if (entry && entry.key) candidates[entry.key] = { scannedAt: entry.scannedAt };
        }
      } else {
        candidates = await browser.storage.local.get();
      }
      if (added) candidates[added.key] = { scannedAt: added.scannedAt };

      const removable =
        PhoenixBoxReviewHelpers.selectEndpointScanKeysToRemove(candidates, keep);
      if (removable.length) {
        await browser.storage.local.remove(removable);
      }
      const kept = Object.keys(candidates)
        .filter((key) => key.startsWith("endpointScanResults@@_") && !removable.includes(key))
        .map((key) => ({ key, scannedAt: Number(candidates[key] && candidates[key].scannedAt) || 0 }));
      await browser.storage.local.set({ [INDEX_KEY]: kept });
    } catch (e) {
      LOG.error("Failed to prune endpoint scan results:", e);
    }
  },

  async incrementCountOfContainerTabsOpened() {
    const key = "containerTabsOpened";
    const count = await browser.storage.local.get({[key]: 0});
    const countOfContainerTabsOpened = ++count[key];
    browser.storage.local.set({[key]: countOfContainerTabsOpened});
  },

  async onFocusChangedCallback(windowId) {
    assignManager.removeContextMenu();
    browser.tabs.query({active: true, windowId}).then((tabs) => {
      if (tabs && tabs[0]) {
        assignManager.calculateContextMenu(tabs[0]);
      }
    }).catch((e) => {
      // Focus can land on a window with no queryable active tab (devtools,
      // a closing window). Log it rather than re-throwing into an unhandled
      // rejection on the background page.
      LOG.error("Failed to update context menu onFocusChanged:", e);
    });
  },
};

// Lets do this last as theme manager did a check before connecting before
messageHandler.init();
