const { expect } = require("chai");

const {
  isSupportedScheme,
  hasContainerUserAgents,
  shouldListen,
  resolveUserAgent,
  buildRequestHeaders,
} = require("../src/js/shared/requestHeaderHelpers");

describe("requestHeaderHelpers", () => {
  describe("isSupportedScheme", () => {
    it("accepts the http and websocket schemes", () => {
      expect(isSupportedScheme("http://example.test/")).to.equal(true);
      expect(isSupportedScheme("https://example.test/")).to.equal(true);
      expect(isSupportedScheme("ws://example.test/")).to.equal(true);
      expect(isSupportedScheme("wss://example.test/")).to.equal(true);
    });

    it("rejects schemes that carry no container traffic", () => {
      expect(isSupportedScheme("about:blank")).to.equal(false);
      expect(isSupportedScheme("moz-extension://abc/page.html")).to.equal(false);
      expect(isSupportedScheme("file:///etc/hosts")).to.equal(false);
      expect(isSupportedScheme("data:text/html,hi")).to.equal(false);
      expect(isSupportedScheme("")).to.equal(false);
      expect(isSupportedScheme(undefined)).to.equal(false);
    });

    // webRequest normalizes schemes to lowercase; pinning this documents the
    // assumption behind the case-sensitive comparison.
    it("assumes webRequest has already lowercased the scheme", () => {
      expect(isSupportedScheme("HTTP://example.test/")).to.equal(false);
    });
  });

  describe("hasContainerUserAgents", () => {
    it("detects whether any container has its own user agent", () => {
      expect(hasContainerUserAgents({ "firefox-container-1": "UA" })).to.equal(true);
      expect(hasContainerUserAgents({})).to.equal(false);
      expect(hasContainerUserAgents(null)).to.equal(false);
      expect(hasContainerUserAgents(undefined)).to.equal(false);
    });
  });

  describe("shouldListen", () => {
    it("stays detached when nothing is configured", () => {
      expect(shouldListen({
        userAgentEnabled: false,
        globalUserAgent: null,
        containerUserAgents: {},
      })).to.equal(false);
    });

    it("attaches when the global user agent is enabled and set", () => {
      expect(shouldListen({
        userAgentEnabled: true,
        globalUserAgent: "UA",
      })).to.equal(true);
    });

    it("stays detached when the global toggle is on but no agent is chosen", () => {
      expect(shouldListen({
        userAgentEnabled: true,
        globalUserAgent: "",
      })).to.equal(false);
    });

    it("attaches for a container user agent even with the global toggle off", () => {
      expect(shouldListen({
        userAgentEnabled: false,
        containerUserAgents: { "firefox-container-2": "UA" },
      })).to.equal(true);
    });

    it("tolerates a missing state object", () => {
      expect(shouldListen(undefined)).to.equal(false);
    });
  });

  describe("resolveUserAgent", () => {
    const withContainer = {
      containerUserAgents: { "firefox-container-1": "container-UA" },
      userAgentEnabled: true,
      globalUserAgent: "global-UA",
    };

    it("prefers the container user agent over the global one", () => {
      expect(resolveUserAgent("firefox-container-1", withContainer))
        .to.equal("container-UA");
    });

    it("prefers the container user agent even when the global toggle is off", () => {
      expect(resolveUserAgent("firefox-container-1", {
        ...withContainer,
        userAgentEnabled: false,
      })).to.equal("container-UA");
    });

    it("falls back to the global user agent for other containers", () => {
      expect(resolveUserAgent("firefox-container-9", withContainer))
        .to.equal("global-UA");
    });

    // The invariant that keeps a stale stored value from spoofing after the
    // user switches the feature off.
    it("ignores a stored global user agent while the global toggle is off", () => {
      expect(resolveUserAgent("firefox-container-9", {
        ...withContainer,
        userAgentEnabled: false,
      })).to.equal(null);
    });

    it("returns null when the global agent is enabled but empty", () => {
      expect(resolveUserAgent("firefox-container-9", {
        containerUserAgents: {},
        userAgentEnabled: true,
        globalUserAgent: "",
      })).to.equal(null);
    });

    it("treats an empty container user agent as absent", () => {
      expect(resolveUserAgent("firefox-container-1", {
        containerUserAgents: { "firefox-container-1": "" },
        userAgentEnabled: true,
        globalUserAgent: "global-UA",
      })).to.equal("global-UA");
    });

    it("applies the global rules when there is no cookie store id", () => {
      expect(resolveUserAgent(undefined, withContainer)).to.equal("global-UA");
    });
  });

  describe("buildRequestHeaders", () => {
    const headers = () => [
      { name: "Accept", value: "*/*" },
      { name: "User-Agent", value: "real-UA" },
      { name: "Accept-Language", value: "en" },
    ];

    it("returns an empty result when there is nothing to rewrite", () => {
      expect(buildRequestHeaders(headers(), null)).to.deep.equal({});
    });

    it("replaces the user agent and preserves the other headers in order", () => {
      const result = buildRequestHeaders(headers(), "spoof-UA");
      expect(result.requestHeaders).to.deep.equal([
        { name: "Accept", value: "*/*" },
        { name: "Accept-Language", value: "en" },
        { name: "User-Agent", value: "spoof-UA" },
      ]);
    });

    it("matches the existing user agent header case-insensitively", () => {
      for (const name of ["user-agent", "USER-AGENT", "User-Agent"]) {
        const result = buildRequestHeaders(
          [{ name, value: "real-UA" }], "spoof-UA"
        );
        expect(result.requestHeaders).to.deep.equal([
          { name: "User-Agent", value: "spoof-UA" },
        ]);
      }
    });

    it("collapses duplicate user agent headers into one", () => {
      const result = buildRequestHeaders([
        { name: "User-Agent", value: "a" },
        { name: "user-agent", value: "b" },
      ], "spoof-UA");
      expect(result.requestHeaders).to.deep.equal([
        { name: "User-Agent", value: "spoof-UA" },
      ]);
    });

    // Burp highlighting routes by listener now; nothing may add or touch its
    // old headers, which would reach the target if Burp did not strip them.
    it("never adds the retired Highlighter headers", () => {
      const result = buildRequestHeaders(headers(), "spoof-UA");
      const names = result.requestHeaders.map((h) => h.name.toLowerCase());
      expect(names).to.not.include("x-mac-container-color");
      expect(names).to.not.include("x-mac-container-name");
    });

    it("does not mutate the caller's header array", () => {
      const original = headers();
      buildRequestHeaders(original, "spoof-UA");
      expect(original).to.deep.equal(headers());
    });

    it("survives a missing header list", () => {
      expect(buildRequestHeaders(undefined, "spoof-UA").requestHeaders)
        .to.deep.equal([{ name: "User-Agent", value: "spoof-UA" }]);
    });

    it("survives header entries with no name", () => {
      const result = buildRequestHeaders(
        [{ value: "orphan" }], "spoof-UA"
      );
      expect(result.requestHeaders).to.deep.equal([
        { value: "orphan" },
        { name: "User-Agent", value: "spoof-UA" },
      ]);
    });
  });
});
