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
      // Presets used to be saved flagged as Mozilla VPN proxies. A real VPN
      // entry always carries a countryCode; a preset never does.
      if (item && item.proxy && item.proxy.source === "preset" &&
          item.proxy.mozProxyEnabled === true && !item.proxy.countryCode) {
        item.proxy.mozProxyEnabled = false;
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
    // Build the write from the raw stored list, never retrieveAll(): that
    // merges in-memory session passwords, and writing it back would persist
    // them.
    const proxifiedContainersStore = [...(await this._ensureCache())];

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

  // Deletes the proxy information object for a specified cookieStoreId [useful for cleaning]
  async delete(cookieStoreId) {
    // From the raw stored list, for the same reason as set(): retrieveAll()
    // carries session passwords that must never be written back.
    const proxifiedContainersStore = [...(await this._ensureCache())];
    const index = proxifiedContainersStore.findIndex(i => i.cookieStoreId === cookieStoreId);
    delete this._sessionProxyPasswords[cookieStoreId];
    if (index === -1) return;
    proxifiedContainersStore.splice(index, 1);
    await browser.storage.local.set({
      proxifiedContainersKey: proxifiedContainersStore
    });

    // Keep cache consistent immediately (storage event is async).
    this._cache = proxifiedContainersStore;
  },

  /**
   * Synchronous answer to "is any container proxy configured?", or null while
   * the list has not been loaded yet. Lets the per-request proxy handler skip
   * all work when there is nothing to route.
   */
  hasAnyCached() {
    return Array.isArray(this._cache) ? this._cache.length > 0 : null;
  }
};
