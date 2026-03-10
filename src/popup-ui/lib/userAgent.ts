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
const UA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const TOP_UA_REV = "e1dad9fe2c6255198fff142e36aaddc5b5adc0d2";
const CDN_URLS: Record<UserAgentCategory, string> = {
  all: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/index.json`,
  desktop: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/desktop.json`,
  mobile: `https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@${TOP_UA_REV}/src/mobile.json`,
};

async function isCacheValid(): Promise<boolean> {
  const browser = requireWebExt();
  const stored = await browser.storage.local.get({
    [UA_CACHE_TIMESTAMP_KEY]: 0,
  });

  const cacheTimestamp = stored[UA_CACHE_TIMESTAMP_KEY] as number;
  if (!cacheTimestamp) return false;

  return Date.now() - cacheTimestamp < UA_CACHE_TTL;
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
      fetch(CDN_URLS.all),
      fetch(CDN_URLS.desktop),
      fetch(CDN_URLS.mobile),
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

export function parseUserAgentForDisplay(userAgent: string): string {
  if (!userAgent) return "Unknown";

  let browser = "Unknown";
  let version = "";
  let os = "";

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
    os = match ? `macOS ${match[1].replace(/_/g, ".")}` : "macOS";
  } else if (userAgent.includes("Linux")) {
    os = "Linux";
  } else if (userAgent.includes("Android")) {
    const match = userAgent.match(/Android ([\d.]+)/);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (userAgent.includes("iPhone")) {
    const match = userAgent.match(/iPhone OS ([\d_]+)/);
    os = match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  } else if (userAgent.includes("iPad")) {
    const match = userAgent.match(/CPU OS ([\d_]+)/);
    os = match ? `iPadOS ${match[1].replace(/_/g, ".")}` : "iPadOS";
  }

  let displayName = browser;
  if (version) {
    displayName += ` ${version}`;
  }
  if (os) {
    displayName += ` - ${os}`;
  }

  return displayName;
}
