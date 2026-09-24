/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line
const CONTAINER_ORDER_STORAGE_KEY = "container-order";

const Utils = {
  /**
   * @returns {Promise<Tab|false>}
   */
  async currentTab() {
    const activeTabs = await browser.tabs.query({ active: true, windowId: browser.windows.WINDOW_ID_CURRENT });
    if (activeTabs.length > 0) {
      return activeTabs[0];
    }
    return false;
  },

  // Click and keyboard activation for a non-button element. It also makes the
  // element focusable and announces it as a button: the page-action rows are
  // <tr>s, and with an Enter handler but no tabindex nothing could reach them
  // from the keyboard. Space activates too, as it does for a real button.
  addEnterHandler(element, handler) {
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
    if (!element.hasAttribute("role")) element.setAttribute("role", "button");
    element.addEventListener("click", (e) => {
      handler(e);
    });
    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler(e);
      }
    });
  },

  userContextId(cookieStoreId = "") {
    const userContextId = cookieStoreId.replace("firefox-container-", "");
    return (userContextId !== cookieStoreId) ? Number(userContextId) : false;
  },

  setOrRemoveAssignment(tabId, url, userContextId, value) {
    return browser.runtime.sendMessage({
      method: "setOrRemoveAssignment",
      tabId,
      url,
      userContextId,
      value
    });
  },

  async alwaysOpenInContainer(identity) {
    const currentTab = await this.currentTab();
    const assignedUserContextId = this.userContextId(identity.cookieStoreId);
    if (currentTab.cookieStoreId !== identity.cookieStoreId) {
      return await browser.runtime.sendMessage({
        method: "assignAndReloadInContainer",
        url: currentTab.url,
        currentUserContextId: false,
        newUserContextId: assignedUserContextId,
        tabIndex: currentTab.index +1,
        active: currentTab.active,
        groupId: currentTab.groupId
      });
    }
    await Utils.setOrRemoveAssignment(
      currentTab.id,
      currentTab.url,
      assignedUserContextId,
      false
    );
  },
  /* Theme helper
   *
   * First, we look if there's a theme already set in the local storage. If
   * there isn't one, we set the theme based on `prefers-color-scheme`.
   * */
  getTheme(currentTheme, window) {
    if (typeof currentTheme !== "undefined" && currentTheme !== "auto") {
      return currentTheme;
    }
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  },
  async applyTheme() {
    // localStorage is the shared setting (every extension page shares it);
    // storage.local is only a fallback for profiles that predate that.
    let currentTheme = localStorage.getItem("theme");
    if (!currentTheme) {
      ({ currentTheme } = await browser.storage.local.get("currentTheme"));
    }
    const popup = document.getElementsByTagName("html")[0];
    const theme = Utils.getTheme(currentTheme, window);
    popup.setAttribute("data-theme", theme);
    popup.classList.toggle("dark", theme === "dark");
  },

};

window.Utils = Utils;
