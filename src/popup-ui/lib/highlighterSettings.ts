// Burp highlighting by listener: each container marked with the Highlighter
// button gets its own Burp proxy listener, opened by the PhoenixBox Highlighter
// JAR, so Burp knows the container from the port its traffic arrives on.
// Requests are never modified.
//
// The background side lives in src/js/background/highlighterSync.js. Keep the
// keys and parsers here in sync with src/js/shared/highlighterSyncHelpers.js;
// test/highlighter-settings.test.mjs pins them together.

export const MARKS_KEY = "highlighterContainerIds";
export const PINS_KEY = "highlighterPins";
export const PAIRING_KEY = "highlighterPairing";
export const STATUS_KEY = "highlighterStatus";

/** Where to get the JAR. The releases page, not a pinned asset: it cannot 404. */
export const HIGHLIGHTER_RELEASES_URL =
  "https://github.com/avihayf/PhoenixBox-Highlighter/releases/latest";

export interface HighlighterPairing {
  host: string;
  port: number;
  token: string;
}

/** Written by the background after every sync attempt. */
export interface HighlighterStatus {
  state: "unpaired" | "connected" | "error";
  message?: string;
  jar?: string | null;
  at?: number;
  /** cookieStoreId -> "ip:port" the container's traffic is going to. */
  addresses?: Record<string, string>;
  /** cookieStoreId -> why it has no listener. */
  errors?: Record<string, string>;
}

export interface Address {
  host: string;
  port: number;
}

export function parseAddress(value: unknown): Address | null {
  if (typeof value !== "string") return null;
  const match = /^(?:\[([0-9a-fA-F:.]+)\]|([^\s:[\]]+)):(\d{1,5})$/.exec(value.trim());
  if (!match) return null;
  const port = Number(match[3]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  let host = (match[1] || match[2]).toLowerCase();
  if (host === "localhost") host = "127.0.0.1";
  return { host, port };
}

export function formatAddress(address: Address): string {
  const host = address.host.includes(":") ? `[${address.host}]` : address.host;
  return `${host}:${address.port}`;
}

/** Reads the "phx1:<host>:<port>:<token>" string from Burp's PhoenixBox tab. */
export function parsePairingString(value: unknown): HighlighterPairing | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("phx1:")) return null;

  const lastColon = trimmed.lastIndexOf(":");
  const token = trimmed.slice(lastColon + 1);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;

  const address = parseAddress(trimmed.slice("phx1:".length, lastColon));
  if (!address) return null;
  return { host: address.host, port: address.port, token };
}

export function sanitizeMarks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id === "string" && /^firefox-container-\d+$/.test(id)) seen.add(id);
  }
  return [...seen];
}

export function toggleMark(marks: string[], cookieStoreId: string): string[] {
  return marks.includes(cookieStoreId)
    ? marks.filter((id) => id !== cookieStoreId)
    : [...marks, cookieStoreId];
}

export function isPaired(pairing: unknown): pairing is HighlighterPairing {
  if (!pairing || typeof pairing !== "object") return false;
  const p = pairing as Record<string, unknown>;
  return typeof p.host === "string" && Number.isInteger(p.port) && typeof p.token === "string";
}

/** One line for the popup's Highlighter tile and modal. */
export function describeStatus(status: HighlighterStatus | null | undefined, paired: boolean): string {
  if (!paired || !status || status.state === "unpaired") return "Not paired with Burp";
  if (status.state === "error") return status.message || "Can't reach the Highlighter";
  const count = Object.keys(status.addresses || {}).length;
  const jar = status.jar ? ` v${status.jar}` : "";
  return `Connected to Highlighter${jar} · ${count} listener${count === 1 ? "" : "s"}`;
}
