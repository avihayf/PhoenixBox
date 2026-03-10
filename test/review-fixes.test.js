const { expect } = require("chai");

const {
  computeSiteIsolationMutation,
  getNativeMessagingPermissionPlan,
  sanitizeHiddenTab,
  shouldEnablePaintBurpAfterProxy,
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
