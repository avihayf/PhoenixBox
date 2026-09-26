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
  /**
   * @typedef {object} HeaderRewriteState
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
    return userAgentActive;
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
   * Burp highlighting no longer touches requests (see highlighterSyncHelpers.js),
   * so the User-Agent is the only header rewritten.
   *
   * @param {Array<{name?: string, value?: string}>} requestHeaderList
   * @param {string|null} userAgent
   * @returns {object} `{}` when nothing needs rewriting, so Firefox keeps the
   *   original headers, or `{requestHeaders}` with the replacement applied.
   */
  function buildRequestHeaders(requestHeaderList, userAgent) {
    if (!userAgent) return {};

    const headers = (requestHeaderList || []).filter((header) =>
      String((header && header.name) || "").toLowerCase() !== "user-agent"
    );
    headers.push({ name: "User-Agent", value: userAgent });
    return { requestHeaders: headers };
  }

  return {
    isSupportedScheme,
    hasContainerUserAgents,
    shouldListen,
    resolveUserAgent,
    buildRequestHeaders,
  };
});
