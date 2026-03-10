(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PhoenixBoxPageActionHelpers = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  function buildAlwaysOpenEntries(identities) {
    const list = Array.isArray(identities) ? identities : [];
    return [
      { type: "default" },
      ...list.map((identity) => ({ type: "container", identity })),
    ];
  }

  function getDefaultAssignmentPayload(tab) {
    return {
      tabId: tab?.id ?? false,
      url: tab?.url || "",
      userContextId: false,
      value: true,
    };
  }

  return {
    buildAlwaysOpenEntries,
    getDefaultAssignmentPayload,
  };
});
