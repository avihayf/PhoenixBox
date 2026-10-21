/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const MozillaVPN = {

  async handleContainerList(identities) {
    const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });
    const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });
    this.handleStatusIndicatorsInContainerLists(mozillaVpnInstalled);

    const permissionsEnabled = await this.bothPermissionsEnabled();
    if (!permissionsEnabled) {
      return;
    }

    const proxies = await this.getProxies(identities);
    if (Object.keys(proxies).length === 0) {
      return;
    }

    const tooltipProxyWarning = browser.i18n.getMessage("tooltipWarning");
    for (const el of document.querySelectorAll("[data-cookie-store-id]")) {
      const cookieStoreId = el.dataset.cookieStoreId;

      if (!proxies[cookieStoreId]) {
        continue;
      }
      const { proxy } = proxies[cookieStoreId];

      // Rows without a flag or name element (the page-action popup renders
      // none) used to throw here and abort the loop for every later row.
      if (proxy && typeof proxy === "object") {
        const flag = el.querySelector(".flag-img");
        if (flag && proxy.countryCode && /^[A-Za-z]{2}$/.test(proxy.countryCode)) {
          flag.src = `/img/flags/${proxy.countryCode.toUpperCase()}.png`;
        }
        if (flag && typeof(proxy.mozProxyEnabled) === "undefined" && typeof(proxy.countryCode) !== "undefined") {
          flag.classList.add("proxy-disabled");
        }
        if (!mozillaVpnConnected && proxy.mozProxyEnabled) {
          if (flag) flag.classList.add("proxy-unavailable");
          const menuItemName = el.querySelector(".menu-item-name");
          if (menuItemName) {
            menuItemName.setAttribute("title", tooltipProxyWarning);
            menuItemName.dataset.mozProxyWarning = "proxy-unavailable";
          }
        }
      }
    }
  },

  async setStatusIndicatorIcons(mozillaVpnInstalled) {

    const statusIconEls = document.querySelectorAll(".moz-vpn-connection-status-indicator");

    if (!mozillaVpnInstalled) {
      statusIconEls.forEach(el => {
        el.style.backgroundImage = "none";
        if (el.querySelector(".tooltip")) {
          el.querySelector(".tooltip").textContent = "";
        }
        el.textContent = "";
      });
      return;
    }

    const connectedIndicatorSrc = "url(./img/moz-vpn-connected.svg)";
    const disconnectedIndicatorSrc = "url(./img/moz-vpn-disconnected.svg)";

    const mozillaVpnConnected = await browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" });
    const connectionStatusStringId = mozillaVpnConnected ? "moz-vpn-connected" : "moz-vpn-disconnected";
    const connectionStatusLocalizedString = browser.i18n.getMessage(connectionStatusStringId);
    const connectionStatusTooltip = document.querySelector(".vpn-status-container-list");
    connectionStatusTooltip.setAttribute("title", connectionStatusLocalizedString);

    statusIconEls.forEach(el => {
      el.style.backgroundImage = mozillaVpnConnected ? connectedIndicatorSrc : disconnectedIndicatorSrc;
    });
  },

  async handleStatusIndicatorsInContainerLists(mozillaVpnInstalled) {
    const mozVpnLogotypes = document.querySelectorAll(".moz-vpn-logotype.vpn-status-container-list");

    try {
      if (!mozillaVpnInstalled) {
        mozVpnLogotypes.forEach(el => {
          el.style.display = "none";
        });
        return;
      }
      mozVpnLogotypes.forEach(el => {
        el.style.display = "flex";
        el.classList.remove("display-none");
      });
      this.setStatusIndicatorIcons(mozillaVpnInstalled);
    } catch {
      mozVpnLogotypes.forEach(el => {
        el.style.display = "none";
      });
      return;
    }
  },

  attachUtmParameters(baseUrl, utmContent) {
    const url = new URL(baseUrl);
    const utmParameters = {
      utm_source: "phoenix-box",
      utm_medium: "browser-addon",
      utm_content: utmContent,
      utm_campaign: "vpn-better-together",
    };

    for (const param in utmParameters) {
      url.searchParams.append(param, utmParameters[param]);
    }
    return url.href;
  },

  async getProxies(identities) {
    const proxies = {};
    const mozillaVpnInstalled = await browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" });

    if (mozillaVpnInstalled) {
      for (const identity of identities) {
        try {
          const proxy = await proxifiedContainers.retrieve(identity.cookieStoreId);
          proxies[identity.cookieStoreId] = proxy;
        } catch {
          proxies[identity.cookieStoreId] = {};
        }
      }
    }
    return proxies;
  },

  async bothPermissionsEnabled() {
    return await browser.permissions.contains({ permissions: ["proxy", "nativeMessaging"] });
  },

};

window.MozillaVPN = MozillaVPN;
