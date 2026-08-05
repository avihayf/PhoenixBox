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
