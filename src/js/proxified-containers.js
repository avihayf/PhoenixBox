/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// This object allows other scripts to access the list mapping containers to their proxies
proxifiedContainers = {
  _cache: null,
  _cacheListenerAdded: false,
  _cacheLoadPromise: null,
  _sessionProxyPasswords: {},
  _legacyMigrationDone: false,

  async _migrateLegacyPasswordEnc() {
    if (this._legacyMigrationDone) return;
    this._legacyMigrationDone = true;
    const result = await browser.storage.local.get({ proxifiedContainersKey: [] });
    const list = Array.isArray(result.proxifiedContainersKey) ? result.proxifiedContainersKey : [];
    let changed = false;
    for (const item of list) {
      if (item && item.proxy && typeof item.proxy === "object" && item.proxy.passwordEnc) {
        delete item.proxy.passwordEnc;
        changed = true;
      }
    }
    if (changed) {
      await browser.storage.local.set({ proxifiedContainersKey: list });
      this._cache = list;
    }
  },

  async _ensureCache() {
    if (Array.isArray(this._cache)) return this._cache;
    if (this._cacheLoadPromise) return this._cacheLoadPromise;

    this._cacheLoadPromise = (async () => {
      await this._migrateLegacyPasswordEnc();
      const result = await browser.storage.local.get({ proxifiedContainersKey: [] });
      const list = Array.isArray(result.proxifiedContainersKey) ? result.proxifiedContainersKey : [];
      this._cache = list;

      if (!this._cacheListenerAdded) {
        browser.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== "local") return;
          if (!changes.proxifiedContainersKey) return;
          const next = changes.proxifiedContainersKey.newValue;
          this._cache = Array.isArray(next) ? next : [];
        });
        this._cacheListenerAdded = true;
      }

      return this._cache;
    })().finally(() => {
      this._cacheLoadPromise = null;
    });

    return this._cacheLoadPromise;
  },

  async retrieveAll() {
    const list = await this._ensureCache();
    return (Array.isArray(list) ? list : []).map((item) => {
      const next = { ...item };
      if (next && next.proxy && typeof next.proxy === "object") {
        const proxy = { ...next.proxy };
        if (!proxy.password && this._sessionProxyPasswords[next.cookieStoreId]) {
          proxy.password = this._sessionProxyPasswords[next.cookieStoreId];
        }
        next.proxy = proxy;
      }
      return next;
    });
  },

  async retrieve(cookieStoreId) {
    const result = await this.retrieveAll();
    if(!result) {
      return null;
    }

    return result.find(o => o.cookieStoreId === cookieStoreId);
  },

  async set(cookieStoreId, proxy) {
    // Assumes proxy is a properly formatted object
    let proxifiedContainersStore = await proxifiedContainers.retrieveAll();
    if (!proxifiedContainersStore) proxifiedContainersStore = [];

    // Security hardening:
    // Do not persist proxy passwords to storage. Keep them in memory for the
    // current browser session only.
    let storedProxy = proxy;
    if (proxy && typeof proxy === "object" && proxy.password) {
      this._sessionProxyPasswords[cookieStoreId] = String(proxy.password);
      storedProxy = { ...proxy };
      delete storedProxy.password;
      delete storedProxy.passwordEnc;
    }

    const index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
    if (index === -1) {
      proxifiedContainersStore.push({
        cookieStoreId: cookieStoreId,
        proxy: storedProxy
      });
    } else {
      proxifiedContainersStore[index] = {
        cookieStoreId: cookieStoreId,
        proxy: storedProxy
      };
    }

    await browser.storage.local.set({
      proxifiedContainersKey: proxifiedContainersStore
    });

    // Keep cache consistent immediately (storage event is async).
    this._cache = proxifiedContainersStore;
  },

  parseProxy(proxy_str, mozillaVpnData = null) {
    const proxyRegexp = /(?<type>https?|socks4?):\/\/(?:(?<username>[^:@/]+):(?<password>[^@/]+)@)?(?<host>(?:\d{1,3}\.){3}\d{1,3}|[\w][\w.-]*)(?::(?<port>\d+))?/;
    const matches = proxyRegexp.exec(proxy_str);
    if (!matches) {
      return false;
    }

    if (mozillaVpnData && mozillaVpnData.mozProxyEnabled === undefined) {
      matches.groups.type = null;
    }

    if (!mozillaVpnData) {
      mozillaVpnData = MozillaVPN.getMozillaProxyInfoObj();
    }

    return {...matches.groups,...mozillaVpnData};
  },

  // Deletes the proxy information object for a specified cookieStoreId [useful for cleaning]
  async delete(cookieStoreId) {
    // Assumes proxy is a properly formatted object
    const proxifiedContainersStore = await proxifiedContainers.retrieveAll();
    if (!proxifiedContainersStore) {
      await browser.storage.local.set({ proxifiedContainersKey: [] });
      this._cache = [];
      return;
    }
    const index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
    if (index !== -1) {
      proxifiedContainersStore.splice(index, 1);
    }
    await browser.storage.local.set({
      proxifiedContainersKey: proxifiedContainersStore
    });

    // Keep cache consistent immediately (storage event is async).
    this._cache = proxifiedContainersStore;
    delete this._sessionProxyPasswords[cookieStoreId];
  }
};
