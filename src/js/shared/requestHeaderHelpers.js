/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pure decision logic for the outgoing request-header rewriter.
 *
 * These run on a blocking webRequest listener, once per request, so they are
 * kept free of any browser API access: the caller owns the I/O and the caches,
 * and passes their contents in. That also makes every branch unit-testable.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PhoenixBoxRequestHeaderHelpers = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const COLOR_HEADER_NAME = "X-MAC-Container-Color";
  const NAME_HEADER_NAME = "X-MAC-Container-Name";

  // One switch arms both headers, so it is not named after the colour alone.
  const HIGHLIGHTER_HEADERS_KEY = "highlighterHeadersEnabled";
  // What the same setting was called when it only added the colour header.
  const LEGACY_HIGHLIGHTER_HEADERS_KEY = "addContainerColorHeaderEnabled";

  // The Highlighter JAR version the user has confirmed is loaded in Burp. Only
  // v1.2.0+ strips X-MAC-Container-Name, so until the user confirms at least
  // that, the name is withheld — on fresh installs as well as upgrades, since a
  // new profile can be pointed at a Burp that still runs an old JAR.
  const JAR_ACK_VERSION_KEY = "highlighterJarAckVersion";
  const REQUIRED_JAR_VERSION = "1.2.0";

  /** Numeric dotted-version compare; non-numeric parts count as 0. */
  function compareVersions(a, b) {
    const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    }
    return 0;
  }

  /**
   * Whether the user has confirmed a JAR new enough to strip the name header.
   * Keyed on the version rather than a one-shot flag, so raising the
   * requirement later re-asks exactly once, and unrelated releases never do.
   */
  function isJarAcknowledged(ackVersion, requiredVersion) {
    if (!ackVersion) return false;
    return compareVersions(ackVersion, requiredVersion || REQUIRED_JAR_VERSION) >= 0;
  }

  // Container names are arbitrary user text; header values are not. Cap the raw
  // name before encoding so the bound is easy to reason about.
  //
  // The bound is code points, not bytes: percent-encoding expands an astral
  // character roughly twelvefold, so 64 emoji encode to about 768 bytes. That
  // is the worst case, and it stays comfortably inside any sane header limit.
  const MAX_CONTAINER_NAME_LENGTH = 64;

  // Map Firefox container colors to standard color names for Burp Suite
  // highlighting. These are common color names that most tools can recognize.
  // Note the mapping is not the identity: turquoise and purple differ.
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

  const NON_CONTAINER_COOKIE_STORES = new Set([
    "firefox-default",
    "firefox-private",
  ]);

  /**
   * @typedef {object} HeaderRewriteState
   * @property {boolean} highlighterHeadersEnabled
   * @property {boolean} userAgentEnabled
   * @property {string|null} globalUserAgent
   * @property {Object<string,string>} containerUserAgents
   *
   * Field names deliberately match the properties on the requestHeaders
   * module, so it can pass `this` straight through. Building a fresh object
   * per request would allocate on the hot path of a blocking listener.
   */

  /**
   * Resolve the Highlighter toggle from a storage read.
   *
   * The key was renamed once the toggle started gating a second header, so a
   * profile written by an older version still holds the legacy name. Readers
   * fall back rather than relying on the migration having already run, which
   * keeps the setting correct no matter the ordering at startup.
   *
   * @param {object} stored result of a storage.local.get covering both keys.
   */
  function resolveHighlighterHeadersEnabled(stored) {
    const values = stored || {};
    if (HIGHLIGHTER_HEADERS_KEY in values && values[HIGHLIGHTER_HEADERS_KEY] !== undefined) {
      return !!values[HIGHLIGHTER_HEADERS_KEY];
    }
    return !!values[LEGACY_HIGHLIGHTER_HEADERS_KEY];
  }

  function isSupportedScheme(url) {
    const value = String(url || "");
    // webRequest normalizes schemes to lowercase, so a case-sensitive test is
    // sufficient here and avoids lowercasing every URL we see.
    return (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("ws://") ||
      value.startsWith("wss://")
    );
  }

  function hasContainerUserAgents(containerUserAgents) {
    if (!containerUserAgents || typeof containerUserAgents !== "object") {
      return false;
    }
    return Object.keys(containerUserAgents).length > 0;
  }

  /**
   * Whether the blocking listener needs to be attached at all.
   * @param {HeaderRewriteState} state
   */
  function shouldListen(state) {
    const settings = state || {};
    const userAgentActive =
      (!!settings.userAgentEnabled && !!settings.globalUserAgent) ||
      hasContainerUserAgents(settings.containerUserAgents);
    return !!settings.highlighterHeadersEnabled || userAgentActive;
  }

  /**
   * @param {string} cookieStoreId
   * @param {HeaderRewriteState} state
   * @returns {string|null} the User-Agent to send, or null to leave it alone.
   */
  function resolveUserAgent(cookieStoreId, state) {
    const settings = state || {};
    const containerUserAgents = settings.containerUserAgents || {};

    if (cookieStoreId && containerUserAgents[cookieStoreId]) {
      return containerUserAgents[cookieStoreId];
    }
    // Only fall back to the global UA while the global toggle is on, so a
    // leftover stored value can't keep spoofing after the user turns it off.
    if (settings.userAgentEnabled && settings.globalUserAgent) {
      return settings.globalUserAgent;
    }
    return null;
  }

  /**
   * Percent-encodes a container name for transport in a header.
   *
   * Encoding is unconditional so the contract stays deterministic — "encode only
   * when needed" is ambiguous for a name that legitimately contains a `%`. It
   * also removes CR and LF by construction rather than by filtering, so a
   * container name cannot inject headers.
   *
   * @param {string} rawName
   * @returns {string|null} the header value, or `null` when there is nothing to send.
   */
  function encodeContainerName(rawName) {
    if (typeof rawName !== "string") return null;

    const trimmed = rawName.trim();
    if (!trimmed) return null;

    // Truncate by code point: slicing UTF-16 units can split a surrogate pair,
    // and the lone surrogate that leaves behind makes encodeURIComponent throw.
    const codePoints = Array.from(trimmed);
    const capped =
      codePoints.length > MAX_CONTAINER_NAME_LENGTH
        ? codePoints.slice(0, MAX_CONTAINER_NAME_LENGTH).join("")
        : trimmed;

    try {
      return encodeURIComponent(capped) || null;
    } catch {
      // A lone surrogate already present in the name. Nothing sensible to send,
      // and this runs on a blocking listener, so drop the header instead.
      return null;
    }
  }

  /**
   * @param {string} cookieStoreId
   * @param {boolean} highlighterHeadersEnabled
   * @param {Map<string, {color?: string, name?: string}>} containerIdentities
   * @returns {string|null|undefined} the header value, `null` when this request
   *   should not be labelled, or `undefined` when the container is not cached
   *   yet and the caller must look it up.
   */
  function resolveContainerColor(cookieStoreId, highlighterHeadersEnabled, containerIdentities) {
    if (!highlighterHeadersEnabled) return null;
    if (!cookieStoreId || NON_CONTAINER_COOKIE_STORES.has(cookieStoreId)) {
      return null;
    }
    if (!containerIdentities || typeof containerIdentities.has !== "function") {
      return undefined;
    }

    // Test presence, not value. A container whose color is absent or unmapped
    // caches as undefined, and treating that as "uncached" would send every
    // later request for it down the async path forever.
    if (!containerIdentities.has(cookieStoreId)) {
      return undefined;
    }

    const identity = containerIdentities.get(cookieStoreId);
    return COLOR_MAP[identity && identity.color] || null;
  }

  /**
   * The name counterpart of {@link resolveContainerColor}, with the same
   * three-state contract. Gated on the same setting: the name rides the Burp
   * highlighting toggle rather than having one of its own.
   *
   * Additionally withheld until the user confirms a new-enough JAR. A container's
   * colour is one of eight values; its name is arbitrary user text, so it is a
   * far larger disclosure. Only a Highlighter of v1.2.0 or later strips it, and
   * an existing user who had highlighting switched on never consented to
   * sending it — so the name waits until they have seen the notice rather than
   * riding a permission they granted for the colour alone.
   *
   * @param {string} cookieStoreId
   * @param {boolean} highlighterHeadersEnabled
   * @param {Map<string, {color?: string, name?: string}>} containerIdentities
   * @param {boolean} jarAcknowledged true once the user has confirmed a JAR
   *   that strips this header. Anything else withholds the name.
   * @returns {string|null|undefined}
   */
  function resolveContainerName(cookieStoreId, highlighterHeadersEnabled, containerIdentities, jarAcknowledged) {
    if (!highlighterHeadersEnabled) return null;
    // Deliberately `null`, not `undefined`: this is a decision not to send, not
    // a cache miss, so it must not push the request onto the async lookup path.
    // Strictly `true`: a missing argument must fail closed.
    if (jarAcknowledged !== true) return null;
    if (!cookieStoreId || NON_CONTAINER_COOKIE_STORES.has(cookieStoreId)) {
      return null;
    }
    if (!containerIdentities || typeof containerIdentities.has !== "function") {
      return undefined;
    }
    if (!containerIdentities.has(cookieStoreId)) {
      return undefined;
    }

    const identity = containerIdentities.get(cookieStoreId);
    return encodeContainerName(identity && identity.name);
  }

  /**
   * @param {Array<{name?: string, value?: string}>} requestHeaderList
   * @param {string|null} userAgent
   * @param {string|null} color
   * @param {string|null} containerName already percent-encoded
   * @returns {object} `{}` when nothing needs rewriting, so Firefox keeps the
   *   original headers, or `{requestHeaders}` with the replacements applied.
   */
  function buildRequestHeaders(requestHeaderList, userAgent, color, containerName) {
    if (!userAgent && !color && !containerName) return {};

    const lowerColorHeader = COLOR_HEADER_NAME.toLowerCase();
    const lowerNameHeader = NAME_HEADER_NAME.toLowerCase();
    const headers = (requestHeaderList || []).filter((header) => {
      const name = String((header && header.name) || "").toLowerCase();
      if (userAgent && name === "user-agent") return false;
      // Drop any inbound copy whenever we are labelling this request, so a page
      // cannot spoof either header.
      if (color && name === lowerColorHeader) return false;
      if (containerName && name === lowerNameHeader) return false;
      return true;
    });

    if (userAgent) headers.push({ name: "User-Agent", value: userAgent });
    if (color) headers.push({ name: COLOR_HEADER_NAME, value: color });
    if (containerName) headers.push({ name: NAME_HEADER_NAME, value: containerName });

    return { requestHeaders: headers };
  }

  return {
    COLOR_HEADER_NAME,
    NAME_HEADER_NAME,
    HIGHLIGHTER_HEADERS_KEY,
    LEGACY_HIGHLIGHTER_HEADERS_KEY,
    JAR_ACK_VERSION_KEY,
    REQUIRED_JAR_VERSION,
    compareVersions,
    isJarAcknowledged,
    resolveHighlighterHeadersEnabled,
    MAX_CONTAINER_NAME_LENGTH,
    COLOR_MAP,
    NON_CONTAINER_COOKIE_STORES,
    isSupportedScheme,
    hasContainerUserAgents,
    shouldListen,
    resolveUserAgent,
    encodeContainerName,
    resolveContainerColor,
    resolveContainerName,
    buildRequestHeaders,
  };
});
