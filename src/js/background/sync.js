/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const SYNC_CATEGORY = {
  IDENTITIES: "identities",
  ASSIGNMENTS: "assignments",
  PRESETS: "presets",
  INSTANCE: "instance",
};

const sync = {
  isSyncRunning: false,
  needsRerun: false,
  needsPresetBackup: false,
  pendingCategories: new Set(),

  classifySyncChanges(changes) {
    const categories = new Set();
    for (const key of Object.keys(changes)) {
      if (key.includes("identity@@_") || key === "deletedIdentityList") {
        categories.add(SYNC_CATEGORY.IDENTITIES);
      } else if (key.includes("siteContainerMap@@_") || key === "deletedSiteList") {
        categories.add(SYNC_CATEGORY.ASSIGNMENTS);
      } else if (key === "customProxyPresets") {
        categories.add(SYNC_CATEGORY.PRESETS);
      } else if (key.includes("MACinstance")) {
        categories.add(SYNC_CATEGORY.INSTANCE);
      }
    }
    return categories;
  },

  storageArea: {
    area: browser.storage.sync,

    async get(keys){
      return this.area.get(keys);
    },

    async set(options) {
      return this.area.set(options);
    },

    async deleteIdentity(deletedIdentityUUID) {
      const deletedIdentityList = 
        await sync.storageArea.getDeletedIdentityList();
      if (
        ! deletedIdentityList.find(element => element === deletedIdentityUUID)
      ) {
        deletedIdentityList.push(deletedIdentityUUID);
        await sync.storageArea.set({ deletedIdentityList });
      }
      await this.removeIdentityKeyFromSync(deletedIdentityUUID);
    },

    async removeIdentityKeyFromSync(deletedIdentityUUID) {
      await sync.storageArea.area.remove( "identity@@_" + deletedIdentityUUID);
    },

    async deleteSite(siteStoreKey) {
      const deletedSiteList = 
        await sync.storageArea.getDeletedSiteList();
      if (deletedSiteList.find(element => element === siteStoreKey)) {
        // Keep delete idempotent: ensure stale assignment key is removed.
        await sync.storageArea.area.remove(siteStoreKey);
        return;
      }
      deletedSiteList.push(siteStoreKey);
      await sync.storageArea.set({ deletedSiteList });
      await sync.storageArea.area.remove(siteStoreKey);
    },

    async getDeletedIdentityList() {
      const storedArray = await this.getStoredItem("deletedIdentityList");
      return storedArray || [];
    },

    async getIdentities() {
      const allSyncStorage = await this.get();
      const identities = [];
      for (const storageKey of Object.keys(allSyncStorage)) {
        if (storageKey.includes("identity@@_")) {
          identities.push(allSyncStorage[storageKey]);
        }
      }
      return identities;
    },

    async getDeletedSiteList() { 
      const storedArray = await this.getStoredItem("deletedSiteList");
      return storedArray || [];
    },

    async getAssignedSites() {
      const allSyncStorage = await this.get();
      const sites = {};
      for (const storageKey of Object.keys(allSyncStorage)) {
        if (storageKey.includes("siteContainerMap@@_")) {
          sites[storageKey] = allSyncStorage[storageKey];
        }
      }
      return sites;
    },

    async getStoredItem(objectKey) {
      const outputObject = await this.get(objectKey);
      if (outputObject && outputObject[objectKey]) 
        return outputObject[objectKey];
      return null;
    },

    async getAllInstanceInfo() {
      const instanceList = {};
      const allSyncInfo = await this.get();
      for (const objectKey of Object.keys(allSyncInfo)) {
        if (objectKey.includes("MACinstance")) {
          instanceList[objectKey] = allSyncInfo[objectKey]; }
      }
      return instanceList;
    },

    getInstanceKey() {
      return browser.runtime.getURL("")
        .replace(/moz-extension:\/\//, "MACinstance:")
        .replace(/\//, "");
    },

    async removeInstance(installUUID) {
      await this.area.remove(installUUID);
    },

    async removeThisInstanceFromSync() {
      const installUUID = this.getInstanceKey();
      await this.removeInstance(installUUID);
    },

    async hasSyncStorage(){
      const inSync = await this.get();
      return !(Object.entries(inSync).length === 0);
    },

    async backup(options) {
      // Remove listeners to avoid an infinite loop.
      await sync.checkForListenersMaybeRemove();

      try {
        const identities = await updateSyncIdentities();
        const siteAssignments = await updateSyncSiteAssignments();
        await this.backupPresets();
        await updateInstanceInfo(identities, siteAssignments);
        if (options && options.uuid) {
          await this.deleteIdentity(options.uuid);
        }
        if (options && Array.isArray(options.uuids)) {
          for (const uuid of options.uuids) {
            await this.deleteIdentity(uuid);
          }
        }
        if (options && options.siteStoreKey) {
          await this.deleteSite(options.siteStoreKey);
        }
        if (options && Array.isArray(options.siteStoreKeys)) {
          for (const siteStoreKey of options.siteStoreKeys) {
            await this.deleteSite(siteStoreKey);
          }
        }
        if (options && options.undeleteUUID) {
          await removeFromDeletedIdentityList(options.undeleteUUID);
        }
        if (options && Array.isArray(options.undeleteUUIDs)) {
          for (const undeleteUUID of options.undeleteUUIDs) {
            await removeFromDeletedIdentityList(undeleteUUID);
          }
        }
        if (options && options.undeleteSiteStoreKey) {
          await removeFromDeletedSitesList(options.undeleteSiteStoreKey);
        }
        if (options && Array.isArray(options.undeleteSiteStoreKeys)) {
          for (const undeleteSiteStoreKey of options.undeleteSiteStoreKeys) {
            await removeFromDeletedSitesList(undeleteSiteStoreKey);
          }
        }
      } finally {
        await sync.checkForListenersMaybeAdd();
      }

      async function updateSyncIdentities() {
        const identities = await browser.contextualIdentities.query({});

        for (const identity of identities) {
          delete identity.colorCode;
          delete identity.iconUrl;
          identity.macAddonUUID = await identityState.lookupMACaddonUUID(identity.cookieStoreId);
          if(identity.macAddonUUID) {
            const storageKey = "identity@@_" + identity.macAddonUUID;
            await sync.storageArea.set({ [storageKey]: identity });
          }
        }
        return identities;
      }

      async function updateSyncSiteAssignments() {
        const assignedSites = 
          await assignManager.storageArea.getAssignedSites();
        for (const siteKey of Object.keys(assignedSites)) {
          await sync.storageArea.set({ [siteKey]: assignedSites[siteKey] });
        }
        return assignedSites;
      }

      async function updateInstanceInfo(identitiesInput, siteAssignmentsInput) {
        const timestamp = Date.now();
        const installUUID = sync.storageArea.getInstanceKey();
        const identities = [];
        const siteAssignments = [];
        for (const identity of identitiesInput) {
          identities.push(identity.macAddonUUID);
        }
        for (const siteAssignmentKey of Object.keys(siteAssignmentsInput)) {
          siteAssignments.push(siteAssignmentKey);
        }
        await sync.storageArea.set({ [installUUID]: { timestamp, identities, siteAssignments } });
      }

      async function removeFromDeletedIdentityList(identityUUID) {
        const deletedIdentityList = 
          await sync.storageArea.getDeletedIdentityList();
        const newDeletedIdentityList = deletedIdentityList
          .filter(element => element !== identityUUID);
        await sync.storageArea.set({ deletedIdentityList: newDeletedIdentityList });
      }

      async function removeFromDeletedSitesList(siteStoreKey) {
        const deletedSiteList = 
          await sync.storageArea.getDeletedSiteList();
        const newDeletedSiteList = deletedSiteList
          .filter(element => element !== siteStoreKey);
        await sync.storageArea.set({ deletedSiteList: newDeletedSiteList });
      }
    },

    onChangedListener(changes, areaName) {
      if (areaName !== "sync") return;
      const categories = sync.classifySyncChanges(changes);
      for (const cat of categories) {
        sync.pendingCategories.add(cat);
      }
      if (sync.isSyncRunning) {
        sync.needsRerun = true;
        return;
      }
      sync.errorHandledRunSync();
    },

    async onLocalPresetChangedListener(changes, areaName) {
      if (areaName !== "local") return;
      if (!changes.customProxyPresets) return;
      const syncEnabled = await assignManager.storageArea.getSyncEnabled();
      if (!syncEnabled) return;
      if (sync.isSyncRunning) {
        sync.needsPresetBackup = true;
        return;
      }
      await sync.storageArea.backupPresets();
    },

    async backupPresets() {
      const syncEnabled = await assignManager.storageArea.getSyncEnabled();
      if (!syncEnabled) return;
      const stored = await browser.storage.local.get({ customProxyPresets: [] });
      const localPresets = stored.customProxyPresets || [];
      const syncData = await sync.storageArea.get("customProxyPresets");
      const syncPresets = syncData.customProxyPresets;
      if (JSON.stringify(localPresets) === JSON.stringify(syncPresets || [])) return;
      await sync.storageArea.set({ customProxyPresets: localPresets });
    },

    async addToDeletedList(changeInfo) {
      const identity = changeInfo.contextualIdentity;
      const deletedUUID = 
        await identityState.lookupMACaddonUUID(identity.cookieStoreId);
      await identityState.storageArea.remove(identity.cookieStoreId);
      await sync.storageArea.backup({uuid: deletedUUID});
    }
  },

  async init() {
    const syncEnabled = await assignManager.storageArea.getSyncEnabled();
    if (syncEnabled) {
      this.checkForListenersMaybeAdd();
      return;
    }
    this.checkForListenersMaybeRemove(true);
  },

  async errorHandledRunSync () {
    if (sync.isSyncRunning) {
      sync.needsRerun = true;
      return;
    }

    sync.isSyncRunning = true;
    try {
      do {
        sync.needsRerun = false;
        const categories = new Set(sync.pendingCategories);
        sync.pendingCategories.clear();
        await sync.runSync(categories).catch(async ()=> {
          await sync.checkForListenersMaybeAdd();
        });
      } while (sync.needsRerun);
    } finally {
      sync.isSyncRunning = false;
      if (sync.needsPresetBackup && await assignManager.storageArea.getSyncEnabled()) {
        sync.needsPresetBackup = false;
        await sync.storageArea.backupPresets();
      }
    }
  },

  async checkForListenersMaybeAdd() {
    const hasStorageListener =  
      await browser.storage.onChanged.hasListener(
        sync.storageArea.onChangedListener
      );

    const hasLocalPresetListener =
      await browser.storage.onChanged.hasListener(
        sync.storageArea.onLocalPresetChangedListener
      );

    const hasCIListener = await sync.hasContextualIdentityListeners();

    if (!hasCIListener) {
      await sync.addContextualIdentityListeners();
    }

    if (!hasStorageListener) {
      await browser.storage.onChanged.addListener(
        sync.storageArea.onChangedListener);
    }

    if (!hasLocalPresetListener) {
      await browser.storage.onChanged.addListener(
        sync.storageArea.onLocalPresetChangedListener);
    }
  },

  async checkForListenersMaybeRemove(removeLocalPresetListener = false) {
    const hasStorageListener =  
      await browser.storage.onChanged.hasListener(
        sync.storageArea.onChangedListener
      );

    const hasLocalPresetListener =
      await browser.storage.onChanged.hasListener(
        sync.storageArea.onLocalPresetChangedListener
      );

    const hasCIListener = await sync.hasContextualIdentityListeners();
            
    if (hasCIListener) {
      await sync.removeContextualIdentityListeners();
    }

    if (hasStorageListener) {
      await browser.storage.onChanged.removeListener(
        sync.storageArea.onChangedListener);
    }

    if (removeLocalPresetListener && hasLocalPresetListener) {
      await browser.storage.onChanged.removeListener(
        sync.storageArea.onLocalPresetChangedListener);
    }
  },

  async runSync(categories) {
    await sync.checkForListenersMaybeRemove();

    const runAll = !categories || categories.size === 0;
    const needIdentities = runAll || categories.has(SYNC_CATEGORY.IDENTITIES);
    const needAssignments = runAll || needIdentities || categories.has(SYNC_CATEGORY.ASSIGNMENTS);
    const needPresets = runAll || categories.has(SYNC_CATEGORY.PRESETS);

    let restoreSucceeded = true;
    try {
      if (needIdentities || needAssignments) {
        await identityState.storageArea.upgradeData();
        await assignManager.storageArea.upgradeData();
      }

      const hasSyncStorage = await sync.storageArea.hasSyncStorage();
      if (hasSyncStorage) {
        await restore({ needIdentities, needAssignments, needPresets });
      }
    } catch (e) {
      restoreSucceeded = false;
      LOG.error("runSync: restore/upgrade failed, continuing with backup:", e);
    }

    await sync.storageArea.backup();
    if (restoreSucceeded && (needIdentities || needAssignments)) {
      await removeOldDeletedItems();
    }
  },

  async addContextualIdentityListeners() {
    await browser.contextualIdentities.onCreated.addListener(sync.storageArea.backup);
    await browser.contextualIdentities.onRemoved.addListener(sync.storageArea.addToDeletedList);
    await browser.contextualIdentities.onUpdated.addListener(sync.storageArea.backup);
  },

  async removeContextualIdentityListeners() {
    await browser.contextualIdentities.onCreated.removeListener(sync.storageArea.backup);
    await browser.contextualIdentities.onRemoved.removeListener(sync.storageArea.addToDeletedList);
    await browser.contextualIdentities.onUpdated.removeListener(sync.storageArea.backup);
  },

  async hasContextualIdentityListeners() {
    return (
      await browser.contextualIdentities.onCreated.hasListener(sync.storageArea.backup) &&
      await browser.contextualIdentities.onRemoved.hasListener(sync.storageArea.addToDeletedList) &&
      await browser.contextualIdentities.onUpdated.hasListener(sync.storageArea.backup)
    );
  },

  async resetSync() {
    const syncEnabled = await assignManager.storageArea.getSyncEnabled();
    if (syncEnabled) {
      this.errorHandledRunSync();
      return;
    }
    sync.pendingCategories.clear();
    sync.needsPresetBackup = false;
    await this.checkForListenersMaybeRemove(true);
    await this.storageArea.removeThisInstanceFromSync();
  }

};

// Attaching to window for use in mocha tests.
window.sync = sync;

sync.init();

async function restore(phases) {
  if (!phases || phases.needIdentities) {
    await reconcileIdentities();
  }
  if (!phases || phases.needAssignments) {
    await reconcileSiteAssignments();
  }
  if (!phases || phases.needPresets) {
    await reconcileProxyPresets();
  }
}

/*
 * Checks for the container name. If it exists, they are assumed to be the
 * same container, and the color and icon are overwritten from sync, if
 * different.
 */
async function reconcileIdentities(){
  // First delete any from the deleted list.
  const deletedIdentityList =
    await sync.storageArea.getDeletedIdentityList();
  for (const deletedUUID of deletedIdentityList) {
    const deletedCookieStoreId = 
      await identityState.lookupCookieStoreId(deletedUUID);
    if (deletedCookieStoreId){
      try{
        await browser.contextualIdentities.remove(deletedCookieStoreId);
      } catch {
        LOG.error("Error deleting contextualIdentity", deletedCookieStoreId);
        continue;
      }
    }
  }
  const localIdentities = await browser.contextualIdentities.query({});
  const syncIdentitiesRemoveDupes = 
    await sync.storageArea.getIdentities();
  // Find any local dupes created on sync storage and delete from sync storage.
  for (const localIdentity of localIdentities) {
    const syncIdentitiesOfName = syncIdentitiesRemoveDupes
      .filter(identity => identity.name === localIdentity.name);
    if (syncIdentitiesOfName.length > 1) {
      const identityMatchingContextId = syncIdentitiesOfName
        .find(identity => identity.cookieStoreId === localIdentity.cookieStoreId);
      if (identityMatchingContextId) 
        await sync.storageArea.removeIdentityKeyFromSync(identityMatchingContextId.macAddonUUID);
    }
  }
  const syncIdentities = 
    await sync.storageArea.getIdentities();
  // Now compare all containers for matching names.
  for (const syncIdentity of syncIdentities) {
    if (syncIdentity.macAddonUUID){
      const localCookieStoreID =
        await identityState.lookupCookieStoreId(syncIdentity.macAddonUUID);
      if (localCookieStoreID) {
        const localMatchByUUID = localIdentities.find(
          localIdentity => localIdentity.cookieStoreId === localCookieStoreID
        );
        if (localMatchByUUID) {
          await updateIdentityWithSyncInfo(syncIdentity, localMatchByUUID);
          continue;
        }
      }

      const localMatchesByName = localIdentities
        .filter(localIdentity => localIdentity.name === syncIdentity.name);

      if (localMatchesByName.length === 0) {
        await ifNoMatch(syncIdentity);
        continue;
      }

      if (localMatchesByName.length === 1) {
        await updateIdentityWithSyncInfo(syncIdentity, localMatchesByName[0]);
        continue;
      }

      // Duplicate names are ambiguous; only update if one has matching UUID.
      let localMatchByNameAndUUID = null;
      for (const localIdentity of localMatchesByName) {
        const localUUID = await identityState
          .lookupMACaddonUUID(localIdentity.cookieStoreId);
        if (localUUID === syncIdentity.macAddonUUID) {
          localMatchByNameAndUUID = localIdentity;
          break;
        }
      }

      if (localMatchByNameAndUUID) {
        await updateIdentityWithSyncInfo(syncIdentity, localMatchByNameAndUUID);
      } else {
        LOG.warn("Skipping ambiguous sync identity match for name:", syncIdentity.name);
      }
      continue;
    }
    // If no macAddonUUID, there is a problem with the sync info and it needs to be ignored.
  }

  await updateSiteAssignmentUUIDs();

  async function updateSiteAssignmentUUIDs(){
    const sites = await assignManager.storageArea.getAssignedSites();
    for (const siteKey of Object.keys(sites)) {
      await assignManager.storageArea.set(siteKey, sites[siteKey], false, false);
    }
  }
}

async function updateIdentityWithSyncInfo(syncIdentity, localMatch) {
  if (syncIdentity.name !== localMatch.name
      || syncIdentity.color !== localMatch.color 
      || syncIdentity.icon !== localMatch.icon) {
    await browser.contextualIdentities.update(
      localMatch.cookieStoreId, {
        name: syncIdentity.name, 
        color: syncIdentity.color, 
        icon: syncIdentity.icon
      });
  }
  if (localMatch.macAddonUUID !== syncIdentity.macAddonUUID) {
    await identityState.updateUUID(
      localMatch.cookieStoreId, 
      syncIdentity.macAddonUUID
    );
  }
}

async function ifNoMatch(syncIdentity){
  const newIdentity = 
        await browser.contextualIdentities.create({
          name: syncIdentity.name, 
          color: syncIdentity.color, 
          icon: syncIdentity.icon
        });
  await identityState.updateUUID(
    newIdentity.cookieStoreId, 
    syncIdentity.macAddonUUID
  );
}

/*
 * Checks for site previously assigned. If it exists, and has the same
 * container assignment, the assignment is kept. If it exists, but has
 * a different assignment, the user is prompted (not yet implemented).
 * If it does not exist, it is created.
 */
async function reconcileSiteAssignments() {
  const assignedSitesLocal = 
    await assignManager.storageArea.getAssignedSites();
  const assignedSitesFromSync = 
    await sync.storageArea.getAssignedSites();
  const deletedSiteList = 
    await sync.storageArea.getDeletedSiteList();
  for(const siteStoreKey of deletedSiteList) {
    if (Object.prototype.hasOwnProperty.call(assignedSitesLocal,siteStoreKey)) {
      await assignManager
        .storageArea
        .remove(siteStoreKey, false);
    }
  }

  for(const urlKey of Object.keys(assignedSitesFromSync)) {
    const assignedSite = assignedSitesFromSync[urlKey];
    try{
      if (assignedSite.identityMacAddonUUID) {
        await setAssignmentWithUUID(assignedSite, urlKey);
        continue;
      }
    } catch {
      // Old or incorrect site info in Sync — skip.
    }
  }
}

const VALID_PROXY_SCHEMES = new Set(["http", "https", "socks", "socks4"]);

function isValidProxyPreset(preset) {
  if (!preset || typeof preset !== "object") return false;
  if (typeof preset.id !== "string" || !preset.id) return false;
  if (typeof preset.name !== "string" || !preset.name) return false;
  if (!VALID_PROXY_SCHEMES.has(preset.scheme)) return false;
  if (typeof preset.host !== "string" || !preset.host || preset.host.length > 253) return false;
  if (typeof preset.port !== "number" || !Number.isFinite(preset.port)
      || preset.port < 1 || preset.port > 65535) return false;
  return true;
}

async function reconcileProxyPresets() {
  const syncData = await sync.storageArea.get("customProxyPresets");
  const syncPresets = syncData.customProxyPresets;
  if (!Array.isArray(syncPresets)) return;

  const localData = await browser.storage.local.get({ customProxyPresets: [] });
  const localPresets = localData.customProxyPresets || [];

  const validSyncPresets = syncPresets.filter(isValidProxyPreset);
  const syncById = new Map(validSyncPresets.map(p => [p.id, p]));

  const merged = [];

  for (const syncPreset of validSyncPresets) {
    merged.push(syncPreset);
  }

  for (const localPreset of localPresets) {
    if (!syncById.has(localPreset.id)) {
      merged.push(localPreset);
    }
  }

  if (JSON.stringify(merged) !== JSON.stringify(localPresets)) {
    await browser.storage.local.set({ customProxyPresets: merged });
  }
}

const MILISECONDS_IN_THIRTY_DAYS = 2592000000;

async function removeOldDeletedItems() {
  const instanceList = await sync.storageArea.getAllInstanceInfo();
  const deletedSiteList = await sync.storageArea.getDeletedSiteList();
  const deletedIdentityList = await sync.storageArea.getDeletedIdentityList();

  const currentTimestamp = Date.now();
  for (const instanceKey of Object.keys(instanceList)) {
    const instance = instanceList[instanceKey];
    if (!instance || typeof instance.timestamp !== "number") {
      delete instanceList[instanceKey];
      await sync.storageArea.removeInstance(instanceKey);
      continue;
    }
    if (instance.timestamp < currentTimestamp - MILISECONDS_IN_THIRTY_DAYS) {
      delete instanceList[instanceKey];
      await sync.storageArea.removeInstance(instanceKey);
      continue;
    }
  }
  const staleSiteStoreKeys = [];
  for (const siteStoreKey of deletedSiteList) {
    let hasMatch = false;
    for (const instance of Object.values(instanceList)) {
      const siteAssignments = Array.isArray(instance.siteAssignments) 
        ? instance.siteAssignments 
        : [];
      const match = siteAssignments.find(element => element === siteStoreKey);
      if (!match) continue;
      hasMatch = true;
    }
    if (!hasMatch) {
      staleSiteStoreKeys.push(siteStoreKey);
    }
  }
  const staleIdentityUUIDs = [];
  for (const identityUUID of deletedIdentityList) {
    let hasMatch = false;
    for (const instance of Object.values(instanceList)) {
      const identities = Array.isArray(instance.identities) 
        ? instance.identities 
        : [];
      const match = identities.find(element => element === identityUUID);
      if (!match) continue;
      hasMatch = true;
    }
    if (!hasMatch) {
      staleIdentityUUIDs.push(identityUUID);
    }
  }

  if (staleSiteStoreKeys.length || staleIdentityUUIDs.length) {
    await sync.storageArea.backup({
      undeleteSiteStoreKeys: staleSiteStoreKeys,
      undeleteUUIDs: staleIdentityUUIDs
    });
  }
}

async function setAssignmentWithUUID(assignedSite, urlKey) {
  const uuid = assignedSite.identityMacAddonUUID;
  const cookieStoreId = await identityState.lookupCookieStoreId(uuid);
  if (cookieStoreId) {
    assignedSite.userContextId = cookieStoreId
      .replace(/^firefox-container-/, "");
    await assignManager.storageArea.set(
      urlKey,
      assignedSite,
      false,
      false
    );
    return;
  }
  throw new Error (`No cookieStoreId found for: ${uuid}, ${urlKey}`);
}
