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
    resolveUserAgentSelection,
  };
});
