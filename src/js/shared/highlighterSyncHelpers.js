/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pure decision logic for Burp highlighting by listener.
 *
 * Each container marked for highlighting gets its own Burp proxy listener,
 * opened by the PhoenixBox Highlighter JAR. Traffic from that container is
 * routed to its listener, so Burp knows the container from the port a request
 * arrives on. Nothing is ever added to the request itself.
 *
 * The protocol with the JAR is specified in
 * docs/superpowers/specs/2026-09-25-burp-listener-per-container-design.md.
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
  const MARKS_KEY = "highlighterContainerIds";
  const PINS_KEY = "highlighterPins";
  const LAST_ADDRESS_KEY = "highlighterLastAddress";
  const PAIRING_KEY = "highlighterPairing";
  const STATUS_KEY = "highlighterStatus";

  /** Storage keys from the header-based Highlighter, removed on upgrade. */
  const RETIRED_KEYS = [
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

  function sanitizeMarks(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    for (const id of value) {
      if (typeof id === "string" && /^firefox-container-\d+$/.test(id)) seen.add(id);
    }
    return [...seen];
  }

  /**
   * The full desired state for POST /v1/sync.
   *
   * Marks for containers that no longer exist are left out rather than sent
   * with an empty name, so a deleted container's listener closes.
   *
   * @param {object} state
   * @param {{host: string, port: number}} state.burpPreset
   * @param {string[]} state.marks
   * @param {Map<string, {name?: string, color?: string}>} state.identities
   * @param {Object<string, string>} [state.pins] cookieStoreId -> "ip:port"
   * @param {Object<string, string>} [state.lastAddresses] cookieStoreId -> "ip:port"
   */
  function buildSyncBody(state) {
    const pins = state.pins || {};
    const lastAddresses = state.lastAddresses || {};
    const containers = [];

    for (const id of sanitizeMarks(state.marks)) {
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

  /** Whether PhoenixBox chose to send this request to the Burp preset. */
  function isBurpRoute(proxy, burpPreset) {
    if (!proxy || Array.isArray(proxy) || !burpPreset) return false;
    if (proxy.type !== "http" && proxy.type !== "https") return false;
    const endpoint = parseAddress(`${proxy.host}:${proxy.port}`);
    return !!endpoint && endpoint.host === burpPreset.host && endpoint.port === burpPreset.port;
  }

  /**
   * The proxy list for a highlighted container: its own listener first, the
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
    MARKS_KEY,
    PINS_KEY,
    LAST_ADDRESS_KEY,
    PAIRING_KEY,
    STATUS_KEY,
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
    sanitizeMarks,
    buildSyncBody,
    parseSyncResponse,
    isBurpRoute,
    highlightedRoute,
  };
});
