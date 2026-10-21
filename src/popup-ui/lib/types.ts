// Shared shapes for the popup UI.
//
// These were previously redeclared in App.tsx and in each view that consumed
// them, and the copies drifted: several views omitted visibleTabCount and
// hiddenTabCount, which is what made passing a Container back out of a view
// into App's state setters fail to typecheck. App is the only producer of
// these values, so there is one definition rather than a base/derived split.

export type Container = {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
  displayIcon: string;
  tabCount: number;
  visibleTabCount: number;
  hiddenTabCount: number;
  proxyUrl?: string;
  proxySource?: string;
  isIsolated?: boolean;
  userAgent?: string;
};

export type Tab = {
  id: number;
  title: string;
  url: string;
  favicon?: string;
};

export type AssignedSite = {
  key: string;
  hostname: string;
};

export const PROXY_TYPES = ["http", "https", "socks", "socks4"] as const;

export type ProxyType = (typeof PROXY_TYPES)[number];

/**
 * Storage can hold any string here (it is also written by the background page
 * and by older versions), so narrow it before it reaches the form, defaulting
 * to http the way the form's own initializer does.
 */
export function toProxyType(value: unknown): ProxyType {
  return PROXY_TYPES.includes(value as ProxyType) ? (value as ProxyType) : "http";
}
