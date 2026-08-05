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
   * @property {boolean} colorHeaderEnabled
   * @property {boolean} userAgentEnabled
   * @property {string|null} globalUserAgent
   * @property {Object<string,string>} containerUserAgents
   *
   * Field names deliberately match the properties on the requestHeaders
   * module, so it can pass `this` straight through. Building a fresh object
   * per request would allocate on the hot path of a blocking listener.
   */

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
    return !!settings.colorHeaderEnabled || userAgentActive;
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
   * @param {string} cookieStoreId
   * @param {boolean} colorHeaderEnabled
   * @param {Map<string, string>} containerColors cookieStoreId -> Firefox color
   * @returns {string|null|undefined} the header value, `null` when this request
   *   should not be labelled, or `undefined` when the container's color is not
   *   cached yet and the caller must look it up.
   */
  function resolveContainerColor(cookieStoreId, colorHeaderEnabled, containerColors) {
    if (!colorHeaderEnabled) return null;
    if (!cookieStoreId || NON_CONTAINER_COOKIE_STORES.has(cookieStoreId)) {
      return null;
    }
    if (!containerColors || typeof containerColors.has !== "function") {
      return undefined;
    }

    // Test presence, not value. A container whose color is absent or unmapped
    // caches as undefined, and treating that as "uncached" would send every
    // later request for it down the async path forever.
    if (!containerColors.has(cookieStoreId)) {
      return undefined;
    }
    return COLOR_MAP[containerColors.get(cookieStoreId)] || null;
  }

  /**
   * @param {Array<{name?: string, value?: string}>} requestHeaderList
   * @param {string|null} userAgent
   * @param {string|null} color
   * @returns {object} `{}` when nothing needs rewriting, so Firefox keeps the
   *   original headers, or `{requestHeaders}` with the replacements applied.
   */
  function buildRequestHeaders(requestHeaderList, userAgent, color) {
    if (!userAgent && !color) return {};

    const lowerColorHeader = COLOR_HEADER_NAME.toLowerCase();
    const headers = (requestHeaderList || []).filter((header) => {
      const name = String((header && header.name) || "").toLowerCase();
      if (userAgent && name === "user-agent") return false;
      if (color && name === lowerColorHeader) return false;
      return true;
    });

    if (userAgent) headers.push({ name: "User-Agent", value: userAgent });
    if (color) headers.push({ name: COLOR_HEADER_NAME, value: color });

    return { requestHeaders: headers };
  }

  return {
    COLOR_HEADER_NAME,
    COLOR_MAP,
    NON_CONTAINER_COOKIE_STORES,
    isSupportedScheme,
    hasContainerUserAgents,
    shouldListen,
    resolveUserAgent,
    resolveContainerColor,
    buildRequestHeaders,
  };
});
