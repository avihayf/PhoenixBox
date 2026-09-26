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

  /**
   * Whether a runtime message came from one of the extension's own pages.
   *
   * Every legitimate caller is an extension page (popup, options, page
   * action, confirm page). The content script, which runs in every web page's
   * process, sends nothing, so anything from a web-page URL is refused —
   * several handlers are strong primitives (repoint the global proxy, open any
   * URL in any container, write an arbitrary storage key via setShortcut).
   */
  function isExtensionPageSender(sender, extensionId, extensionBaseUrl) {
    if (!sender || typeof sender !== "object") return false;
    if (extensionId && sender.id !== extensionId) return false;
    const base = String(extensionBaseUrl || "");
    return !!base && String(sender.url || "").startsWith(base);
  }

  /**
   * Whether a proxy.onRequest request was made by this extension itself (the
   * popup's User-Agent list download, for instance). Firefox tags those with
   * cookieStoreId "firefox-default", so without this check they took the
   * global proxy and failed whenever Burp was not running.
   *
   * A page load in a tab is never "own", even when the extension started it:
   * browser.tabs.create({ cookieStoreId, url }) and tabs.update give the
   * navigation the extension as originUrl, and treating it as own sent the
   * first load of a reopened site DIRECT, past Burp and the container proxy.
   */
  function isOwnExtensionRequest(requestInfo, extensionBaseUrl) {
    if (!requestInfo || typeof requestInfo !== "object") return false;
    const base = String(extensionBaseUrl || "");
    if (!base) return false;
    const inTab = typeof requestInfo.tabId === "number" && requestInfo.tabId !== -1;
    if (inTab && DOCUMENT_REQUEST_TYPES.has(requestInfo.type)) return false;
    return [requestInfo.originUrl, requestInfo.documentUrl]
      .some((url) => String(url || "").startsWith(base));
  }

  const DOCUMENT_REQUEST_TYPES = new Set(["main_frame", "sub_frame"]);

  const SHORTCUT_ID = /^open_container_\d$/;
  const CONTAINER_OR_NONE = /^(none|firefox-container-\d+)$/;

  /** A keyboard-shortcut write must name a shortcut slot and a container. */
  function isValidShortcutAssignment(shortcut, cookieStoreId) {
    return SHORTCUT_ID.test(String(shortcut || "")) &&
      CONTAINER_OR_NONE.test(String(cookieStoreId || ""));
  }

  // Icons Firefox's contextualIdentities API accepts. Anything else (the
  // security icons below) is kept as a PhoenixBox display override and shown
  // to Firefox as "fingerprint".
  const FIREFOX_CONTAINER_ICONS = [
    "fingerprint", "briefcase", "dollar", "cart", "circle", "gift",
    "vacation", "food", "fruit", "pet", "tree", "chill", "fence",
  ];

  // Defaults for the four containers a fresh profile starts with. Applied
  // once, by the startup migration; after that the user's own choices stand.
  const SECURITY_PROFILES = {
    1: { name: "Attacker", color: "red", icon: "skull" },
    2: { name: "Victim", color: "orange", icon: "user-x" },
    3: { name: "Admin", color: "green", icon: "user-cog" },
    4: { name: "Member", color: "yellow", icon: "user-minus" },
  };

  const LEGACY_PROFILE_NAMES = {
    Personal: 1, Work: 2, Banking: 3, Shopping: 4,
  };

  /** The icon to give Firefox for a chosen icon. */
  function firefoxIconFor(icon) {
    return FIREFOX_CONTAINER_ICONS.includes(icon) ? icon : "fingerprint";
  }

  /**
   * Plan the one-time normalization of a profile's containers.
   *
   * Before the migration flag is set: give containers 1-4 their security
   * profile name, colour and display icon, and rename Firefox's stock
   * Personal/Work/Banking/Shopping. Every run: record a custom icon Firefox
   * cannot hold as a display override and show Firefox "fingerprint".
   *
   * It used to force the names on every startup (reverting the user's
   * renames) while the popup separately forced colours and icons on every
   * open, and the two disagreed about container 1's Firefox icon.
   *
   * @returns {{updates: Array<{cookieStoreId: string, patch: object}>,
   *            overrides: object, overridesChanged: boolean}}
   */
  function planProfileNormalization(identities, overrides, migrated) {
    const prefix = "firefox-container-";
    const nextOverrides = overrides && typeof overrides === "object" ? { ...overrides } : {};
    let overridesChanged = false;
    const updates = [];

    for (const identity of (Array.isArray(identities) ? identities : [])) {
      const id = String((identity && identity.cookieStoreId) || "");
      if (!id.startsWith(prefix)) continue;
      const patch = {};

      if (!migrated) {
        const num = Number(id.slice(prefix.length));
        const profile = SECURITY_PROFILES[num] ||
          SECURITY_PROFILES[LEGACY_PROFILE_NAMES[identity.name]];
        const isDefaultSlot = !!SECURITY_PROFILES[num];
        if (profile && (isDefaultSlot || LEGACY_PROFILE_NAMES[identity.name])) {
          if (identity.name !== profile.name) patch.name = profile.name;
          if (identity.color !== profile.color) patch.color = profile.color;
          if (!nextOverrides[id]) {
            nextOverrides[id] = profile.icon;
            overridesChanged = true;
          }
        }
      }

      if (identity.icon && !FIREFOX_CONTAINER_ICONS.includes(identity.icon)) {
        if (!nextOverrides[id]) {
          nextOverrides[id] = identity.icon;
          overridesChanged = true;
        }
        patch.icon = "fingerprint";
      }

      if (Object.keys(patch).length) updates.push({ cookieStoreId: id, patch });
    }
    return { updates, overrides: nextOverrides, overridesChanged };
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
    isExtensionPageSender,
    isOwnExtensionRequest,
    isValidShortcutAssignment,
    FIREFOX_CONTAINER_ICONS,
    SECURITY_PROFILES,
    firefoxIconFor,
    planProfileNormalization,
    sanitizePromotedProxyContainerIds,
    resolveUserAgentSelection,
  };
});
