import { requireWebExt } from "./browser";
import { logError, logWarn } from "./logger";

export type UserAgentCategory = "all" | "desktop" | "mobile";

export type UserAgentData = {
  all: string[];
  desktop: string[];
  mobile: string[];
};

const UA_CACHE_KEY = "cachedUserAgents";
const UA_CACHE_TIMESTAMP_KEY = "userAgentsCacheTimestamp";
// The revision the cached lists were fetched from. The CDN URLs are pinned
// to one commit, so its content can never change: a cache from this revision
// is valid forever, and only bumping TOP_UA_REV triggers a new download.
const UA_CACHE_REV_KEY = "userAgentsCacheRev";
// A stalled CDN must not leave callers waiting indefinitely.
const FETCH_TIMEOUT_MS = 8000;

const TOP_UA_REV = "e1dad9fe2c6255198fff142e36aaddc5b5adc0d2";
const CDN_URLS: Record<UserAgentCategory, string> = {
  all: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/index.json`,
  desktop: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/desktop.json`,
  mobile: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/mobile.json`,
};

async function isCacheValid(): Promise<boolean> {
  const browser = requireWebExt();
  const stored = await browser.storage.local.get({ [UA_CACHE_REV_KEY]: null });
  return stored[UA_CACHE_REV_KEY] === TOP_UA_REV;
}

async function getCached(): Promise<UserAgentData | null> {
  const browser = requireWebExt();
  const stored = await browser.storage.local.get({
    [UA_CACHE_KEY]: null,
  });

  return (stored[UA_CACHE_KEY] as UserAgentData | null) || null;
}

async function fetchFromCDN(): Promise<UserAgentData> {
  const results: UserAgentData = {
    all: [],
    desktop: [],
    mobile: [],
  };

  try {
    const [allResponse, desktopResponse, mobileResponse] = await Promise.all([
      fetch(CDN_URLS.all, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
      fetch(CDN_URLS.desktop, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
      fetch(CDN_URLS.mobile, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    ]);

    const validateUAData = (data: any): data is string[] =>
      Array.isArray(data) &&
      data.length > 0 &&
      data.every((item) => typeof item === "string" && item.length > 0 && item.length <= 1024);

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

    if (
      results.all.length === 0 &&
      results.desktop.length === 0 &&
      results.mobile.length === 0
    ) {
      throw new Error("No User-Agent data received from CDN");
    }

    const browser = requireWebExt();
    await browser.storage.local.set({
      [UA_CACHE_KEY]: results,
      [UA_CACHE_TIMESTAMP_KEY]: Date.now(),
      [UA_CACHE_REV_KEY]: TOP_UA_REV,
    });

    return results;
  } catch (error) {
    logError("Failed to fetch User-Agents from CDN:", error);

    const cached = await getCached();
    if (cached) {
      logWarn("Using stale cached User-Agents as fallback");
      return cached;
    }

    throw error;
  }
}

export async function getUserAgents(forceRefresh = false): Promise<UserAgentData> {
  if (forceRefresh) {
    return fetchFromCDN();
  }

  const valid = await isCacheValid();
  if (valid) {
    const cached = await getCached();
    if (cached) return cached;
  }

  return fetchFromCDN();
}

export { parseUserAgentForDisplay } from "./userAgentDisplay";
