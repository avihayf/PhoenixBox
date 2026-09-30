const { expect } = require("chai");

const {
  PROTOCOL,
  COLOR_MAP,
  DEFAULT_BURP_PRESET,
  MAX_CONTAINER_NAME_LENGTH,
  parseAddress,
  formatAddress,
  parsePairingString,
  controlEndpoint,
  burpPresetFrom,
  capName,
  ENABLED_KEY,
  MARKS_KEY,
  RETIRED_KEYS,
  GRACE_MS,
  initialEnabled,
  isHighlightable,
  createTabTracker,
  trackTab,
  untrackTab,
  replaceTab,
  forgetContainer,
  activeContainers,
  nextGraceExpiry,
  buildSyncBody,
  parseSyncResponse,
  isBurpRoute,
  highlightedRoute,
  legacyColorHeaderValue,
  parsePairReply,
  isHighlighterHello,
  controlPorts,
  isValidClientId,
} = require("../src/js/shared/highlighterSyncHelpers");

const TOKEN = "A".repeat(43);
const BURP = { host: "127.0.0.1", port: 8080 };

describe("highlighterSyncHelpers", () => {
  describe("parseAddress / formatAddress", () => {
    it("reads host:port and bracketed IPv6", () => {
      expect(parseAddress("192.168.10.2:8080")).to.deep.equal({ host: "192.168.10.2", port: 8080 });
      expect(parseAddress(" [::1]:18080 ")).to.deep.equal({ host: "::1", port: 18080 });
      expect(parseAddress("localhost:8080")).to.deep.equal({ host: "127.0.0.1", port: 8080 });
      expect(formatAddress({ host: "::1", port: 8080 })).to.equal("[::1]:8080");
    });

    it("rejects anything else", () => {
      for (const bad of ["", "8080", "host:", ":80", "host:0", "host:65536", "a b:80", "::1:80", null, 42]) {
        expect(parseAddress(bad), String(bad)).to.equal(null);
      }
    });
  });

  describe("parsePairingString", () => {
    it("reads the string Burp's PhoenixBox tab shows", () => {
      expect(parsePairingString(`phx1:127.0.0.1:8079:${TOKEN}`))
        .to.deep.equal({ host: "127.0.0.1", port: 8079, token: TOKEN });
      expect(parsePairingString(`  phx1:[::1]:8080:${TOKEN}\n`))
        .to.deep.equal({ host: "::1", port: 8080, token: TOKEN });
    });

    it("rejects other versions, bad addresses and short or odd tokens", () => {
      for (const bad of [
        `phx2:127.0.0.1:8079:${TOKEN}`,
        `phx1:127.0.0.1:${TOKEN}`,
        "phx1:127.0.0.1:8079:short",
        "phx1:127.0.0.1:8079:has spaces in it!!",
        `127.0.0.1:8079:${TOKEN}`,
        "",
        undefined,
      ]) {
        expect(parsePairingString(bad), String(bad)).to.equal(null);
      }
    });
  });

  describe("controlEndpoint", () => {
    it("uses the pairing address", () => {
      expect(controlEndpoint({ host: "127.0.0.1", port: 8079, token: TOKEN }, BURP)).to.equal("127.0.0.1:8079");
    });

    it("reads 0.0.0.0 as the Burp preset's host", () => {
      expect(controlEndpoint({ host: "0.0.0.0", port: 8079, token: TOKEN }, { host: "192.168.10.2", port: 8080 }))
        .to.equal("192.168.10.2:8079");
    });

    it("has nothing to reach before pairing", () => {
      expect(controlEndpoint(null, BURP)).to.equal(null);
    });
  });

  describe("burpPresetFrom", () => {
    it("uses the Burp Suite preset as the user saved it", () => {
      expect(burpPresetFrom([
        { id: "custom-1", scheme: "http", host: "10.0.0.1", port: 3128 },
        { id: "burp-suite", scheme: "http", host: "192.168.10.2", port: 8081 },
      ])).to.deep.equal({ host: "192.168.10.2", port: 8081 });
    });

    it("falls back to Burp's default when it is missing or unusable", () => {
      expect(burpPresetFrom([])).to.deep.equal(DEFAULT_BURP_PRESET);
      expect(burpPresetFrom(undefined)).to.deep.equal(DEFAULT_BURP_PRESET);
      expect(burpPresetFrom([{ id: "burp-suite", scheme: "socks5", host: "127.0.0.1", port: 1080 }]))
        .to.deep.equal(DEFAULT_BURP_PRESET);
    });
  });

  describe("capName", () => {
    it("caps by code point without splitting emoji", () => {
      expect(capName("🔥".repeat(100))).to.equal("🔥".repeat(MAX_CONTAINER_NAME_LENGTH));
      expect(capName("  Work  ")).to.equal("Work");
      expect(capName("   ")).to.equal(null);
      expect(capName(undefined)).to.equal(null);
    });
  });

  describe("initialEnabled", () => {
    it("keeps a switch the user has already set", () => {
      expect(initialEnabled({ [ENABLED_KEY]: true })).to.equal(true);
      expect(initialEnabled({ [ENABLED_KEY]: false, addContainerColorHeaderEnabled: true })).to.equal(false);
    });

    it("turns on for 3.0's colour header toggle", () => {
      expect(initialEnabled({ addContainerColorHeaderEnabled: true })).to.equal(true);
    });

    it("turns on when containers were marked", () => {
      expect(initialEnabled({ [MARKS_KEY]: ["firefox-container-1"] })).to.equal(true);
      expect(initialEnabled({ [MARKS_KEY]: ["firefox-default", 7] })).to.equal(false);
    });

    it("starts off with nothing to go on", () => {
      expect(initialEnabled({})).to.equal(false);
      expect(initialEnabled(null)).to.equal(false);
    });

    it("retires the marks and 3.0's toggle", () => {
      expect(RETIRED_KEYS).to.include(MARKS_KEY);
      expect(RETIRED_KEYS).to.include("addContainerColorHeaderEnabled");
    });
  });

  describe("isHighlightable", () => {
    it("is true only for real containers", () => {
      expect(isHighlightable("firefox-container-12")).to.equal(true);
      for (const id of ["firefox-default", "firefox-private", "firefox-container-", "x", undefined, 3]) {
        expect(isHighlightable(id), String(id)).to.equal(false);
      }
    });
  });

  // Which containers have a listener: those with an open tab, and those whose
  // last tab closed less than the grace ago.
  describe("tab tracker", () => {
    const A = "firefox-container-1";
    const B = "firefox-container-2";
    const G = GRACE_MS;

    it("uses a 30 s grace", () => {
      expect(GRACE_MS).to.equal(30_000);
    });

    it("counts several tabs of one container once, and says when it opens", () => {
      const t = createTabTracker();
      expect(trackTab(t, 1, A, 0, G)).to.equal(true);
      expect(trackTab(t, 2, A, 0, G)).to.equal(false);
      expect(trackTab(t, 2, A, 0, G)).to.equal(false); // seen twice (startup query, then onCreated)
      expect(activeContainers(t, 0, G)).to.deep.equal([A]);
    });

    it("ignores default and private tabs", () => {
      const t = createTabTracker();
      expect(trackTab(t, 1, "firefox-default", 0, G)).to.equal(false);
      expect(trackTab(t, 2, "firefox-private", 0, G)).to.equal(false);
      expect(activeContainers(t, 0, G)).to.deep.equal([]);
      expect(untrackTab(t, 1, 0)).to.equal(null);
    });

    it("keeps a container while any of its tabs is open", () => {
      const t = createTabTracker();
      trackTab(t, 1, A, 0, G);
      trackTab(t, 2, A, 0, G);
      expect(untrackTab(t, 1, 5)).to.equal(null);
      expect(activeContainers(t, 5, G)).to.deep.equal([A]);
      expect(nextGraceExpiry(t, G)).to.equal(null);
    });

    it("keeps a container through the grace after its last tab, then drops it", () => {
      const t = createTabTracker();
      trackTab(t, 1, A, 0, G);
      expect(untrackTab(t, 1, 1000)).to.equal(A);
      expect(activeContainers(t, 1000 + G - 1, G)).to.deep.equal([A]);
      expect(nextGraceExpiry(t, G)).to.equal(1000 + G);
      expect(activeContainers(t, 1000 + G, G)).to.deep.equal([]);
    });

    it("reuses the listener when a tab reopens during the grace", () => {
      const t = createTabTracker();
      trackTab(t, 1, A, 0, G);
      untrackTab(t, 1, 1000);
      expect(trackTab(t, 7, A, 5000, G)).to.equal(false); // no sync needed: the listener is still up
      expect(nextGraceExpiry(t, G)).to.equal(null);
      expect(activeContainers(t, 1000 + G * 2, G)).to.deep.equal([A]);
    });

    it("opens again after the grace ran out", () => {
      const t = createTabTracker();
      trackTab(t, 1, A, 0, G);
      untrackTab(t, 1, 1000);
      expect(trackTab(t, 7, A, 1000 + G, G)).to.equal(true);
    });

    it("wakes for the earliest grace to end, and forgets ended ones", () => {
      const t = createTabTracker();
      trackTab(t, 1, A, 0, G);
      trackTab(t, 2, B, 0, G);
      untrackTab(t, 2, 500);
      untrackTab(t, 1, 900);
      expect(nextGraceExpiry(t, G)).to.equal(500 + G);
      activeContainers(t, 500 + G, G);
      expect(nextGraceExpiry(t, G)).to.equal(900 + G);
    });

    it("keeps the container when Firefox replaces a tab", () => {
      const t = createTabTracker();
      trackTab(t, 1, A, 0, G);
      replaceTab(t, 9, 1);
      expect(untrackTab(t, 1, 5)).to.equal(null);
      expect(activeContainers(t, 5, G)).to.deep.equal([A]);
      expect(untrackTab(t, 9, 6)).to.equal(A);
    });

    it("drops a deleted container at once, with no grace", () => {
      const t = createTabTracker();
      trackTab(t, 1, A, 0, G);
      untrackTab(t, 1, 10);
      forgetContainer(t, A);
      expect(activeContainers(t, 11, G)).to.deep.equal([]);
      expect(nextGraceExpiry(t, G)).to.equal(null);
    });
  });

  describe("buildSyncBody", () => {
    const identities = new Map([
      ["firefox-container-1", { name: "Work", color: "turquoise" }],
      ["firefox-container-2", { name: "Admin", color: "toolbar" }],
    ]);

    it("sends the full desired state with mapped colours", () => {
      const body = buildSyncBody({
        burpPreset: BURP,
        open: ["firefox-container-1", "firefox-container-2"],
        identities,
        pins: { "firefox-container-2": "192.168.10.5:8080" },
        lastAddresses: { "firefox-container-1": "127.0.0.1:18080" },
      });

      expect(body).to.deep.equal({
        protocol: PROTOCOL,
        preset: BURP,
        containers: [
          { id: "firefox-container-1", name: "Work", color: "cyan", pin: null, preferred: "127.0.0.1:18080" },
          // "toolbar" has no Burp colour: listened to and named, just not highlighted.
          { id: "firefox-container-2", name: "Admin", color: null, pin: "192.168.10.5:8080", preferred: null },
        ],
      });
    });

    it("leaves out containers that no longer exist, and anything that isn't one", () => {
      const body = buildSyncBody({ burpPreset: BURP, open: ["firefox-container-9", "firefox-default"], identities });
      expect(body.containers).to.deep.equal([]);
    });

    it("drops a malformed pin or remembered address instead of sending it", () => {
      const body = buildSyncBody({
        burpPreset: BURP,
        open: ["firefox-container-1"],
        identities,
        pins: { "firefox-container-1": "not an address" },
        lastAddresses: { "firefox-container-1": "nope" },
      });
      expect(body.containers[0].pin).to.equal(null);
      expect(body.containers[0].preferred).to.equal(null);
    });

    it("maps every Firefox colour PhoenixBox knows", () => {
      expect(Object.values(COLOR_MAP).sort())
        .to.deep.equal(["blue", "cyan", "green", "magenta", "orange", "pink", "red", "yellow"]);
    });
  });

  describe("parseSyncResponse", () => {
    it("returns only the addresses the JAR confirmed", () => {
      const parsed = parseSyncResponse({
        protocol: 1,
        jar: "2.0.0",
        assignments: {
          "firefox-container-1": { status: "ok", address: "127.0.0.1:18080" },
          "firefox-container-2": { status: "error", address: null, error: "in use" },
          "firefox-container-3": { status: "ok", address: "garbage" },
        },
      });

      expect(parsed.jar).to.equal("2.0.0");
      expect([...parsed.addresses.entries()]).to.deep.equal([
        ["firefox-container-1", { host: "127.0.0.1", port: 18080 }],
      ]);
      expect(parsed.errors["firefox-container-2"]).to.equal("in use");
      expect(parsed.errors["firefox-container-3"]).to.be.a("string");
    });

    it("rejects replies from another protocol or none at all", () => {
      expect(parseSyncResponse(null)).to.equal(null);
      expect(parseSyncResponse({ protocol: 2, assignments: {} })).to.equal(null);
      expect(parseSyncResponse({ protocol: 1 })).to.equal(null);
    });
  });

  // The routing table in the design spec, row by row.
  describe("routing", () => {
    const burpProxy = { type: "http", host: "127.0.0.1", port: 8080 };

    it("treats only an HTTP(S) proxy at the Burp preset as a Burp route", () => {
      expect(isBurpRoute(burpProxy, BURP)).to.equal(true);
      expect(isBurpRoute({ ...burpProxy, type: "https" }, BURP)).to.equal(true);
      expect(isBurpRoute({ ...burpProxy, host: "localhost" }, BURP)).to.equal(true);
      expect(isBurpRoute({ ...burpProxy, port: 3128 }, BURP)).to.equal(false);
      expect(isBurpRoute({ type: "socks", host: "127.0.0.1", port: 8080 }, BURP)).to.equal(false);
      expect(isBurpRoute({ type: "direct" }, BURP)).to.equal(false);
      expect(isBurpRoute([burpProxy], BURP)).to.equal(false);
      expect(isBurpRoute(null, BURP)).to.equal(false);
    });

    it("sends an open container to its own listener with the preset as failover", () => {
      const withCredentials = { ...burpProxy, username: "u", password: "p" };
      expect(highlightedRoute(withCredentials, { host: "127.0.0.1", port: 18080 })).to.deep.equal([
        { type: "http", host: "127.0.0.1", port: 18080, username: "u", password: "p", failoverTimeout: 1 },
        withCredentials,
      ]);
    });
  });

  // On but not paired with Highlighter v2: every container carries the old JAR's colour header.
  describe("legacyColorHeaderValue", () => {
    const http = { type: "http", host: "127.0.0.1", port: 8080 };
    const base = { paired: false, enabled: true, cookieStoreId: "firefox-container-4", firefoxColor: "turquoise", proxyInfo: http };

    it("sends the mapped colour for any container going through an HTTP proxy", () => {
      expect(legacyColorHeaderValue(base)).to.equal("cyan");
      expect(legacyColorHeaderValue({ ...base, proxyInfo: { ...http, type: "https" } })).to.equal("cyan");
    });

    it("sends nothing once paired: v2 highlights by listener", () => {
      expect(legacyColorHeaderValue({ ...base, paired: true })).to.equal(null);
    });

    it("sends nothing while the Highlighter is off", () => {
      expect(legacyColorHeaderValue({ ...base, enabled: false })).to.equal(null);
    });

    it("sends nothing outside a container", () => {
      expect(legacyColorHeaderValue({ ...base, cookieStoreId: "firefox-default" })).to.equal(null);
    });

    it("sends nothing off an HTTP proxy, where no Burp would strip it", () => {
      for (const proxyInfo of [null, undefined, { type: "direct" }, { type: "socks", host: "10.0.0.1", port: 1080 }]) {
        expect(legacyColorHeaderValue({ ...base, proxyInfo }), JSON.stringify(proxyInfo)).to.equal(null);
      }
    });

    it("sends nothing for a colour Burp has no highlight for", () => {
      expect(legacyColorHeaderValue({ ...base, firefoxColor: "toolbar" })).to.equal(null);
      expect(legacyColorHeaderValue({ ...base, firefoxColor: undefined })).to.equal(null);
    });

    it("fails closed without state", () => {
      expect(legacyColorHeaderValue(undefined)).to.equal(null);
    });
  });

  describe("automatic pairing", () => {
    it("recognises only Highlighter v2's hello", () => {
      expect(isHighlighterHello({ app: "phoenixbox-highlighter", protocol: 1, jar: "2.0.0" })).to.equal(true);
      expect(isHighlighterHello({ app: "something-else", protocol: 1 })).to.equal(false);
      expect(isHighlighterHello({ app: "phoenixbox-highlighter", protocol: 2 })).to.equal(false);
      expect(isHighlighterHello(null)).to.equal(false);
    });

    it("reads every pairing reply", () => {
      const token = "T".repeat(43);
      expect(parsePairReply(200, { status: "approved", token })).to.deep.equal({ state: "approved", token });
      expect(parsePairReply(200, { status: "approved", token: "bad token!" })).to.deep.equal({ state: "error" });
      expect(parsePairReply(202, { status: "pending" })).to.deep.equal({ state: "pending" });
      expect(parsePairReply(403, null)).to.deep.equal({ state: "denied" });
      expect(parsePairReply(429, null)).to.deep.equal({ state: "busy" });
      expect(parsePairReply(500, null)).to.deep.equal({ state: "error" });
    });

    it("probes exactly the control server's port range", () => {
      const ports = controlPorts();
      expect(ports[0]).to.equal(8079);
      expect(ports[ports.length - 1]).to.equal(8099);
      expect(ports).to.have.length(21);
    });

    it("accepts only well-formed client IDs", () => {
      expect(isValidClientId("abcDEF123_-abcDEF123_-")).to.equal(true);
      for (const bad of ["short", "has spaces in it here", "x".repeat(65), null, 5]) {
        expect(isValidClientId(bad), String(bad)).to.equal(false);
      }
    });
  });
});
