// Burp highlighting, two modes:
//   - Paired with Phoenix Highlighter v2 (automatic, after one Allow in Burp):
//     each marked container gets its own Burp listener, and requests are never
//     modified.
//   - Not paired: marked containers carry the legacy X-MAC-Container-Color
//     header, which the old v1.x JAR (and an unpaired v2) colour and strip.
//
// The background side lives in src/js/background/highlighterSync.js. Keep the
// keys and parsers here in sync with src/js/shared/highlighterSyncHelpers.js;
// test/highlighter-settings.test.mjs pins them together.

export const MARKS_KEY = "highlighterContainerIds";
export const PINS_KEY = "highlighterPins";
export const PAIRING_KEY = "highlighterPairing";
export const STATUS_KEY = "highlighterStatus";
/** Written by the Connect button: the background looks for the Highlighter now. */
export const CONNECT_REQUEST_KEY = "highlighterConnectRequest";
/** Set by Unpair, cleared by Connect: stops PhoenixBox pairing again on its own. */
export const AUTO_PAIR_PAUSED_KEY = "highlighterAutoPairPaused";

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
  state: "unpaired" | "searching" | "awaiting" | "denied" | "legacy" | "connected" | "error";
  message?: string;
  jar?: string | null;
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
  const state = status?.state;
  if (paired && state === "connected") {
    const count = Object.keys(status?.addresses || {}).length;
    const jar = status?.jar ? ` v${status.jar}` : "";
    return `Connected to Highlighter${jar} · ${count} listener${count === 1 ? "" : "s"}`;
  }
  if (paired) return status?.message || "Can't reach the Highlighter";

  switch (state) {
  case "searching":
    return "Looking for Phoenix Highlighter in Burp…";
  case "awaiting":
    return status?.message || "Click Allow in Burp's PhoenixBox tab to pair PhoenixBox.";
  case "denied":
    return "Pairing was denied in Burp. Marked containers use the legacy colour header. Press Connect to ask again.";
  case "legacy":
    return status?.message || "No Phoenix Highlighter v2 found. Marked containers use the legacy colour header (works with v1.x).";
  default:
    return "Not paired. Mark a container, or press Connect, to find Phoenix Highlighter in Burp.";
  }
}

/** Whether PhoenixBox is working without a v2 pairing, with the legacy colour header. */
export function isLegacyMode(paired: boolean, marks: string[]): boolean {
  return !paired && marks.length > 0;
}
