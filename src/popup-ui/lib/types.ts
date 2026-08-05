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
