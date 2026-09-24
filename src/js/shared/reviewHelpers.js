(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PhoenixBoxReviewHelpers = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function computeSiteIsolationMutation(currentlyIsolated, desiredIsolated) {
    const current = !!currentlyIsolated;
    const desired = !!desiredIsolated;

    if (current === desired) {
      return { shouldMutate: false, remove: false };
    }

    return {
      shouldMutate: true,
      remove: !desired,
    };
  }

  function getNativeMessagingPermissionPlan(hasPermission) {
    if (hasPermission) {
      return {
        clearVpnProxies: false,
        reloadExtension: false,
      };
    }

    return {
      clearVpnProxies: true,
      reloadExtension: true,
    };
  }

  function sanitizeHiddenTab(tab) {
    return {
      active: false,
      cookieStoreId: tab.cookieStoreId,
      discarded: !!tab.discarded,
      favIconUrl: tab.favIconUrl || "",
      hiddenState: true,
      pinned: !!tab.pinned,
      title: tab.title || "",
      url: tab.url || "",
    };
  }

  function shouldEnablePaintBurpAfterProxy(autoEnablePaintBurp, proxyEnabled) {
    return !!autoEnablePaintBurp && !!proxyEnabled;
  }

  function shouldAllowGlobalProxyFallback(cookieStoreId, promotedProxyContainerIds) {
    // Accept an array of promoted container IDs. Tolerate a legacy single
    // string value for backward compatibility with older stored state.
    let promoted;
    if (Array.isArray(promotedProxyContainerIds)) {
      promoted = promotedProxyContainerIds;
    } else if (promotedProxyContainerIds) {
      promoted = [promotedProxyContainerIds];
    } else {
      promoted = [];
    }

    const promotedIds = promoted
      .map((id) => String(id || ""))
      .filter((id) => id);

    if (promotedIds.length === 0) {
      return true;
    }

    return promotedIds.includes(String(cookieStoreId || ""));
  }

  function countVisibleAndHiddenTabs(visibleTabs, hiddenTabs) {
    const visibleCount = Array.isArray(visibleTabs) ? visibleTabs.length : 0;
    const hiddenCount = Array.isArray(hiddenTabs) ? hiddenTabs.length : 0;
    return visibleCount + hiddenCount;
  }

  function buildHiddenTabCreateProperties(options) {
    const opts = options || {};
    const url = opts.url;
    const discarded = !!opts.discarded;
    const createProperties = {
      url,
      active: !!opts.active,
      discarded,
      pinned: !!opts.pinned,
      cookieStoreId: opts.cookieStoreId,
    };

    // Firefox only permits `title` when a tab is created discarded, and it
    // *requires* a title when a discarded tab is created with a URL. Fall back
    // to the URL when no stored title is available so un-hide never rejects.
    if (discarded) {
      createProperties.title = opts.title || url;
    }

    return createProperties;
  }

  const SITE_STORE_PREFIX = "siteContainerMap@@_";
  const ENDPOINT_SCAN_PREFIX = "endpointScanResults@@_";
  const LEGACY_ENDPOINT_SCAN_KEY = "endpointScanResults";

  // Match on the prefix rather than anywhere in the string: a URL that merely
  // contains the sentinel (e.g. in its query string) is not a storage key.
  // Site assignments decide which container a site opens in, so a false
  // positive here routes traffic into the wrong container.
  function isSiteStoreKey(value) {
    return String(value).startsWith(SITE_STORE_PREFIX);
  }

  // Ports 80 and 443 are the defaults for the schemes we assign, so they are
  // left off the key; anything else is kept to separate e.g. localhost:3000
  // from localhost:8080.
  function buildSiteStoreKey(hostname, port) {
    const sanitized = sanitizeHostnameForStoreKey(hostname);
    const value = (port === null || port === undefined) ? "" : String(port);
    if (!value || value === "80" || value === "443") {
      return `${SITE_STORE_PREFIX}${sanitized}`;
    }
    return `${SITE_STORE_PREFIX}${sanitized}:${value}`;
  }

  function getHostnameFromSiteStoreKey(siteStoreKey) {
    const raw = String(siteStoreKey).replace(/^siteContainerMap@@_/, "");
    if (!raw) return "";

    const colonIdx = raw.lastIndexOf(":");
    if (colonIdx > 0) {
      return raw.slice(0, colonIdx);
    }
    return raw;
  }

  // Endpoint scan results are kept so a results tab survives a reload, so the
  // set has to be capped. Newest wins; anything unreadable sorts oldest.
  function selectEndpointScanKeysToRemove(allStorage, keep) {
    const storage = allStorage && typeof allStorage === "object" ? allStorage : {};
    const limit = Number.isFinite(Number(keep)) && Number(keep) > 0 ? Number(keep) : 0;

    const scannedAt = (key) => {
      const entry = storage[key];
      if (!entry || typeof entry !== "object") return 0;
      const value = Number(entry.scannedAt);
      return Number.isFinite(value) ? value : 0;
    };

    const scanKeys = Object.keys(storage)
      .filter((key) => key.startsWith(ENDPOINT_SCAN_PREFIX))
      // Tiebreak on the key so equal or absent timestamps still sort
      // deterministically; scan ids embed Date.now(), so this tracks recency.
      .sort((a, b) => (scannedAt(b) - scannedAt(a)) || b.localeCompare(a));

    const stale = LEGACY_ENDPOINT_SCAN_KEY in storage ? [LEGACY_ENDPOINT_SCAN_KEY] : [];
    return stale.concat(scanKeys.slice(limit));
  }

  /**
   * Whether two proxy configs point at the same endpoint as the same user.
   *
   * Stored configs never carry the password, so when one comes back through
   * storage.onChanged this is what decides whether the password held in
   * memory still belongs to it.
   */
  function isSameProxyEndpoint(a, b) {
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    return String(a.type || "") === String(b.type || "") &&
      String(a.host || "").toLowerCase() === String(b.host || "").toLowerCase() &&
      Number(a.port) === Number(b.port) &&
      String(a.username || "") === String(b.username || "");
  }

  const KEYBOARD_SHORTCUT_KEY = /^open_container_\d+$/;

  /**
   * Work out which per-container settings still reference a deleted container.
   *
   * Left behind, a promoted-proxy ID is actively harmful: once the promoted
   * list is non-empty only listed containers use the global proxy, so a stale
   * ID that matches nothing sends every container's traffic DIRECT while the
   * proxy still shows as on. A stale container User-Agent keeps the blocking
   * header listener attached forever, and a stale shortcut crashes the options
   * page.
   *
   * @param {object} stored a storage read of the settings below plus the
   *   open_container_N shortcut keys.
   * @param {string} cookieStoreId the deleted container.
   * @returns {object} the storage.local.set patch; empty when nothing changes.
   */
  function planContainerSettingsCleanup(stored, cookieStoreId) {
    const values = stored && typeof stored === "object" ? stored : {};
    const id = String(cookieStoreId || "");
    const patch = {};
    if (!id) return patch;

    if (Array.isArray(values.promotedProxyContainerIds) &&
        values.promotedProxyContainerIds.map(String).includes(id)) {
      patch.promotedProxyContainerIds =
        values.promotedProxyContainerIds.map(String).filter((entry) => entry !== id);
    }

    for (const key of ["containerUserAgents", "containerDisplayIconOverrides"]) {
      const map = values[key];
      if (map && typeof map === "object" && !Array.isArray(map) && id in map) {
        const next = { ...map };
        delete next[id];
        patch[key] = next;
      }
    }

    for (const key of Object.keys(values)) {
      if (KEYBOARD_SHORTCUT_KEY.test(key) && values[key] === id) {
        patch[key] = "none";
      }
    }
    return patch;
  }

  // Enough to cover any realistic history while staying well inside the 8 KB
  // storage.sync per-item quota.
  const MAX_DELETED_PRESET_IDS = 200;

  /** Preset ids present before a change and gone after it. */
  function removedPresetIds(oldPresets, newPresets) {
    const next = new Set((Array.isArray(newPresets) ? newPresets : [])
      .map((preset) => preset && preset.id).filter(Boolean));
    return (Array.isArray(oldPresets) ? oldPresets : [])
      .map((preset) => preset && preset.id)
      .filter((id) => id && !next.has(id));
  }

  /** Add tombstones, newest last, capped so the list cannot outgrow sync quota. */
  function addPresetTombstones(existing, ids) {
    const list = (Array.isArray(existing) ? existing : []).filter((id) => !ids.includes(id));
    return list.concat(ids).slice(-MAX_DELETED_PRESET_IDS);
  }

  /**
   * Merge synced and local proxy presets.
   *
   * Without tombstones a deletion never stuck across devices: device A drops
   * preset P, device B still has P locally and merges it back, then backs the
   * merged list up and A picks P up again. Anything tombstoned is dropped
   * from both sides. Synced order wins; local-only presets follow.
   */
  function mergeProxyPresets(syncPresets, localPresets, deletedIds, isValid) {
    const deleted = new Set(Array.isArray(deletedIds) ? deletedIds : []);
    const valid = typeof isValid === "function" ? isValid : () => true;
    const fromSync = (Array.isArray(syncPresets) ? syncPresets : [])
      .filter((preset) => valid(preset) && !deleted.has(preset.id));
    const seen = new Set(fromSync.map((preset) => preset.id));
    const localOnly = (Array.isArray(localPresets) ? localPresets : [])
      .filter((preset) => preset && !seen.has(preset.id) && !deleted.has(preset.id));
    return fromSync.concat(localOnly);
  }

  /**
   * Whether a batch of sync changes warrants a sync run.
   *
   * Every backup rewrites this instance's heartbeat. Treating another
   * device's heartbeat as a reason to sync made two devices trigger each
   * other's full backup indefinitely.
   */
  function shouldRunSyncForCategories(categories) {
    const list = Array.from(categories || []);
    return list.some((category) => category !== "instance");
  }

  // Strip a password out of a proxy URL while leaving the username in place.
  // Anchored on the authority section so an "@" inside a query string is not
  // mistaken for credentials.
  function sanitizeGlobalProxyUrl(rawUrl) {
    const raw = String(rawUrl || "").trim();
    if (!raw) return "";
    return raw.replace(/(\/\/[^:@/]+):[^@/]*@/, "$1@");
  }

  function sanitizePromotedProxyContainerIds(rawIds) {
    if (!Array.isArray(rawIds)) {
      return [];
    }
    const seen = new Set();
    const result = [];
    for (const id of rawIds) {
      const value = String(id || "");
      if (value && !seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Decide what hiding a container should do with each of its tabs.
   *
   * Hiding must round-trip: whatever gets closed has to come back on un-hide.
   * Only http(s) tabs can be reopened by the extension, so anything else is
   * left alone rather than closed and lost — except blank new-tab pages, which
   * are safe to close because there is nothing in them to restore.
   *
   * @param {Array<{id: number, url: string}>} tabs
   * @param {Set<string>|Array<string>} newTabPages URLs treated as blank.
   * @returns {{toStore: object[], toClose: object[], toLeaveOpen: object[]}}
   */
  function partitionTabsForHide(tabs, newTabPages) {
    const list = Array.isArray(tabs) ? tabs : [];
    const blanks = newTabPages instanceof Set
      ? newTabPages
      : new Set(Array.isArray(newTabPages) ? newTabPages : []);

    const toStore = [];
    const toClose = [];
    const toLeaveOpen = [];

    for (const tab of list) {
      const url = String((tab && tab.url) || "");
      if (url.startsWith("http://") || url.startsWith("https://")) {
        toStore.push(tab);
        toClose.push(tab);
      } else if (blanks.has(url)) {
        toClose.push(tab);
      } else {
        toLeaveOpen.push(tab);
      }
    }

    return { toStore, toClose, toLeaveOpen };
  }

  // Build the hostname portion of a site-assignment storage key.
  //
  // Characters outside the allowed set used to be deleted, which let two
  // different hostnames collapse onto one key — and site assignments decide
  // which container a site opens in, so a collision opens a site in the wrong
  // container. Escaping instead of dropping keeps distinct hosts distinct.
  // Hostnames that need no escaping produce byte-identical keys to before, so
  // existing assignments keep working.
  function sanitizeHostnameForStoreKey(hostname) {
    return String(hostname || "").replace(
      /[^a-z0-9.-]/gi,
      (char) => `~${char.charCodeAt(0).toString(16)}`
    );
  }

  // Comparator for the container ordering used by "sort tabs by container".
  // Values arrive either as container id strings ("1", "10") or as numbers
  // from the stored `container-order` map, so numeric ordering wins when both
  // sides look numeric and a locale compare handles the rest. Returning a
  // number (rather than a boolean) is what makes Array#sort well-defined.
  function compareContainerOrder(a, b) {
    const numA = toContainerOrderNumber(a);
    const numB = toContainerOrderNumber(b);

    if (numA !== null && numB !== null) {
      return numA - numB;
    }
    // Anything we can't read as a position sorts after the ones we can.
    if (numA !== null) return -1;
    if (numB !== null) return 1;

    return String(a).localeCompare(String(b));
  }

  function toContainerOrderNumber(value) {
    // getUserContextIdFromCookieStoreId reports `false` for the default
    // container, which is user context 0 and belongs at the front.
    if (value === false) return 0;
    if (value === null || value === undefined || value === "") return null;

    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function resolveUserAgentSelection(savedUserAgent, availableUserAgents) {
    const saved = String(savedUserAgent || "");
    const list = Array.isArray(availableUserAgents) ? availableUserAgents : [];

    if (!saved) {
      return {
        selectValue: "",
        customValue: "",
        isCustom: false,
      };
    }

    if (list.includes(saved)) {
      return {
        selectValue: saved,
        customValue: "",
        isCustom: false,
      };
    }

    return {
      selectValue: "custom",
      customValue: saved,
      isCustom: true,
    };
  }

  return {
    computeSiteIsolationMutation,
    getNativeMessagingPermissionPlan,
    sanitizeHiddenTab,
    shouldEnablePaintBurpAfterProxy,
    shouldAllowGlobalProxyFallback,
    countVisibleAndHiddenTabs,
    buildHiddenTabCreateProperties,
    compareContainerOrder,
    sanitizeHostnameForStoreKey,
    partitionTabsForHide,
    isSiteStoreKey,
    buildSiteStoreKey,
    getHostnameFromSiteStoreKey,
    selectEndpointScanKeysToRemove,
    sanitizeGlobalProxyUrl,
    isSameProxyEndpoint,
    planContainerSettingsCleanup,
    removedPresetIds,
    addPresetTombstones,
    mergeProxyPresets,
    shouldRunSyncForCategories,
    sanitizePromotedProxyContainerIds,
    resolveUserAgentSelection,
  };
});
