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
    isSiteStoreKey,
    buildSiteStoreKey,
    getHostnameFromSiteStoreKey,
    selectEndpointScanKeysToRemove,
    sanitizeGlobalProxyUrl,
    sanitizePromotedProxyContainerIds,
    resolveUserAgentSelection,
  };
});
