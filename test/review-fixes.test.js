const { expect } = require("chai");

const {
  computeSiteIsolationMutation,
  getNativeMessagingPermissionPlan,
  sanitizeHiddenTab,
  shouldEnablePaintBurpAfterProxy,
  shouldAllowGlobalProxyFallback,
  countVisibleAndHiddenTabs,
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
      expect(shouldAllowGlobalProxyFallback("firefox-container-1", "")).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-2", null)).to.equal(true);
    });

    it("allows global fallback only for the promoted container", () => {
      const promoted = "firefox-container-2";
      expect(shouldAllowGlobalProxyFallback("firefox-container-2", promoted)).to.equal(true);
      expect(shouldAllowGlobalProxyFallback("firefox-container-1", promoted)).to.equal(false);
      expect(shouldAllowGlobalProxyFallback("firefox-container-3", promoted)).to.equal(false);
    });
  });

  describe("countVisibleAndHiddenTabs", () => {
    it("counts visible and hidden tabs together", () => {
      expect(countVisibleAndHiddenTabs([{ id: 1 }, { id: 2 }], [{ id: 3 }])).to.equal(3);
      expect(countVisibleAndHiddenTabs([], [{ id: 3 }, { id: 4 }])).to.equal(2);
      expect(countVisibleAndHiddenTabs([{ id: 1 }], null)).to.equal(1);
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
