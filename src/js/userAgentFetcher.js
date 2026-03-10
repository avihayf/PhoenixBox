/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Fetches and caches User-Agent strings from the top-user-agents project.
 * Data is sourced from real-world usage (300M+ requests/month) and automatically
 * filtered to exclude bots.
 */

const UA_CACHE_KEY = "cachedUserAgents";
const UA_CACHE_TIMESTAMP_KEY = "userAgentsCacheTimestamp";
const UA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

const TOP_UA_REV = "e1dad9fe2c6255198fff142e36aaddc5b5adc0d2";
const CDN_URLS = {
  all: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/index.json`,
  desktop: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/desktop.json`,
  mobile: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/mobile.json`
};

const userAgentFetcher = {
  /**
   * Check if cached data exists and is still valid
   */
  async isCacheValid() {
    const stored = await browser.storage.local.get({
      [UA_CACHE_TIMESTAMP_KEY]: 0
    });
    
    const cacheTimestamp = stored[UA_CACHE_TIMESTAMP_KEY];
    if (!cacheTimestamp) return false;
    
    const now = Date.now();
    const age = now - cacheTimestamp;
    
    return age < UA_CACHE_TTL;
  },

  /**
   * Fetch User-Agent lists from CDN
   */
  async fetchFromCDN() {
    const results = {
      all: [],
      desktop: [],
      mobile: []
    };

    try {
      // Fetch all three lists in parallel
      const [allResponse, desktopResponse, mobileResponse] = await Promise.all([
        fetch(CDN_URLS.all),
        fetch(CDN_URLS.desktop),
        fetch(CDN_URLS.mobile)
      ]);

      const validateUAData = (data) =>
        Array.isArray(data) &&
        data.length > 0 &&
        data.every(item => typeof item === "string" && item.length > 0 && item.length <= 1024);

      if (allResponse.ok) {
        const data = await allResponse.json();
        if (validateUAData(data)) results.all = data;
      }
      if (desktopResponse.ok) {
        const data = await desktopResponse.json();
        if (validateUAData(data)) results.desktop = data;
      }
      if (mobileResponse.ok) {
        const data = await mobileResponse.json();
        if (validateUAData(data)) results.mobile = data;
      }

      // Validate we got at least some data
      if (results.all.length === 0 && results.desktop.length === 0 && results.mobile.length === 0) {
        throw new Error("No User-Agent data received from CDN");
      }

      // Save to storage
      await browser.storage.local.set({
        [UA_CACHE_KEY]: results,
        [UA_CACHE_TIMESTAMP_KEY]: Date.now()
      });

      return results;
    } catch (error) {
      console.error("Failed to fetch User-Agents from CDN:", error);
      
      // Try to return cached data as fallback
      const cached = await this.getCached();
      if (cached) {
        return cached;
      }
      
      throw error;
    }
  },

  /**
   * Get cached User-Agent lists (even if stale)
   */
  async getCached() {
    const stored = await browser.storage.local.get({
      [UA_CACHE_KEY]: null
    });
    
    return stored[UA_CACHE_KEY];
  },

  /**
   * Get User-Agent lists, fetching if needed
   */
  async getUserAgents(forceRefresh = false) {
    // If force refresh requested, fetch from CDN
    if (forceRefresh) {
      return await this.fetchFromCDN();
    }

    // Check if cache is valid
    const isValid = await this.isCacheValid();
    
    if (isValid) {
      // Use cached data
      const cached = await this.getCached();
      if (cached) {
        return cached;
      }
    }

    // Cache is invalid or doesn't exist, fetch from CDN
    return await this.fetchFromCDN();
  },

  /**
   * Parse User-Agent string to create a friendly display name
   * Example: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..." -> "Chrome 143 - Windows 10"
   */
  parseUserAgentForDisplay(userAgent) {
    if (!userAgent) return "Unknown";

    // Extract browser name and version
    let browser = "Unknown";
    let version = "";
    let os = "";

    // Detect browser
    if (userAgent.includes("Edg/")) {
      const match = userAgent.match(/Edg\/([\d.]+)/);
      browser = "Edge";
      version = match ? match[1].split(".")[0] : "";
    } else if (userAgent.includes("Chrome/")) {
      const match = userAgent.match(/Chrome\/([\d.]+)/);
      browser = "Chrome";
      version = match ? match[1].split(".")[0] : "";
    } else if (userAgent.includes("Firefox/")) {
      const match = userAgent.match(/Firefox\/([\d.]+)/);
      browser = "Firefox";
      version = match ? match[1].split(".")[0] : "";
    } else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome")) {
      const match = userAgent.match(/Version\/([\d.]+)/);
      browser = "Safari";
      version = match ? match[1].split(".")[0] : "";
    } else if (userAgent.includes("OPR/") || userAgent.includes("Opera/")) {
      const match = userAgent.match(/OPR\/([\d.]+)/) || userAgent.match(/Opera\/([\d.]+)/);
      browser = "Opera";
      version = match ? match[1].split(".")[0] : "";
    }

    // Detect OS
    if (userAgent.includes("Windows NT 10.0")) {
      os = "Windows 10";
    } else if (userAgent.includes("Windows NT 6.3")) {
      os = "Windows 8.1";
    } else if (userAgent.includes("Windows NT 6.2")) {
      os = "Windows 8";
    } else if (userAgent.includes("Windows NT 6.1")) {
      os = "Windows 7";
    } else if (userAgent.includes("Windows")) {
      os = "Windows";
    } else if (userAgent.includes("Mac OS X 10_15")) {
      os = "macOS 10.15";
    } else if (userAgent.includes("Mac OS X")) {
      const match = userAgent.match(/Mac OS X ([\d_]+)/);
      if (match) {
        os = "macOS " + match[1].replace(/_/g, ".");
      } else {
        os = "macOS";
      }
    } else if (userAgent.includes("Linux")) {
      os = "Linux";
    } else if (userAgent.includes("Android")) {
      const match = userAgent.match(/Android ([\d.]+)/);
      os = match ? "Android " + match[1] : "Android";
    } else if (userAgent.includes("iPhone")) {
      const match = userAgent.match(/iPhone OS ([\d_]+)/);
      os = match ? "iOS " + match[1].replace(/_/g, ".") : "iOS";
    } else if (userAgent.includes("iPad")) {
      const match = userAgent.match(/CPU OS ([\d_]+)/);
      os = match ? "iPadOS " + match[1].replace(/_/g, ".") : "iPadOS";
    }

    // Build display name
    let displayName = browser;
    if (version) {
      displayName += " " + version;
    }
    if (os) {
      displayName += " - " + os;
    }

    return displayName;
  },

  /**
   * Get cache status information
   */
  async getCacheStatus() {
    const stored = await browser.storage.local.get({
      [UA_CACHE_KEY]: null,
      [UA_CACHE_TIMESTAMP_KEY]: 0
    });

    const cached = stored[UA_CACHE_KEY];
    const timestamp = stored[UA_CACHE_TIMESTAMP_KEY];
    
    let count = 0;
    if (cached) {
      count = (cached.all?.length || 0) + (cached.desktop?.length || 0) + (cached.mobile?.length || 0);
    }

    return {
      exists: !!cached,
      timestamp: timestamp,
      lastUpdated: timestamp ? new Date(timestamp) : null,
      isValid: await this.isCacheValid(),
      count: count
    };
  }
};

// Make it available globally for popup and background scripts
if (typeof window !== "undefined") {
  window.userAgentFetcher = userAgentFetcher;
}

