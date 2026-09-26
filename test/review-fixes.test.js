const { expect } = require("chai");

const {
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
  isSameProxyEndpoint,
  planContainerSettingsCleanup,
  removedPresetIds,
  addPresetTombstones,
  mergeProxyPresets,
  shouldRunSyncForCategories,
  isExtensionPageSender,
  isOwnExtensionRequest,
  isValidShortcutAssignment,
  planProfileNormalization,
  isSiteStoreKey,
  buildSiteStoreKey,
  getHostnameFromSiteStoreKey,
  selectEndpointScanKeysToRemove,
  sanitizeGlobalProxyUrl,
  sanitizePromotedProxyContainerIds,
  resolveUserAgentSelection,
} = require("../src/js/shared/reviewHelpers");

describe("reviewHelpers", () => {
  describe("computeSiteIsolationMutation", () => {
    it("does nothing when isolation is already disabled", () => {
      expect(computeSiteIsolationMutation(false, false)).to.deep.equal({
        shouldMutate: false,
        remove: false,
      });
    });

    it("enables isolation when requested from an unlocked container", () => {
      expect(computeSiteIsolationMutation(false, true)).to.deep.equal({
        shouldMutate: true,
        remove: false,
      });
    });

    it("disables isolation when requested from a locked container", () => {
      expect(computeSiteIsolationMutation(true, false)).to.deep.equal({
        shouldMutate: true,
        remove: true,
      });
    });

    it("does nothing when isolation is already enabled", () => {
      expect(computeSiteIsolationMutation(true, true)).to.deep.equal({
        shouldMutate: false,
        remove: false,
      });
    });
  });

  describe("getNativeMessagingPermissionPlan", () => {
    it("does not clear vpn proxies when native messaging is granted", () => {
      expect(getNativeMessagingPermissionPlan(true)).to.deep.equal({
        clearVpnProxies: false,
        reloadExtension: false,
      });
    });

    it("clears vpn proxies and reloads when native messaging is revoked", () => {
      expect(getNativeMessagingPermissionPlan(false)).to.deep.equal({
        clearVpnProxies: true,
        reloadExtension: true,
      });
    });
  });

  describe("sanitizeHiddenTab", () => {
    it("keeps only minimal restore fields while preserving the full restore URL", () => {
      const sanitized = sanitizeHiddenTab({
        id: 10,
        title: "Admin callback",
        url: "https://internal.example.test/callback?token=secret#frag",
        favIconUrl: "https://internal.example.test/favicon.ico",
        cookieStoreId: "firefox-container-2",
        active: true,
        pinned: true,
        discarded: false,
      });

      expect(sanitized).to.deep.equal({
        active: false,
        cookieStoreId: "firefox-container-2",
        discarded: false,
        favIconUrl: "https://internal.example.test/favicon.ico",
        hiddenState: true,
        pinned: true,
        title: "Admin callback",
        url: "https://internal.example.test/callback?token=secret#frag",
      });
    });
  });

  describe("shouldEnablePaintBurpAfterProxy", () => {
    it("enables Paint the Burp only when proxy activation succeeded", () => {
      expect(shouldEnablePaintBurpAfterProxy(true, true)).to.equal(true);
      expect(shouldEnablePaintBurpAfterProxy(true, false)).to.equal(false);
      expect(shouldEnablePaintBurpAfterProxy(false, true)).to.equal(false);
    });
  });

  describe("shouldAllowGlobalProxyFallback", () => {
    it("allows global fallback when no container is promoted", () => {
      expect(shouldAllowGlobalProxyFallback("firefox-container-1", [])).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-2", null)).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-3", undefined)).to.equal(true);
    });

    it("allows global fallback only for the promoted container", () => {
      const promoted = ["firefox-container-2"];
      expect(shouldAllowGlobalProxyFallback("firefox-container-2", promoted)).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-1", promoted)).to.equal(false);
      expect(shouldAllowGlobalProxyFallback("firefox-container-3", promoted)).to.equal(false);
    });

    it("allows global fallback for every promoted container when multiple are promoted", () => {
      const promoted = ["firefox-container-2", "firefox-container-4"];
      expect(shouldAllowGlobalProxyFallback("firefox-container-2", promoted)).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-4", promoted)).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-1", promoted)).to.equal(false);
      expect(shouldAllowGlobalProxyFallback("firefox-container-3", promoted)).to.equal(false);
    });

    it("tolerates a legacy single promoted container string", () => {
      expect(shouldAllowGlobalProxyFallback("firefox-container-2", "firefox-container-2")).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-1", "firefox-container-2")).to.equal(false);
      expect(shouldAllowGlobalProxyFallback("firefox-container-1", "")).to.equal(true);
    });
  });

  describe("countVisibleAndHiddenTabs", () => {
    it("counts visible and hidden tabs together", () => {
      expect(countVisibleAndHiddenTabs([{ id: 1 }, { id: 2 }], [{ id: 3 }])).to.equal(3);
      expect(countVisibleAndHiddenTabs([], [{ id: 3 }, { id: 4 }])).to.equal(2);
      expect(countVisibleAndHiddenTabs([{ id: 1 }], null)).to.equal(1);
    });
  });

  describe("buildHiddenTabCreateProperties", () => {
    it("includes the stored title when re-creating a discarded tab", () => {
      const props = buildHiddenTabCreateProperties({
        url: "https://example.test/page",
        title: "Example Page",
        discarded: true,
        pinned: false,
        active: false,
        cookieStoreId: "firefox-container-2",
      });

      expect(props).to.deep.equal({
        url: "https://example.test/page",
        active: false,
        discarded: true,
        pinned: false,
        cookieStoreId: "firefox-container-2",
        title: "Example Page",
      });
    });

    it("falls back to the URL as title when a discarded tab has no stored title", () => {
      const props = buildHiddenTabCreateProperties({
        url: "https://example.test/page",
        title: "",
        discarded: true,
        cookieStoreId: "firefox-container-2",
      });

      // Firefox rejects a discarded tab created with a URL but no title, so a
      // non-empty title must always be present on the discarded path.
      expect(props.title).to.equal("https://example.test/page");
      expect(props.discarded).to.equal(true);
    });

    it("omits title entirely for non-discarded (e.g. pinned) tabs", () => {
      const props = buildHiddenTabCreateProperties({
        url: "https://example.test/page",
        title: "Example Page",
        discarded: false,
        pinned: true,
        cookieStoreId: "firefox-container-2",
      });

      // `title` is only allowed when discarded is true; setting it otherwise
      // makes tabs.create reject.
      expect(props).to.not.have.property("title");
      expect(props.pinned).to.equal(true);
    });
  });

  describe("compareContainerOrder", () => {
    it("orders container ids numerically rather than as strings", () => {
      expect(["10", "9", "1"].sort(compareContainerOrder)).to.deep.equal(["1", "9", "10"]);
    });

    it("returns a negative, zero, or positive number as sort requires", () => {
      expect(compareContainerOrder(1, 2)).to.be.below(0);
      expect(compareContainerOrder(2, 1)).to.be.above(0);
      expect(compareContainerOrder(2, 2)).to.equal(0);
    });

    it("mixes stored numeric ordering with container id strings", () => {
      expect(["3", -1, "2"].sort(compareContainerOrder)).to.deep.equal([-1, "2", "3"]);
    });

    it("sorts the default container (reported as false) first", () => {
      expect(compareContainerOrder(false, "2")).to.be.below(0);
      expect(compareContainerOrder("2", false)).to.be.above(0);
      expect(["2", false, "1"].sort(compareContainerOrder)).to.deep.equal([false, "1", "2"]);
    });

    it("sorts unreadable positions after readable ones", () => {
      expect(compareContainerOrder("2", undefined)).to.be.below(0);
      expect(compareContainerOrder(undefined, "2")).to.be.above(0);
    });
  });

  describe("sanitizeHostnameForStoreKey", () => {
    it("leaves ordinary hostnames byte-identical so existing keys still match", () => {
      expect(sanitizeHostnameForStoreKey("sub.example.com")).to.equal("sub.example.com");
      expect(sanitizeHostnameForStoreKey("xn--bcher-kva.example")).to.equal("xn--bcher-kva.example");
    });

    it("escapes disallowed characters instead of dropping them", () => {
      expect(sanitizeHostnameForStoreKey("a_b.com")).to.equal("a~5fb.com");
    });

    it("keeps hostnames distinct that the old sanitizer collapsed together", () => {
      expect(sanitizeHostnameForStoreKey("a_b.com"))
        .to.not.equal(sanitizeHostnameForStoreKey("ab.com"));
    });

    it("handles empty and nullish input", () => {
      expect(sanitizeHostnameForStoreKey("")).to.equal("");
      expect(sanitizeHostnameForStoreKey(null)).to.equal("");
      expect(sanitizeHostnameForStoreKey(undefined)).to.equal("");
    });
  });

  describe("isSameProxyEndpoint", () => {
    const base = { type: "socks", host: "10.0.0.1", port: 1080, username: "u" };

    it("matches the same endpoint and user, ignoring host case and port type", () => {
      expect(isSameProxyEndpoint(base, { ...base, host: "10.0.0.1", port: "1080" })).to.equal(true);
      expect(isSameProxyEndpoint({ ...base, host: "Proxy.Local" }, { ...base, host: "proxy.local" }))
        .to.equal(true);
    });

    // Anything else means the in-memory password belongs to another proxy.
    it("differs on type, host, port or username", () => {
      expect(isSameProxyEndpoint(base, { ...base, type: "http" })).to.equal(false);
      expect(isSameProxyEndpoint(base, { ...base, host: "10.0.0.2" })).to.equal(false);
      expect(isSameProxyEndpoint(base, { ...base, port: 1081 })).to.equal(false);
      expect(isSameProxyEndpoint(base, { ...base, username: "v" })).to.equal(false);
    });

    it("never matches a missing config", () => {
      expect(isSameProxyEndpoint(base, null)).to.equal(false);
      expect(isSameProxyEndpoint(null, null)).to.equal(false);
    });
  });

  describe("planContainerSettingsCleanup", () => {
    const stored = () => ({
      promotedProxyContainerIds: ["firefox-container-4", "firefox-container-5"],
      containerUserAgents: { "firefox-container-4": "UA", "firefox-container-5": "UA2" },
      containerDisplayIconOverrides: { "firefox-container-4": "skull" },
      open_container_0: "firefox-container-4",
      open_container_1: "firefox-container-5",
    });

    // A stale promoted ID matches nothing, which silently routes every
    // container DIRECT while the global proxy still shows as on.
    it("removes the deleted container from the promoted-proxy list", () => {
      expect(planContainerSettingsCleanup(stored(), "firefox-container-4").promotedProxyContainerIds)
        .to.deep.equal(["firefox-container-5"]);
    });

    it("removes its User-Agent and icon override, keeping the others", () => {
      const patch = planContainerSettingsCleanup(stored(), "firefox-container-4");
      expect(patch.containerUserAgents).to.deep.equal({ "firefox-container-5": "UA2" });
      expect(patch.containerDisplayIconOverrides).to.deep.equal({});
    });

    it("clears only the shortcuts that pointed at it", () => {
      const patch = planContainerSettingsCleanup(stored(), "firefox-container-4");
      expect(patch.open_container_0).to.equal("none");
      expect(patch).to.not.have.property("open_container_1");
    });

    it("returns an empty patch when nothing refers to the container", () => {
      expect(planContainerSettingsCleanup(stored(), "firefox-container-9")).to.deep.equal({});
      expect(planContainerSettingsCleanup({}, "firefox-container-4")).to.deep.equal({});
      expect(planContainerSettingsCleanup(stored(), "")).to.deep.equal({});
      expect(planContainerSettingsCleanup(null, "firefox-container-4")).to.deep.equal({});
    });

    it("does not mutate the stored objects it was given", () => {
      const input = stored();
      planContainerSettingsCleanup(input, "firefox-container-4");
      expect(input).to.deep.equal(stored());
    });
  });

  describe("proxy preset sync", () => {
    const P = (id) => ({ id, name: id, scheme: "http", host: "h", port: 1 });

    it("finds the presets a change removed", () => {
      expect(removedPresetIds([P("a"), P("b"), P("c")], [P("a"), P("c")])).to.deep.equal(["b"]);
      expect(removedPresetIds(undefined, [P("a")])).to.deep.equal([]);
      expect(removedPresetIds([P("a")], undefined)).to.deep.equal(["a"]);
    });

    it("caps the tombstone list and keeps the newest", () => {
      const many = Array.from({ length: 250 }, (_, i) => `id${i}`);
      const out = addPresetTombstones([], many);
      expect(out).to.have.lengthOf(200);
      expect(out[out.length - 1]).to.equal("id249");
      expect(addPresetTombstones(["a", "b"], ["a"])).to.deep.equal(["b", "a"]);
    });

    // The bug: B still held P locally, merged it back, backed it up, and A
    // picked it up again — deletions never stuck with two devices.
    it("does not resurrect a preset deleted on another device", () => {
      const merged = mergeProxyPresets([P("q")], [P("q"), P("p")], ["p"]);
      expect(merged.map((x) => x.id)).to.deep.equal(["q"]);
    });

    it("keeps local-only presets that were never deleted", () => {
      expect(mergeProxyPresets([P("q")], [P("q"), P("new")], []).map((x) => x.id))
        .to.deep.equal(["q", "new"]);
    });

    it("drops synced presets that fail validation", () => {
      const merged = mergeProxyPresets([P("q"), { id: "bad" }], [], [], (p) => !!p.host);
      expect(merged.map((x) => x.id)).to.deep.equal(["q"]);
    });

    // Every backup rewrites the heartbeat; reacting to another device's
    // heartbeat made two devices trigger each other forever.
    it("ignores heartbeat-only sync changes", () => {
      expect(shouldRunSyncForCategories(new Set(["instance"]))).to.equal(false);
      expect(shouldRunSyncForCategories(new Set())).to.equal(false);
      expect(shouldRunSyncForCategories(new Set(["instance", "presets"]))).to.equal(true);
      expect(shouldRunSyncForCategories(new Set(["identities"]))).to.equal(true);
    });
  });

  describe("isOwnExtensionRequest", () => {
    const BASE = "moz-extension://abc123/";

    it("matches a fetch made from the popup or background page", () => {
      expect(isOwnExtensionRequest({
        cookieStoreId: "firefox-default",
        tabId: -1,
        originUrl: "moz-extension://abc123/popup/index.html",
        url: "https://cdn.jsdelivr.net/gh/x/src/index.json",
      }, BASE)).to.equal(true);
      expect(isOwnExtensionRequest({
        documentUrl: "moz-extension://abc123/_generated_background_page.html",
      }, BASE)).to.equal(true);
    });

    it("matches a background fetch that is not tied to any tab", () => {
      expect(isOwnExtensionRequest({
        tabId: -1,
        frameId: 0,
        type: "xmlhttprequest",
        originUrl: "moz-extension://abc123/_generated_background_page.html",
        documentUrl: "moz-extension://abc123/_generated_background_page.html",
        url: "http://127.0.0.1:8079/v1/sync",
      }, BASE)).to.equal(true);
    });

    it("matches a fetch from an extension page open in a tab", () => {
      expect(isOwnExtensionRequest({
        tabId: 7,
        type: "xmlhttprequest",
        originUrl: "moz-extension://abc123/options.html",
        documentUrl: "moz-extension://abc123/options.html",
      }, BASE)).to.equal(true);
    });

    it("does not match a tab navigation the extension started", () => {
      // browser.tabs.create({ cookieStoreId, url }) / tabs.update: the page
      // load carries the extension as its origin but is container browsing.
      expect(isOwnExtensionRequest({
        tabId: 12,
        frameId: 0,
        type: "main_frame",
        cookieStoreId: "firefox-container-3",
        originUrl: "moz-extension://abc123/_generated_background_page.html",
        url: "https://target.example/",
      }, BASE)).to.equal(false);
      expect(isOwnExtensionRequest({
        tabId: 12,
        frameId: 4,
        type: "sub_frame",
        originUrl: "moz-extension://abc123/confirm-page.html",
        documentUrl: "moz-extension://abc123/confirm-page.html",
        url: "https://target.example/frame",
      }, BASE)).to.equal(false);
    });

    it("does not match website traffic, service workers or other extensions", () => {
      expect(isOwnExtensionRequest({ originUrl: "https://example.com/sw.js" }, BASE)).to.equal(false);
      expect(isOwnExtensionRequest({ originUrl: "moz-extension://other/page.html" }, BASE)).to.equal(false);
      expect(isOwnExtensionRequest({}, BASE)).to.equal(false);
      expect(isOwnExtensionRequest({ originUrl: "moz-extension://abc123/x" }, "")).to.equal(false);
      expect(isOwnExtensionRequest(null, BASE)).to.equal(false);
    });
  });

  describe("isExtensionPageSender", () => {
    const ID = "phoenix-box@0xr3db0mb.com";
    const BASE = "moz-extension://abc123/";

    it("accepts the extension's own pages", () => {
      expect(isExtensionPageSender({ id: ID, url: BASE + "popup/index.html" }, ID, BASE)).to.equal(true);
      expect(isExtensionPageSender({ id: ID, url: BASE + "confirm-page.html?url=x" }, ID, BASE)).to.equal(true);
    });

    // Content scripts carry the extension's id but the web page's URL.
    it("refuses a sender running in a web page", () => {
      expect(isExtensionPageSender({ id: ID, url: "https://evil.test/" }, ID, BASE)).to.equal(false);
    });

    it("refuses another extension, or a URL that merely contains ours", () => {
      expect(isExtensionPageSender({ id: "other@x", url: BASE + "p.html" }, ID, BASE)).to.equal(false);
      expect(isExtensionPageSender({ id: ID, url: "https://x.test/?" + BASE }, ID, BASE)).to.equal(false);
    });

    it("refuses when there is nothing to compare against", () => {
      expect(isExtensionPageSender(null, ID, BASE)).to.equal(false);
      expect(isExtensionPageSender({ id: ID }, ID, BASE)).to.equal(false);
      expect(isExtensionPageSender({ id: ID, url: BASE }, ID, "")).to.equal(false);
    });
  });

  describe("isValidShortcutAssignment", () => {
    it("accepts a shortcut slot and a container or none", () => {
      expect(isValidShortcutAssignment("open_container_0", "firefox-container-3")).to.equal(true);
      expect(isValidShortcutAssignment("open_container_9", "none")).to.equal(true);
    });

    // Otherwise setShortcut writes any value to any storage.local key.
    it("refuses any other storage key or value", () => {
      expect(isValidShortcutAssignment("globalProxyParsed", "firefox-container-1")).to.equal(false);
      expect(isValidShortcutAssignment("open_container_10", "none")).to.equal(false);
      expect(isValidShortcutAssignment("open_container_1", "http://x")).to.equal(false);
      expect(isValidShortcutAssignment("open_container_1", undefined)).to.equal(false);
    });
  });

  describe("planProfileNormalization", () => {
    const C = (n, name, color, icon) => ({ cookieStoreId: `firefox-container-${n}`, name, color, icon });
    const stock = () => [
      C(1, "Personal", "blue", "fingerprint"),
      C(2, "Work", "orange", "briefcase"),
      C(3, "Banking", "green", "dollar"),
      C(4, "Shopping", "pink", "cart"),
    ];

    it("gives a fresh profile its security names, colours and icons once", () => {
      const plan = planProfileNormalization(stock(), {}, false);
      const byId = Object.fromEntries(plan.updates.map((u) => [u.cookieStoreId, u.patch]));
      expect(byId["firefox-container-1"]).to.deep.equal({ name: "Attacker", color: "red" });
      expect(byId["firefox-container-4"]).to.deep.equal({ name: "Member", color: "yellow" });
      expect(plan.overrides).to.deep.equal({
        "firefox-container-1": "skull",
        "firefox-container-2": "user-x",
        "firefox-container-3": "user-cog",
        "firefox-container-4": "user-minus",
      });
    });

    // It used to force names on every startup and the popup forced colours on
    // every open, so a user's own choices never stuck.
    it("leaves a migrated profile's names, colours and icons alone", () => {
      const edited = [C(1, "Red Team", "blue", "briefcase"), C(2, "Victim", "purple", "fence")];
      const plan = planProfileNormalization(edited, { "firefox-container-1": "briefcase" }, true);
      expect(plan.updates).to.deep.equal([]);
      expect(plan.overridesChanged).to.equal(false);
    });

    it("always shows Firefox fingerprint for an icon it cannot hold", () => {
      const plan = planProfileNormalization([C(7, "Recon", "blue", "skull")], {}, true);
      expect(plan.updates).to.deep.equal([{ cookieStoreId: "firefox-container-7", patch: { icon: "fingerprint" } }]);
      expect(plan.overrides["firefox-container-7"]).to.equal("skull");
    });

    it("does not clobber an existing icon override", () => {
      const plan = planProfileNormalization(stock(), { "firefox-container-1": "briefcase" }, false);
      expect(plan.overrides["firefox-container-1"]).to.equal("briefcase");
    });

    it("ignores the default container and junk", () => {
      const plan = planProfileNormalization(
        [{ cookieStoreId: "firefox-default", name: "x", icon: "skull" }, null], {}, false);
      expect(plan.updates).to.deep.equal([]);
    });
  });

  describe("partitionTabsForHide", () => {
    const NEW_TAB_PAGES = new Set([
      "about:startpage", "about:newtab", "about:home", "about:blank",
    ]);
    const part = (tabs) => partitionTabsForHide(tabs, NEW_TAB_PAGES);

    it("hides and remembers ordinary web tabs", () => {
      const tabs = [
        { id: 1, url: "https://a.test/" },
        { id: 2, url: "http://b.test/x" },
      ];
      const { toStore, toClose, toLeaveOpen } = part(tabs);
      expect(toStore.map((t) => t.id)).to.deep.equal([1, 2]);
      expect(toClose.map((t) => t.id)).to.deep.equal([1, 2]);
      expect(toLeaveOpen).to.deep.equal([]);
    });

    // The invariant the whole feature rests on: un-hide must restore
    // everything hide closed, so nothing may be closed without being stored.
    it("never closes a tab it has not remembered, except blank pages", () => {
      const tabs = [
        { id: 1, url: "https://a.test/" },
        { id: 2, url: "file:///home/user/report.html" },
        { id: 3, url: "about:newtab" },
        { id: 4, url: "view-source:https://c.test/" },
        { id: 5, url: "about:reader?url=https%3A%2F%2Fd.test%2F" },
      ];
      const { toStore, toClose } = part(tabs);
      const storedIds = new Set(toStore.map((t) => t.id));
      for (const tab of toClose) {
        if (NEW_TAB_PAGES.has(tab.url)) continue;
        expect(storedIds.has(tab.id), `tab ${tab.id} closed but not stored`).to.equal(true);
      }
    });

    it("leaves tabs it cannot reopen alone rather than destroying them", () => {
      const tabs = [
        { id: 1, url: "https://a.test/" },
        { id: 2, url: "file:///home/user/report.html" },
        { id: 3, url: "view-source:https://c.test/" },
      ];
      const { toClose, toLeaveOpen } = part(tabs);
      expect(toClose.map((t) => t.id)).to.deep.equal([1]);
      expect(toLeaveOpen.map((t) => t.id)).to.deep.equal([2, 3]);
    });

    it("closes blank new-tab pages without storing them", () => {
      const tabs = [
        { id: 1, url: "about:newtab" },
        { id: 2, url: "about:blank" },
        { id: 3, url: "about:home" },
      ];
      const { toStore, toClose, toLeaveOpen } = part(tabs);
      expect(toStore).to.deep.equal([]);
      expect(toClose.map((t) => t.id)).to.deep.equal([1, 2, 3]);
      expect(toLeaveOpen).to.deep.equal([]);
    });

    it("accepts the new-tab pages as an array as well as a Set", () => {
      const tabs = [{ id: 1, url: "about:blank" }];
      expect(partitionTabsForHide(tabs, ["about:blank"]).toClose).to.have.lengthOf(1);
    });

    it("handles empty and malformed input", () => {
      expect(part([])).to.deep.equal({ toStore: [], toClose: [], toLeaveOpen: [] });
      expect(partitionTabsForHide(null, NEW_TAB_PAGES).toClose).to.deep.equal([]);
      expect(part([{ id: 1 }]).toLeaveOpen).to.have.lengthOf(1);
    });
  });

  describe("isSiteStoreKey", () => {
    it("recognises a real storage key", () => {
      expect(isSiteStoreKey("siteContainerMap@@_example.test")).to.equal(true);
      expect(isSiteStoreKey("siteContainerMap@@_example.test:3000")).to.equal(true);
    });

    // The reason the check is a prefix test rather than a substring test: a URL
    // carrying the sentinel in its query string must not be mistaken for a key.
    it("rejects a URL that merely contains the sentinel", () => {
      expect(isSiteStoreKey("https://x.test/?q=siteContainerMap@@_evil"))
        .to.equal(false);
    });

    it("rejects unrelated keys and plain URLs", () => {
      expect(isSiteStoreKey("identity@@_firefox-container-1")).to.equal(false);
      expect(isSiteStoreKey("https://example.test/")).to.equal(false);
      expect(isSiteStoreKey("")).to.equal(false);
    });
  });

  describe("buildSiteStoreKey", () => {
    it("omits default ports", () => {
      expect(buildSiteStoreKey("example.test", "")).to.equal("siteContainerMap@@_example.test");
      expect(buildSiteStoreKey("example.test", "80")).to.equal("siteContainerMap@@_example.test");
      expect(buildSiteStoreKey("example.test", "443")).to.equal("siteContainerMap@@_example.test");
      expect(buildSiteStoreKey("example.test", null)).to.equal("siteContainerMap@@_example.test");
    });

    it("keeps a non-default port so ports stay distinct", () => {
      expect(buildSiteStoreKey("localhost", "3000")).to.equal("siteContainerMap@@_localhost:3000");
      expect(buildSiteStoreKey("localhost", "3000"))
        .to.not.equal(buildSiteStoreKey("localhost", "8080"));
    });

    it("escapes hostnames that need it", () => {
      expect(buildSiteStoreKey("a_b.test", "")).to.equal("siteContainerMap@@_a~5fb.test");
    });

    it("produces keys that isSiteStoreKey accepts", () => {
      expect(isSiteStoreKey(buildSiteStoreKey("example.test", "8443"))).to.equal(true);
    });
  });

  describe("getHostnameFromSiteStoreKey", () => {
    it("recovers the hostname, with and without a port", () => {
      expect(getHostnameFromSiteStoreKey("siteContainerMap@@_example.test"))
        .to.equal("example.test");
      expect(getHostnameFromSiteStoreKey("siteContainerMap@@_example.test:3000"))
        .to.equal("example.test");
    });

    it("round-trips with buildSiteStoreKey", () => {
      for (const [host, port] of [["example.test", ""], ["localhost", "3000"]]) {
        expect(getHostnameFromSiteStoreKey(buildSiteStoreKey(host, port)))
          .to.equal(host);
      }
    });

    it("handles an empty key", () => {
      expect(getHostnameFromSiteStoreKey("siteContainerMap@@_")).to.equal("");
    });
  });

  describe("selectEndpointScanKeysToRemove", () => {
    const scan = (id, scannedAt) => [`endpointScanResults@@_${id}`, { scannedAt }];

    it("keeps the newest scans and prunes the rest", () => {
      const storage = Object.fromEntries([
        scan("a", 700), scan("b", 100), scan("c", 500),
        scan("d", 300), scan("e", 900), scan("f", 200), scan("g", 400),
      ]);
      expect(selectEndpointScanKeysToRemove(storage, 5).sort()).to.deep.equal([
        "endpointScanResults@@_b",
        "endpointScanResults@@_f",
      ]);
    });

    it("removes everything when keep is zero", () => {
      const storage = Object.fromEntries([scan("a", 1), scan("b", 2)]);
      expect(selectEndpointScanKeysToRemove(storage, 0)).to.have.lengthOf(2);
    });

    it("includes the legacy single-key entry when present", () => {
      const storage = { endpointScanResults: { scannedAt: 1 }, ...Object.fromEntries([scan("a", 2)]) };
      expect(selectEndpointScanKeysToRemove(storage, 5)).to.deep.equal(["endpointScanResults"]);
    });

    it("never selects unrelated storage keys", () => {
      const storage = {
        "identity@@_firefox-container-1": {},
        globalProxyUrl: "http://x:1",
        "siteContainerMap@@_example.test": {},
      };
      expect(selectEndpointScanKeysToRemove(storage, 0)).to.deep.equal([]);
    });

    // The old inline version read `.scannedAt` off whatever the key held.
    it("does not throw when a scan key holds a non-object", () => {
      const storage = {
        "endpointScanResults@@_a": null,
        "endpointScanResults@@_b": "corrupted",
        "endpointScanResults@@_c": 42,
        ...Object.fromEntries([scan("d", 900)]),
      };
      expect(() => selectEndpointScanKeysToRemove(storage, 1)).to.not.throw();
      // The one readable entry is the newest, so it is the one kept.
      expect(selectEndpointScanKeysToRemove(storage, 1))
        .to.not.include("endpointScanResults@@_d");
    });

    it("returns nothing to remove when under the cap", () => {
      expect(selectEndpointScanKeysToRemove(Object.fromEntries([scan("a", 1)]), 5))
        .to.deep.equal([]);
    });

    it("tolerates missing or malformed input", () => {
      expect(selectEndpointScanKeysToRemove(null, 5)).to.deep.equal([]);
      expect(selectEndpointScanKeysToRemove(undefined, undefined)).to.deep.equal([]);
    });
  });

  describe("sanitizeGlobalProxyUrl", () => {
    it("strips a password but keeps the username", () => {
      expect(sanitizeGlobalProxyUrl("http://user:pass@host:8080"))
        .to.equal("http://user@host:8080");
      expect(sanitizeGlobalProxyUrl("http://user:p%40ss+w.rd@host:8080"))
        .to.equal("http://user@host:8080");
    });

    it("leaves URLs without credentials untouched", () => {
      expect(sanitizeGlobalProxyUrl("http://127.0.0.1:8080"))
        .to.equal("http://127.0.0.1:8080");
      expect(sanitizeGlobalProxyUrl("http://user@host:8080"))
        .to.equal("http://user@host:8080");
    });

    // An "@" in a query string is not a credential separator.
    it("does not mangle an @ that appears after the authority", () => {
      expect(sanitizeGlobalProxyUrl("https://example.test/redirect?to=a:b@c"))
        .to.equal("https://example.test/redirect?to=a:b@c");
    });

    it("handles empty and nullish input", () => {
      expect(sanitizeGlobalProxyUrl("")).to.equal("");
      expect(sanitizeGlobalProxyUrl(null)).to.equal("");
      expect(sanitizeGlobalProxyUrl(undefined)).to.equal("");
    });
  });

  describe("sanitizePromotedProxyContainerIds", () => {
    it("stringifies, drops blanks and de-duplicates", () => {
      expect(sanitizePromotedProxyContainerIds([
        "firefox-container-1", "firefox-container-1", "", null, 2,
      ])).to.deep.equal(["firefox-container-1", "2"]);
    });

    it("returns an empty list for anything that is not an array", () => {
      expect(sanitizePromotedProxyContainerIds(null)).to.deep.equal([]);
      expect(sanitizePromotedProxyContainerIds("firefox-container-1")).to.deep.equal([]);
    });
  });

  describe("resolveUserAgentSelection", () => {
    it("keeps known user agents selected directly", () => {
      expect(resolveUserAgentSelection("UA-1", ["UA-1", "UA-2"])).to.deep.equal({
        selectValue: "UA-1",
        customValue: "",
        isCustom: false,
      });
    });

    it("preserves custom user agents outside the fetched list", () => {
      expect(resolveUserAgentSelection("Custom-UA", ["UA-1", "UA-2"])).to.deep.equal({
        selectValue: "custom",
        customValue: "Custom-UA",
        isCustom: true,
      });
    });
  });
});
