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

  function shouldAllowGlobalProxyFallback(cookieStoreId, promotedProxyContainerId) {
    const promoted = String(promotedProxyContainerId || "");
    if (!promoted) {
      return true;
    }
    return String(cookieStoreId || "") === promoted;
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
    resolveUserAgentSelection,
  };
});
