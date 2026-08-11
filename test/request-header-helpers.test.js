const { expect } = require("chai");

const {
  COLOR_MAP,
  MAX_CONTAINER_NAME_LENGTH,
  isSupportedScheme,
  hasContainerUserAgents,
  shouldListen,
  resolveHighlighterHeadersEnabled,
  resolveUserAgent,
  encodeContainerName,
  resolveContainerColor,
  resolveContainerName,
  buildRequestHeaders,
} = require("../src/js/shared/requestHeaderHelpers");

/**
 * Shared wire-format vectors. The Burp companion (PhoenixBox-Highlighter) keeps
 * the same table and asserts the decode direction, so the two halves of the
 * contract are pinned to identical values rather than to prose.
 *
 * Keep in sync with ContainerHighlighterTest#CONTAINER_NAME_VECTORS. The CR/LF vector is ours
 * alone: the Java side strips control characters out of tab labels, so it cannot round-trip.
 */
const NAME_VECTORS = [
  ["Attacker", "Attacker"],
  ["Admin Account", "Admin%20Account"],
  // encodeURIComponent leaves "+" literal while URLDecoder would read it as a
  // space; this vector is what stops the Java side using the wrong decoder.
  ["C++", "C%2B%2B"],
  ["50%", "50%25"],
  ["אבטחה", "%D7%90%D7%91%D7%98%D7%97%D7%94"],
  ["🔥", "%F0%9F%94%A5"],
  ["a\r\nb", "a%0D%0Ab"],
];

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

  describe("resolveHighlighterHeadersEnabled", () => {
    const CURRENT = "highlighterHeadersEnabled";
    const LEGACY = "addContainerColorHeaderEnabled";

    it("uses the current key when it is present", () => {
      expect(resolveHighlighterHeadersEnabled({ [CURRENT]: true })).to.equal(true);
      expect(resolveHighlighterHeadersEnabled({ [CURRENT]: false })).to.equal(false);
    });

    // The case that matters: an existing user whose profile predates the
    // rename must not silently find the Highlighter switched off.
    it("falls back to the legacy key on an un-migrated profile", () => {
      expect(resolveHighlighterHeadersEnabled({ [LEGACY]: true })).to.equal(true);
    });

    // A deliberate "off" under the current key must win over a stale legacy
    // "on", or turning the feature off would not stick until migration ran.
    it("prefers the current key even when it is false", () => {
      expect(resolveHighlighterHeadersEnabled({ [CURRENT]: false, [LEGACY]: true }))
        .to.equal(false);
    });

    it("treats an absent current key as absent, not as false", () => {
      expect(resolveHighlighterHeadersEnabled({ [CURRENT]: undefined, [LEGACY]: true }))
        .to.equal(true);
    });

    it("defaults to off when neither key is set", () => {
      expect(resolveHighlighterHeadersEnabled({})).to.equal(false);
      expect(resolveHighlighterHeadersEnabled(null)).to.equal(false);
      expect(resolveHighlighterHeadersEnabled(undefined)).to.equal(false);
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
        highlighterHeadersEnabled: false,
        userAgentEnabled: false,
        globalUserAgent: null,
        containerUserAgents: {},
      })).to.equal(false);
    });

    it("attaches for the color header alone", () => {
      expect(shouldListen({ highlighterHeadersEnabled: true })).to.equal(true);
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

  describe("resolveContainerColor", () => {
    const colors = () =>
      new Map([["firefox-container-1", { color: "turquoise", name: "Recon" }]]);

    it("returns null when the color header feature is off", () => {
      expect(resolveContainerColor("firefox-container-1", false, colors()))
        .to.equal(null);
    });

    it("never labels the default or private cookie stores", () => {
      expect(resolveContainerColor("firefox-default", true, colors())).to.equal(null);
      expect(resolveContainerColor("firefox-private", true, colors())).to.equal(null);
      expect(resolveContainerColor("", true, colors())).to.equal(null);
      expect(resolveContainerColor(undefined, true, colors())).to.equal(null);
    });

    it("maps every Firefox container color to its Burp name", () => {
      for (const [firefoxColor, expected] of Object.entries(COLOR_MAP)) {
        const map = new Map([["firefox-container-1", { color: firefoxColor }]]);
        expect(resolveContainerColor("firefox-container-1", true, map))
          .to.equal(expected);
      }
    });

    it("maps colors whose names differ from the Firefox name", () => {
      expect(resolveContainerColor("firefox-container-1", true, colors()))
        .to.equal("cyan");
      expect(resolveContainerColor("firefox-container-1", true,
        new Map([["firefox-container-1", { color: "purple" }]]))).to.equal("magenta");
    });

    it("returns undefined only when the container is not cached", () => {
      expect(resolveContainerColor("firefox-container-7", true, colors()))
        .to.equal(undefined);
    });

    // Anything cached must resolve to a value, never to "unknown" — otherwise
    // the caller repeats its async lookup on every single request.
    it("returns null for a cached but unmapped color", () => {
      const map = new Map([["firefox-container-1", { color: "toolbar" }]]);
      expect(resolveContainerColor("firefox-container-1", true, map)).to.equal(null);
    });

    it("returns null for a container cached with no color at all", () => {
      const map = new Map([["firefox-container-1", { color: undefined }]]);
      expect(resolveContainerColor("firefox-container-1", true, map)).to.equal(null);
    });

    // The async path caches this shape when contextualIdentities.get throws.
    it("returns null for a container cached as entirely unreadable", () => {
      const map = new Map([["firefox-container-1", undefined]]);
      expect(resolveContainerColor("firefox-container-1", true, map)).to.equal(null);
    });

    it("reports unknown when no cache was supplied", () => {
      expect(resolveContainerColor("firefox-container-1", true, null))
        .to.equal(undefined);
    });
  });

  describe("encodeContainerName", () => {
    it("encodes every shared wire vector exactly", () => {
      for (const [raw, encoded] of NAME_VECTORS) {
        expect(encodeContainerName(raw), raw).to.equal(encoded);
      }
    });

    it("leaves no raw CR or LF in the value", () => {
      const encoded = encodeContainerName("a\r\nb: injected");
      expect(encoded).to.be.a("string");
      expect(encoded).to.not.match(/[\r\n]/);
    });

    it("drops names that carry no content", () => {
      expect(encodeContainerName("")).to.equal(null);
      expect(encodeContainerName("   ")).to.equal(null);
      expect(encodeContainerName("\t\r\n")).to.equal(null);
      expect(encodeContainerName(null)).to.equal(null);
      expect(encodeContainerName(undefined)).to.equal(null);
      expect(encodeContainerName(42)).to.equal(null);
    });

    it("trims before encoding", () => {
      expect(encodeContainerName("  Attacker  ")).to.equal("Attacker");
    });

    it("truncates to the code point cap", () => {
      const raw = "a".repeat(MAX_CONTAINER_NAME_LENGTH + 6);
      expect(encodeContainerName(raw)).to.equal("a".repeat(MAX_CONTAINER_NAME_LENGTH));
    });

    // Slicing UTF-16 units here would leave a lone surrogate, which
    // encodeURIComponent rejects outright.
    it("truncates without splitting a surrogate pair", () => {
      const raw = "🔥".repeat(MAX_CONTAINER_NAME_LENGTH + 3);
      const encoded = encodeContainerName(raw);
      expect(encoded).to.equal("%F0%9F%94%A5".repeat(MAX_CONTAINER_NAME_LENGTH));
      expect(decodeURIComponent(encoded)).to.equal("🔥".repeat(MAX_CONTAINER_NAME_LENGTH));
    });

    it("survives a lone surrogate rather than throwing", () => {
      expect(encodeContainerName("bad\uD800name")).to.equal(null);
    });
  });

  describe("resolveContainerName", () => {
    const identities = () =>
      new Map([["firefox-container-1", { color: "red", name: "Attacker" }]]);

    it("returns null when the color header feature is off", () => {
      expect(resolveContainerName("firefox-container-1", false, identities()))
        .to.equal(null);
    });

    it("never labels the default or private cookie stores", () => {
      expect(resolveContainerName("firefox-default", true, identities())).to.equal(null);
      expect(resolveContainerName("firefox-private", true, identities())).to.equal(null);
      expect(resolveContainerName("", true, identities())).to.equal(null);
      expect(resolveContainerName(undefined, true, identities())).to.equal(null);
    });

    it("returns the encoded name for a cached container", () => {
      expect(resolveContainerName("firefox-container-1", true, identities()))
        .to.equal("Attacker");
    });

    // A colour is one of eight values; a name is arbitrary user text. An
    // existing user who switched highlighting on consented to the colour, so
    // the name waits until they have been told their JAR may not strip it.
    it("withholds the name while the JAR update notice is pending", () => {
      expect(resolveContainerName("firefox-container-1", true, identities(), true))
        .to.equal(null);
    });

    // null, not undefined: withholding is a decision, and undefined would send
    // every request for this container down the async lookup path.
    it("withholds even for a container that is not cached", () => {
      expect(resolveContainerName("firefox-container-7", true, identities(), true))
        .to.equal(null);
    });

    it("sends the name again once the notice is acknowledged", () => {
      expect(resolveContainerName("firefox-container-1", true, identities(), false))
        .to.equal("Attacker");
    });

    // The colour is unaffected: it is what the user already opted into.
    it("does not withhold the colour while the notice is pending", () => {
      expect(resolveContainerColor("firefox-container-1", true, identities()))
        .to.equal("red");
    });

    it("returns undefined only when the container is not cached", () => {
      expect(resolveContainerName("firefox-container-7", true, identities()))
        .to.equal(undefined);
      expect(resolveContainerName("firefox-container-1", true, null))
        .to.equal(undefined);
    });

    // Same reason as the color resolver: anything cached must resolve, or the
    // caller repeats its async lookup forever.
    it("returns null for a container cached without a usable name", () => {
      for (const entry of [{ color: "red" }, { color: "red", name: "  " }, undefined]) {
        const map = new Map([["firefox-container-1", entry]]);
        expect(resolveContainerName("firefox-container-1", true, map)).to.equal(null);
      }
    });
  });

  describe("buildRequestHeaders", () => {
    const headers = () => [
      { name: "Accept", value: "*/*" },
      { name: "User-Agent", value: "real-UA" },
      { name: "Accept-Language", value: "en" },
    ];

    it("returns an empty result when there is nothing to rewrite", () => {
      expect(buildRequestHeaders(headers(), null, null)).to.deep.equal({});
    });

    it("replaces the user agent and preserves the other headers in order", () => {
      const result = buildRequestHeaders(headers(), "spoof-UA", null);
      expect(result.requestHeaders).to.deep.equal([
        { name: "Accept", value: "*/*" },
        { name: "Accept-Language", value: "en" },
        { name: "User-Agent", value: "spoof-UA" },
      ]);
    });

    it("matches the existing user agent header case-insensitively", () => {
      for (const name of ["user-agent", "USER-AGENT", "User-Agent"]) {
        const result = buildRequestHeaders(
          [{ name, value: "real-UA" }], "spoof-UA", null
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
      ], "spoof-UA", null);
      expect(result.requestHeaders).to.deep.equal([
        { name: "User-Agent", value: "spoof-UA" },
      ]);
    });

    it("leaves the user agent alone when only the color header is set", () => {
      const result = buildRequestHeaders(headers(), null, "red");
      expect(result.requestHeaders).to.deep.equal([
        { name: "Accept", value: "*/*" },
        { name: "User-Agent", value: "real-UA" },
        { name: "Accept-Language", value: "en" },
        { name: "X-MAC-Container-Color", value: "red" },
      ]);
    });

    it("replaces an existing color header rather than duplicating it", () => {
      const result = buildRequestHeaders(
        [{ name: "x-mac-container-color", value: "blue" }], null, "red"
      );
      expect(result.requestHeaders).to.deep.equal([
        { name: "X-MAC-Container-Color", value: "red" },
      ]);
    });

    it("applies both replacements together", () => {
      const result = buildRequestHeaders(headers(), "spoof-UA", "cyan");
      expect(result.requestHeaders).to.deep.equal([
        { name: "Accept", value: "*/*" },
        { name: "Accept-Language", value: "en" },
        { name: "User-Agent", value: "spoof-UA" },
        { name: "X-MAC-Container-Color", value: "cyan" },
      ]);
    });

    it("appends the container name header", () => {
      const result = buildRequestHeaders(headers(), null, "red", "Attacker");
      expect(result.requestHeaders).to.deep.equal([
        { name: "Accept", value: "*/*" },
        { name: "User-Agent", value: "real-UA" },
        { name: "Accept-Language", value: "en" },
        { name: "X-MAC-Container-Color", value: "red" },
        { name: "X-MAC-Container-Name", value: "Attacker" },
      ]);
    });

    it("replaces an existing name header rather than duplicating it", () => {
      const result = buildRequestHeaders(
        [{ name: "x-mac-container-NAME", value: "spoofed" }], null, "red", "Attacker"
      );
      expect(result.requestHeaders).to.deep.equal([
        { name: "X-MAC-Container-Color", value: "red" },
        { name: "X-MAC-Container-Name", value: "Attacker" },
      ]);
    });

    it("leaves an inbound name header alone when we are not sending one", () => {
      const result = buildRequestHeaders(
        [{ name: "X-MAC-Container-Name", value: "theirs" }], "spoof-UA", null, null
      );
      expect(result.requestHeaders).to.deep.equal([
        { name: "X-MAC-Container-Name", value: "theirs" },
        { name: "User-Agent", value: "spoof-UA" },
      ]);
    });

    it("applies user agent, color and name together", () => {
      const result = buildRequestHeaders(headers(), "spoof-UA", "cyan", "Recon%20Box");
      expect(result.requestHeaders).to.deep.equal([
        { name: "Accept", value: "*/*" },
        { name: "Accept-Language", value: "en" },
        { name: "User-Agent", value: "spoof-UA" },
        { name: "X-MAC-Container-Color", value: "cyan" },
        { name: "X-MAC-Container-Name", value: "Recon%20Box" },
      ]);
    });

    it("returns an empty result when the name is the only absent value", () => {
      expect(buildRequestHeaders(headers(), null, null, null)).to.deep.equal({});
    });

    it("does not mutate the caller's header array", () => {
      const original = headers();
      buildRequestHeaders(original, "spoof-UA", "red", "Attacker");
      expect(original).to.deep.equal(headers());
    });

    it("survives a missing header list", () => {
      expect(buildRequestHeaders(undefined, "spoof-UA", null).requestHeaders)
        .to.deep.equal([{ name: "User-Agent", value: "spoof-UA" }]);
    });

    it("survives header entries with no name", () => {
      const result = buildRequestHeaders(
        [{ value: "orphan" }], "spoof-UA", null
      );
      expect(result.requestHeaders).to.deep.equal([
        { value: "orphan" },
        { name: "User-Agent", value: "spoof-UA" },
      ]);
    });
  });
});
