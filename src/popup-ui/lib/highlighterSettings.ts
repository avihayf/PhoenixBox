// Burp highlighting, one switch (the Highlighter tile), two modes:
//   - Paired with Phoenix Highlighter v2 (automatic, after one Allow in Burp):
//     each container with an open tab gets its own Burp listener, kept for 15 s
//     after its last tab closes, and requests are never modified.
//   - Not paired: containers carry the legacy X-MAC-Container-Color header,
//     which the old v1.x JAR (and an unpaired v2) colour and strip.
//
// The background side lives in src/js/background/highlighterSync.js. Keep the
// keys and parsers here in sync with src/js/shared/highlighterSyncHelpers.js;
// test/highlighter-settings.test.mjs pins them together.

/** The Highlighter tile's on/off switch. */
export const ENABLED_KEY = "highlighterEnabled";
export const PINS_KEY = "highlighterPins";
export const PAIRING_KEY = "highlighterPairing";
export const STATUS_KEY = "highlighterStatus";
/** Written by the Connect button: the background looks for the Highlighter now. */
export const CONNECT_REQUEST_KEY = "highlighterConnectRequest";
/** Set by Unpair, cleared by Connect: stops PhoenixBox pairing again on its own. */
export const AUTO_PAIR_PAUSED_KEY = "highlighterAutoPairPaused";

/**
 * Downloads the Highlighter JAR itself from its newest GitHub release (v2.0.0
 * when 3.1.0 shipped). Every release must keep the asset name
 * PhoenixBoxHighlighter.jar, or this link 404s.
 */
export const HIGHLIGHTER_DOWNLOAD_URL =
  "https://github.com/avihayf/PhoenixBox-Highlighter/releases/latest/download/PhoenixBoxHighlighter.jar";

export interface HighlighterPairing {
  host: string;
  port: number;
  token: string;
}

/** Written by the background after every sync attempt. */
export interface HighlighterStatus {
  state: "off" | "unpaired" | "searching" | "awaiting" | "denied" | "legacy" | "connected" | "error";
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

export function isPaired(pairing: unknown): pairing is HighlighterPairing {
  if (!pairing || typeof pairing !== "object") return false;
  const p = pairing as Record<string, unknown>;
  return typeof p.host === "string" && Number.isInteger(p.port) && typeof p.token === "string";
}

/** One line for the popup's Highlighter tile and modal. */
export function describeStatus(status: HighlighterStatus | null | undefined, paired: boolean, enabled = true): string {
  const state = status?.state;
  if (!enabled) {
    return paired
      ? "Off. Turn the Highlighter on to give every open container its own Burp listener."
      : "Off. Turn the Highlighter on, or press Connect, to find Phoenix Highlighter in Burp.";
  }
  if (paired && state === "connected") {
    const count = Object.keys(status?.addresses || {}).length;
    const jar = status?.jar ? ` v${status.jar}` : "";
    return `Connected to Highlighter${jar} · ${count} listener${count === 1 ? "" : "s"}`;
  }
  // Just switched on: nothing has been tried yet, so nothing has failed.
  if (paired && (!state || state === "off")) return "Connecting to the Highlighter…";
  if (paired) return status?.message || "Can't reach the Highlighter";

  switch (state) {
  case "searching":
    return "Looking for Phoenix Highlighter in Burp…";
  case "awaiting":
    return status?.message || "Click Allow in Burp's PhoenixBox tab to pair PhoenixBox.";
  case "denied":
    return "Pairing was denied in Burp. Containers use the legacy colour header. Press Connect to ask again.";
  case "legacy":
    return status?.message || "No Phoenix Highlighter v2 found. Containers use the legacy colour header (works with v1.x).";
  default:
    return "Not paired. Press Connect to find Phoenix Highlighter in Burp.";
  }
}

/**
 * The Highlighter tile's status dot: null while switched off, "ok" when
 * paired and connected, "bad" when it failed or was denied, and "pending"
 * otherwise (connecting, waiting for Allow, or the legacy colour header).
 */
export function statusTone(
  status: HighlighterStatus | null | undefined, paired: boolean, enabled: boolean,
): "ok" | "pending" | "bad" | null {
  if (!enabled) return null;
  const state = status?.state;
  if (paired && state === "connected") return "ok";
  if (state === "error" || state === "denied") return "bad";
  return "pending";
}
