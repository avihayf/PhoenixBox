// Typed client for the background page's runtime.onMessage handler.
//
// The background contract is not uniform: five methods read their arguments
// from a nested `message` object while the rest read them off the top level
// (see the switch in src/js/background/messageHandler.js). That split is
// encoded once here, so a call site can no longer get it wrong — previously
// every caller had to remember which convention its method used, and the
// mistake would have been silent.
//
// Keep the method names and payload shapes in sync with messageHandler.js.
import { requireWebExt } from "./browser";

type UserContextId = string | number | false;

function send<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return requireWebExt().runtime.sendMessage(payload) as Promise<T>;
}

/* -------------------------------------------------------------------------
 * Containers — these five take a nested `message` object.
 * ---------------------------------------------------------------------- */

export function deleteContainer(userContextId: UserContextId) {
  return send({ method: "deleteContainer", message: { userContextId } });
}

export function deleteContainerDataOnly(userContextId: UserContextId) {
  return send({ method: "deleteContainerDataOnly", message: { userContextId } });
}

export function getAssignmentObjectByContainer<T = Record<string, unknown>>(
  userContextId: UserContextId
) {
  return send<T>({
    method: "getAssignmentObjectByContainer",
    message: { userContextId },
  });
}

export type ContainerParams = { name: string; color: string; icon: string };

export function createOrUpdateContainer<T = unknown>(
  userContextId: UserContextId | "new",
  params: ContainerParams
) {
  return send<T>({
    method: "createOrUpdateContainer",
    message: { userContextId, params },
  });
}

export function queryIdentitiesState<T = Record<string, unknown>>(windowId: number | null) {
  return send<T>({ method: "queryIdentitiesState", message: { windowId } });
}

/* -------------------------------------------------------------------------
 * Tabs and containers — flat payloads.
 *
 * windowId is `number | null` because App holds it as state that is populated
 * asynchronously at startup, so a handler firing before that resolves passes
 * null. That was already true before these wrappers existed; the types just
 * make it visible. The background forwards it to browser.tabs.query.
 * ---------------------------------------------------------------------- */

export function showTabs(cookieStoreId: string) {
  return send({ method: "showTabs", cookieStoreId });
}

/** Hides the container's tabs in every window; no windowId to get wrong. */
export function hideTabs(cookieStoreId: string) {
  return send({ method: "hideTabs", cookieStoreId });
}

/** Consolidates the container's tabs from every window; no windowId needed. */
export function moveTabsToWindow(cookieStoreId: string) {
  return send({ method: "moveTabsToWindow", cookieStoreId });
}

export function sortTabs() {
  return send({ method: "sortTabs" });
}

export function addRemoveSiteIsolation(cookieStoreId: string, remove: boolean) {
  return send({ method: "addRemoveSiteIsolation", cookieStoreId, remove });
}

/* -------------------------------------------------------------------------
 * Site assignments.
 * ---------------------------------------------------------------------- */

/**
 * @param tabId where to show the in-page confirmation; null to skip it.
 * @param url the assignment being added or removed.
 * @param value true removes the assignment, false adds it.
 */
export function setOrRemoveAssignment(
  tabId: number | null | undefined,
  url: string,
  userContextId: UserContextId,
  value: boolean
) {
  return send({ method: "setOrRemoveAssignment", tabId, url, userContextId, value });
}

/** Takes a hostname, despite what "site" suggests — see _resetCookiesForSite. */
export function resetCookiesForSite(hostname: string, cookieStoreId: string) {
  return send({ method: "resetCookiesForSite", hostname, cookieStoreId });
}

export type ReloadInContainerArgs = {
  url: string;
  currentUserContextId: UserContextId;
  newUserContextId: UserContextId;
  tabIndex: number;
  active: boolean;
  groupId?: number;
};

export function reloadInContainer(args: ReloadInContainerArgs) {
  return send({ method: "reloadInContainer", ...args });
}

export function assignAndReloadInContainer(args: ReloadInContainerArgs) {
  return send({ method: "assignAndReloadInContainer", ...args });
}

/* -------------------------------------------------------------------------
 * Global proxy.
 * ---------------------------------------------------------------------- */

export function setGlobalProxyConfig<T = unknown>(proxy: Record<string, unknown>) {
  return send<T>({ method: "setGlobalProxyConfig", proxy });
}

export function clearGlobalProxyConfig() {
  return send({ method: "clearGlobalProxyConfig" });
}

/* -------------------------------------------------------------------------
 * Mozilla VPN.
 * ---------------------------------------------------------------------- */

export function vpnAttemptPort() {
  return send({ method: "MozillaVPN_attemptPort" });
}

export function vpnQueryStatus() {
  return send({ method: "MozillaVPN_queryStatus" });
}

export function vpnQueryServers() {
  return send({ method: "MozillaVPN_queryServers" });
}

export function vpnGetInstallationStatus<T = unknown>() {
  return send<T>({ method: "MozillaVPN_getInstallationStatus" });
}

export function vpnGetConnectionStatus<T = unknown>() {
  return send<T>({ method: "MozillaVPN_getConnectionStatus" });
}

/* -------------------------------------------------------------------------
 * Sync.
 * ---------------------------------------------------------------------- */

export function resetSync() {
  return send({ method: "resetSync" });
}
