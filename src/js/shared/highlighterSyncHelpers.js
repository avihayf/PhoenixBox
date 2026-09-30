/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pure decision logic for Burp highlighting by listener.
 *
 * While the Highlighter is on, each container with an open tab gets its own
 * Burp proxy listener, opened by the PhoenixBox Highlighter JAR. Traffic from that container is
 * routed to its listener, so Burp knows the container from the port a request
 * arrives on. Nothing is ever added to the request itself.
 *
 * The protocol with the JAR is specified in
 * docs/superpowers/specs/2026-09-25-burp-listener-per-container-design.md;
 * which containers get a listener, in 2026-09-29-highlighter-follows-open-tabs-design.md.
 * Everything here is free of browser APIs so it can be unit tested.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PhoenixBoxHighlighterSyncHelpers = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const PROTOCOL = 1;

  // Keep in sync with src/popup-ui/lib/highlighterSettings.ts.
  // The Highlighter tile's on/off switch.
  const ENABLED_KEY = "highlighterEnabled";
  // Retired: containers used to be marked one by one. Read once, to migrate.
  const MARKS_KEY = "highlighterContainerIds";
  const PINS_KEY = "highlighterPins";
  const LAST_ADDRESS_KEY = "highlighterLastAddress";
  const PAIRING_KEY = "highlighterPairing";
  const STATUS_KEY = "highlighterStatus";
  // A random ID for this Firefox profile, so Burp can tell PhoenixBox
  // installs apart and the user can revoke one without the others.
  const CLIENT_ID_KEY = "highlighterClientId";
  // Written by the popup's Connect button: look for the Highlighter now, even
  // after a denial.
  const CONNECT_REQUEST_KEY = "highlighterConnectRequest";
  // Set by Unpair, cleared by Connect: the user chose not to be paired, so
  // PhoenixBox must not look for Burp and ask again on its own.
  const AUTO_PAIR_PAUSED_KEY = "highlighterAutoPairPaused";

  /** The Highlighter JAR's control server lives on one of these ports. */
  const CONTROL_PORT_FIRST = 8079;
  const CONTROL_PORT_LAST = 8099;

  /**
   * How long a container keeps its listener after its last tab closes. Each
   * change to the listener set makes Burp recreate all of its listeners, the
   * user's own included, so a quick reopen (Ctrl+Shift+T) must not cause two.
   */
  const GRACE_MS = 30_000;

  /** Storage keys from earlier Highlighters, removed on upgrade (after initialEnabled has read them). */
  const RETIRED_KEYS = [
    MARKS_KEY,
    "highlighterHeadersEnabled",
    "addContainerColorHeaderEnabled",
    "highlighterJarAckVersion",
    "highlighterJarUpdateNoticePending",
    "paintBurpFirstTimeMessageShown",
  ];

  const BURP_PRESET_ID = "burp-suite";
  const DEFAULT_BURP_PRESET = { host: "127.0.0.1", port: 8080 };

  /** Container names are arbitrary user text; the JAR re-applies the same cap. */
  const MAX_CONTAINER_NAME_LENGTH = 64;

  // Firefox container colours to Burp highlight names. Not the identity:
  // turquoise and purple differ, and "toolbar" has no Burp equivalent.
  const COLOR_MAP = {
    blue: "blue",
    turquoise: "cyan",
    green: "green",
    yellow: "yellow",
    orange: "orange",
    red: "red",
    pink: "pink",
    purple: "magenta",
  };

  /**
   * Stands for "the same host as the Burp preset": the JAR says this when its
   * control server listens on every interface and cannot know which IP
   * Firefox uses to reach it.
   */
  const ANY_HOST = "0.0.0.0";

  /**
   * Parses "host:port" or "[ipv6]:port". Returns null for anything else,
   * including ports outside 1-65535.
   */
  function parseAddress(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const match = /^(?:\[([0-9a-fA-F:.]+)\]|([^\s:[\]]+)):(\d{1,5})$/.exec(trimmed);
    if (!match) return null;
    const port = Number(match[3]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    let host = (match[1] || match[2]).toLowerCase();
    if (host === "localhost") host = "127.0.0.1";
    return { host, port };
  }

  function formatAddress(address) {
    if (!address) return "";
    const host = address.host.includes(":") ? `[${address.host}]` : address.host;
    return `${host}:${address.port}`;
  }

  /**
   * Parses the pairing string shown in Burp's PhoenixBox tab:
   * "phx1:<host>:<port>:<token>". Whitespace around it (from copying) is ignored.
   *
   * @returns {{host: string, port: number, token: string}|null}
   */
  function parsePairingString(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith("phx1:")) return null;

    const lastColon = trimmed.lastIndexOf(":");
    const token = trimmed.slice(lastColon + 1);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;

    const address = parseAddress(trimmed.slice("phx1:".length, lastColon));
    if (!address) return null;
    return { host: address.host, port: address.port, token };
  }

  /** Where to reach the JAR's control server. */
  function controlEndpoint(pairing, burpPreset) {
    if (!pairing) return null;
    const host = pairing.host === ANY_HOST && burpPreset ? burpPreset.host : pairing.host;
    return formatAddress({ host, port: pairing.port });
  }

  /**
   * The Burp preset's endpoint: the built-in "Burp Suite" preset as the user
   * last saved it, or Burp's default when it has been deleted.
   *
   * @param {Array<{id?: string, scheme?: string, host?: string, port?: unknown}>} presets
   */
  function burpPresetFrom(presets) {
    const list = Array.isArray(presets) ? presets : [];
    const preset = list.find((p) => p && p.id === BURP_PRESET_ID);
    if (!preset) return { ...DEFAULT_BURP_PRESET };

    const scheme = String(preset.scheme || "").toLowerCase();
    const parsed = parseAddress(`${preset.host}:${preset.port}`);
    if ((scheme !== "http" && scheme !== "https") || !parsed) return { ...DEFAULT_BURP_PRESET };
    return parsed;
  }

  /** Caps by code point, so a surrogate pair is never split. */
  function capName(name) {
    if (typeof name !== "string") return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const codePoints = Array.from(trimmed);
    return codePoints.length > MAX_CONTAINER_NAME_LENGTH
      ? codePoints.slice(0, MAX_CONTAINER_NAME_LENGTH).join("")
      : trimmed;
  }

  /** Only real containers get a listener; the default and private stores never do. */
  function isHighlightable(cookieStoreId) {
    return typeof cookieStoreId === "string" && /^firefox-container-\d+$/.test(cookieStoreId);
  }

  /**
   * The switch's starting value. Once set it stands; before that, it starts on
   * for anyone who was already highlighting: 3.0's colour header toggle, or
   * containers marked by an earlier build of this one.
   */
  function initialEnabled(stored) {
    if (!stored || typeof stored !== "object") return false;
    if (typeof stored[ENABLED_KEY] === "boolean") return stored[ENABLED_KEY];
    if (stored.addContainerColorHeaderEnabled === true) return true;
    const marks = stored[MARKS_KEY];
    return Array.isArray(marks) && marks.some(isHighlightable);
  }

  /**
   * Which containers have open tabs, and when each one's last tab closed.
   * Mutated by the functions below; `now` is passed in so tests
   * control time.
   *
   * @returns {{tabs: Map<number, string>, closedAt: Map<string, number>}}
   */
  function createTabTracker() {
    return { tabs: new Map(), closedAt: new Map() };
  }

  function hasTabs(tracker, cookieStoreId) {
    for (const id of tracker.tabs.values()) {
      if (id === cookieStoreId) return true;
    }
    return false;
  }

  function inGrace(tracker, cookieStoreId, now, graceMs) {
    const closed = tracker.closedAt.get(cookieStoreId);
    return closed !== undefined && now - closed < graceMs;
  }

  /**
   * Records an open tab.
   *
   * @returns {boolean} true when its container had no listener yet, so the
   *   JAR must be told now. A tab reopened during the grace returns false:
   *   the listener is still up.
   */
  function trackTab(tracker, tabId, cookieStoreId, now, graceMs) {
    if (!isHighlightable(cookieStoreId)) return false;
    const opened = !hasTabs(tracker, cookieStoreId) && !inGrace(tracker, cookieStoreId, now, graceMs);
    tracker.tabs.set(tabId, cookieStoreId);
    tracker.closedAt.delete(cookieStoreId);
    return opened;
  }

  /**
   * Forgets a closed tab.
   *
   * @returns {string|null} the container, when this was its last tab and its
   *   grace has started.
   */
  function untrackTab(tracker, tabId, now) {
    const cookieStoreId = tracker.tabs.get(tabId);
    if (cookieStoreId === undefined) return null;
    tracker.tabs.delete(tabId);
    if (hasTabs(tracker, cookieStoreId)) return null;
    tracker.closedAt.set(cookieStoreId, now);
    return cookieStoreId;
  }

  /** Firefox swapped a tab for another (e.g. prerendering); the container is the same. */
  function replaceTab(tracker, addedTabId, removedTabId) {
    const cookieStoreId = tracker.tabs.get(removedTabId);
    if (cookieStoreId === undefined) return;
    tracker.tabs.delete(removedTabId);
    tracker.tabs.set(addedTabId, cookieStoreId);
  }

  /** A deleted container: gone at once, no grace. */
  function forgetContainer(tracker, cookieStoreId) {
    for (const [tabId, id] of [...tracker.tabs]) {
      if (id === cookieStoreId) tracker.tabs.delete(tabId);
    }
    tracker.closedAt.delete(cookieStoreId);
  }

  /**
   * The containers that should have a listener now: those with an open tab,
   * and those still in their grace. Ended graces are dropped as a side effect.
   */
  function activeContainers(tracker, now, graceMs) {
    const active = new Set(tracker.tabs.values());
    for (const [id, closed] of [...tracker.closedAt]) {
      if (now - closed < graceMs) active.add(id);
      else tracker.closedAt.delete(id);
    }
    return [...active];
  }

  /** When the earliest grace ends, or null when none is running. */
  function nextGraceExpiry(tracker, graceMs) {
    let earliest = null;
    for (const closed of tracker.closedAt.values()) {
      if (earliest === null || closed < earliest) earliest = closed;
    }
    return earliest === null ? null : earliest + graceMs;
  }

  /**
   * The full desired state for POST /v1/sync.
   *
   * Containers that no longer exist are left out rather than sent with an
   * empty name, so a deleted container's listener closes.
   *
   * @param {object} state
   * @param {{host: string, port: number}} state.burpPreset
   * @param {string[]} state.open the containers that should have a listener
   * @param {Map<string, {name?: string, color?: string}>} state.identities
   * @param {Object<string, string>} [state.pins] cookieStoreId -> "ip:port"
   * @param {Object<string, string>} [state.lastAddresses] cookieStoreId -> "ip:port"
   */
  function buildSyncBody(state) {
    const pins = state.pins || {};
    const lastAddresses = state.lastAddresses || {};
    const containers = [];

    for (const id of new Set(state.open || [])) {
      if (!isHighlightable(id)) continue;
      const identity = state.identities && state.identities.get(id);
      if (!identity) continue;

      const pin = parseAddress(pins[id]);
      const preferred = parseAddress(lastAddresses[id]);
      containers.push({
        id,
        name: capName(identity.name) || id,
        color: COLOR_MAP[identity.color] || null,
        pin: pin ? formatAddress(pin) : null,
        preferred: preferred ? formatAddress(preferred) : null,
      });
    }

    return {
      protocol: PROTOCOL,
      preset: { host: state.burpPreset.host, port: state.burpPreset.port },
      containers,
    };
  }

  /**
   * Reads the JAR's reply. Only assignments reported "ok" with a parseable
   * address are returned: PhoenixBox must never route to a listener the JAR
   * has not confirmed is up.
   *
   * @returns {{jar: string|null, addresses: Map<string, {host: string, port: number}>, errors: Object<string, string>}|null}
   *   null when the reply is not a protocol-1 sync reply at all.
   */
  function parseSyncResponse(response) {
    if (!response || typeof response !== "object" || response.protocol !== PROTOCOL) return null;
    const assignments = response.assignments;
    if (!assignments || typeof assignments !== "object") return null;

    const addresses = new Map();
    const errors = {};
    for (const [id, assignment] of Object.entries(assignments)) {
      if (!assignment || typeof assignment !== "object") continue;
      if (assignment.status === "ok") {
        const address = parseAddress(assignment.address);
        if (address) {
          addresses.set(id, address);
          continue;
        }
      }
      errors[id] = typeof assignment.error === "string"
        ? assignment.error.slice(0, 300)
        : "The Highlighter could not open a listener";
    }

    return { jar: typeof response.jar === "string" ? response.jar.slice(0, 32) : null, addresses, errors };
  }

  function isValidClientId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
  }

  /** Every port the Highlighter's control server may be on, in the order it tries them. */
  function controlPorts() {
    const ports = [];
    for (let port = CONTROL_PORT_FIRST; port <= CONTROL_PORT_LAST; port++) ports.push(port);
    return ports;
  }

  /** Whether a POST /v1/hello reply came from Phoenix Highlighter v2 (not something else on the port). */
  function isHighlighterHello(reply) {
    return !!reply && typeof reply === "object" &&
      reply.app === "phoenixbox-highlighter" && reply.protocol === PROTOCOL;
  }

  /**
   * What a POST /v1/pair reply means.
   *
   * @param {number} status HTTP status
   * @param {object|null} body parsed JSON, if any
   * @returns {{state: "approved", token: string}|{state: "pending"|"denied"|"busy"|"error"}}
   */
  function parsePairReply(status, body) {
    if (status === 200 && body && body.status === "approved" &&
        typeof body.token === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(body.token)) {
      return { state: "approved", token: body.token };
    }
    if (status === 202) return { state: "pending" };
    if (status === 403) return { state: "denied" };
    if (status === 429) return { state: "busy" };
    return { state: "error" };
  }

  /**
   * The X-MAC-Container-Color value for a request, when the Highlighter is on
   * but PhoenixBox is not paired with Highlighter v2: the old v1.x JAR
   * highlights by this header, and an unpaired v2 does too. Null when off, when
   * paired (v2 highlights by listener, and nothing is sent), outside a
   * container, and off HTTP(S) proxies, where no Burp is there to strip it.
   * The name is never sent: the published v1.x JARs do not strip it.
   *
   * @param {object} state
   * @param {boolean} state.paired
   * @param {boolean} state.enabled the Highlighter switch
   * @param {string|undefined} state.cookieStoreId
   * @param {string|undefined} state.firefoxColor the container's Firefox colour
   * @param {object|null|undefined} state.proxyInfo `details.proxyInfo`
   */
  function legacyColorHeaderValue(state) {
    if (!state || state.paired || !state.enabled || !isHighlightable(state.cookieStoreId)) return null;
    const type = state.proxyInfo && state.proxyInfo.type;
    if (type !== "http" && type !== "https") return null;
    return COLOR_MAP[state.firefoxColor] || null;
  }

  /** Whether PhoenixBox chose to send this request to the Burp preset. */
  function isBurpRoute(proxy, burpPreset) {
    if (!proxy || Array.isArray(proxy) || !burpPreset) return false;
    if (proxy.type !== "http" && proxy.type !== "https") return false;
    const endpoint = parseAddress(`${proxy.host}:${proxy.port}`);
    return !!endpoint && endpoint.host === burpPreset.host && endpoint.port === burpPreset.port;
  }

  /**
   * The proxy list for an open container while highlighting: its own listener first, the
   * preset as a failover. PhoenixBox only uses an address the JAR confirmed,
   * so the failover is a backstop for a listener that dies between syncs.
   */
  function highlightedRoute(proxy, address) {
    return [
      { ...proxy, host: address.host, port: address.port, failoverTimeout: 1 },
      proxy,
    ];
  }

  return {
    PROTOCOL,
    ENABLED_KEY,
    MARKS_KEY,
    PINS_KEY,
    LAST_ADDRESS_KEY,
    PAIRING_KEY,
    STATUS_KEY,
    CLIENT_ID_KEY,
    CONNECT_REQUEST_KEY,
    AUTO_PAIR_PAUSED_KEY,
    CONTROL_PORT_FIRST,
    CONTROL_PORT_LAST,
    GRACE_MS,
    RETIRED_KEYS,
    BURP_PRESET_ID,
    DEFAULT_BURP_PRESET,
    MAX_CONTAINER_NAME_LENGTH,
    COLOR_MAP,
    ANY_HOST,
    parseAddress,
    formatAddress,
    parsePairingString,
    controlEndpoint,
    burpPresetFrom,
    capName,
    isHighlightable,
    initialEnabled,
    createTabTracker,
    trackTab,
    untrackTab,
    replaceTab,
    forgetContainer,
    activeContainers,
    nextGraceExpiry,
    buildSyncBody,
    parseSyncResponse,
    isValidClientId,
    controlPorts,
    isHighlighterHello,
    parsePairReply,
    legacyColorHeaderValue,
    isBurpRoute,
    highlightedRoute,
  };
});
