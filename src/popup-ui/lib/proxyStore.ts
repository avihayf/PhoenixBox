// Single owner of the `proxifiedContainersKey` storage schema.
//
// This is a flat array of { cookieStoreId, proxy } records rather than a map,
// because the background's proxified-containers.js reads the same key. Six
// places in the popup previously open-coded the read/find/splice/write cycle,
// which meant six chances to get the shape or the merge semantics wrong.
//
// Keep in sync with src/js/proxified-containers.js.
import { requireWebExt } from "./browser";

/** Exported so storage.onChanged watchers do not repeat the literal. */
export const PROXY_STORAGE_KEY = "proxifiedContainersKey";
const STORAGE_KEY = PROXY_STORAGE_KEY;

/** Shape stored per container. VPN entries additionally carry countryCode/cityName. */
export type ContainerProxy = {
  type?: string | null;
  host?: string;
  port?: number | string;
  mozProxyEnabled?: boolean;
  proxyDNS?: boolean;
  source?: string;
  countryCode?: string;
  cityName?: string;
  [key: string]: unknown;
};

export type ProxyEntry = {
  cookieStoreId: string;
  proxy: ContainerProxy;
};

export async function readProxyEntries(): Promise<ProxyEntry[]> {
  const browser = requireWebExt();
  const stored = await browser.storage.local.get({ [STORAGE_KEY]: [] });
  const value = (stored as Record<string, unknown>)[STORAGE_KEY];
  return Array.isArray(value) ? (value as ProxyEntry[]) : [];
}

/** cookieStoreId -> proxy, for callers that need to look up many containers. */
export async function readProxyMap(): Promise<Map<string, ContainerProxy>> {
  const entries = await readProxyEntries();
  return new Map(entries.map((entry) => [entry.cookieStoreId, entry.proxy]));
}

export async function getProxyForContainer(
  cookieStoreId: string
): Promise<ContainerProxy | null> {
  const entries = await readProxyEntries();
  return entries.find((entry) => entry.cookieStoreId === cookieStoreId)?.proxy ?? null;
}

async function write(entries: ProxyEntry[]): Promise<void> {
  await requireWebExt().storage.local.set({ [STORAGE_KEY]: entries });
}

/**
 * Replace this container's proxy outright, or remove it when proxy is null.
 * Storage is left untouched when removing an entry that was not there.
 */
export async function setProxyForContainer(
  cookieStoreId: string,
  proxy: ContainerProxy | null
): Promise<void> {
  const entries = await readProxyEntries();
  const idx = entries.findIndex((entry) => entry.cookieStoreId === cookieStoreId);

  if (!proxy) {
    if (idx === -1) return;
    entries.splice(idx, 1);
    await write(entries);
    return;
  }

  if (idx === -1) {
    entries.push({ cookieStoreId, proxy });
  } else {
    entries[idx] = { cookieStoreId, proxy };
  }
  await write(entries);
}

/**
 * Merge over the container's existing proxy rather than replacing it.
 *
 * The simple URL field in the edit view only knows type/host/port, so a plain
 * replace would silently drop settings reached from Advanced Proxy Settings,
 * such as proxyDNS.
 */
export async function mergeProxyForContainer(
  cookieStoreId: string,
  patch: ContainerProxy
): Promise<void> {
  const entries = await readProxyEntries();
  const idx = entries.findIndex((entry) => entry.cookieStoreId === cookieStoreId);
  const existing = idx === -1 ? {} : entries[idx].proxy;
  const merged = { ...existing, ...patch };

  if (idx === -1) {
    entries.push({ cookieStoreId, proxy: merged });
  } else {
    entries[idx] = { cookieStoreId, proxy: merged };
  }
  await write(entries);
}

export async function removeProxyForContainer(cookieStoreId: string): Promise<void> {
  const entries = await readProxyEntries();
  const remaining = entries.filter((entry) => entry.cookieStoreId !== cookieStoreId);
  if (remaining.length === entries.length) return;
  await write(remaining);
}
