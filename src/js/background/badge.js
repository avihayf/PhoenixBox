/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAJOR_VERSIONS = ["2.3.0", "2.4.0", "6.2.0", "8.0.2"];
const badge = {
  async init() {
    const currentWindow = await browser.windows.getCurrent();
    this.displayBrowserActionBadge(currentWindow);
  },

  async displayBrowserActionBadge() {
    const extensionInfo = await backgroundLogic.getExtensionInfo();
    const storage = await browser.storage.local.get({ browserActionBadgesClicked: [] });

    if (MAJOR_VERSIONS.indexOf(extensionInfo.version) > -1 &&
      storage.browserActionBadgesClicked.indexOf(extensionInfo.version) < 0) {
      browser.browserAction.setBadgeBackgroundColor({ color: "rgb(255, 79, 94)" });
      browser.browserAction.setBadgeText({ text: "!" });
      browser.browserAction.setBadgeTextColor({ color: "rgb(255, 255, 255)" });
    }
  }
};

badge.init();
