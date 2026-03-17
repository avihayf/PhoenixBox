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
    browser.runtime.onMessage.addListener(async (m) => {
      try {
        let response;
        let tab;

        switch (m.method) {
        case "getShortcuts":
          response = identityState.storageArea.loadKeyboardShortcuts();
          break;
        case "setShortcut":
          identityState.storageArea.setKeyboardShortcut(m.shortcut, m.cookieStoreId);
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
        case "getAssignment":
          response = browser.tabs.get(m.tabId).then((tab) => {
            return assignManager._getAssignment(tab);
          });
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
          response = assignManager._resetCookiesForSite(m.pageUrl, m.cookieStoreId);
          break;
        case "sortTabs":
          backgroundLogic.sortTabs();
          break;
        case "showTabs":
          backgroundLogic.unhideContainer(m.cookieStoreId);
          break;
        case "hideTabs":
          backgroundLogic.hideTabs({
            cookieStoreId: m.cookieStoreId,
            windowId: m.windowId
          });
          break;
        case "checkIncompatibleAddons":
          break;
        case "moveTabsToWindow":
          response = backgroundLogic.moveTabsToWindow({
            cookieStoreId: m.cookieStoreId,
            windowId: m.windowId
          });
          break;
        case "getTabs":
          response = backgroundLogic.getTabs({
            cookieStoreId: m.cookieStoreId,
            windowId: m.windowId
          });
          break;
        case "queryIdentitiesState":
          response = backgroundLogic.queryIdentitiesState(m.message.windowId);
          break;
        case "exemptContainerAssignment":
          response = assignManager._exemptTab(m);
          break;
        case "reloadInContainer":
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
          // m.tabId is used for where to place the in content message
          // m.url is the assignment to be removed/added
          response = browser.tabs.get(tab.id).then((tab) => {
            return assignManager._setOrRemoveAssignment(tab.id, m.url, m.newUserContextId, m.value);
          });
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
          try {
            const reply = await browser.tabs.sendMessage(tabId, { method: "scanEndpoints" });
            endpoints = Array.isArray(reply) ? reply : [];
            console.log("[PhoenixBox] extractEndpoints: found", endpoints.length, "on", pageUrl);
          } catch (scanErr) {
            console.error("[PhoenixBox] extractEndpoints: scan failed:", scanErr);
          }
          await browser.storage.local.set({
            endpointScanResults: {
              endpoints,
              pageUrl,
              scannedAt: Date.now(),
            }
          });
          await browser.tabs.create({ url: browser.runtime.getURL("endpoint-results.html") });
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

    if (browser.contextualIdentities.onRemoved) {
      browser.contextualIdentities.onRemoved.addListener(({contextualIdentity}) => {
        const userContextId = backgroundLogic.getUserContextIdFromCookieStoreId(contextualIdentity.cookieStoreId);
        backgroundLogic.deleteContainer(userContextId, true);
      });
    }

    browser.tabs.onActivated.addListener((info) => {
      assignManager.removeContextMenu();
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
      assignManager.removeContextMenu();

      browser.tabs.get(details.tabId).then((tab) => {
        assignManager.calculateContextMenu(tab);
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
              browser.tabs.onUpdated.addListener(tabUpdateHandler, {
                properties: ["status"]
              });
              // Clean up the listener if the tab is closed before loading completes
              browser.tabs.onRemoved.addListener(tabRemoveHandler);
            }
          }
        }
      }
      setTimeout(() => {
        this.lastCreatedTab = null;
      }, this.LAST_CREATED_TAB_TIMER);
    });
  },

  async incrementCountOfContainerTabsOpened() {
    const key = "containerTabsOpened";
    const count = await browser.storage.local.get({[key]: 0});
    const countOfContainerTabsOpened = ++count[key];
    browser.storage.local.set({[key]: countOfContainerTabsOpened});
  },

  async onFocusChangedCallback(windowId) {
    assignManager.removeContextMenu();
    badge.displayBrowserActionBadge();
    browser.tabs.query({active: true, windowId}).then((tabs) => {
      if (tabs && tabs[0]) {
        assignManager.calculateContextMenu(tabs[0]);
      }
    }).catch((e) => {
      throw e;
    });
  },
};

// Lets do this last as theme manager did a check before connecting before
messageHandler.init();
