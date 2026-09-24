// The Burp Highlighter toggle, which arms both the container-colour and the
// container-name request header.
//
// The key was renamed once it started gating a second header. Readers fall back
// to the legacy name so a profile written by an older version keeps its setting
// regardless of whether the background migration has run yet.
//
// Keep in sync with HIGHLIGHTER_HEADERS_KEY in src/js/shared/requestHeaderHelpers.js.

export const HIGHLIGHTER_HEADERS_KEY = "highlighterHeadersEnabled";
export const LEGACY_HIGHLIGHTER_HEADERS_KEY = "addContainerColorHeaderEnabled";

/** Defaults to request in a storage.local.get so both keys come back. */
export const HIGHLIGHTER_STORAGE_DEFAULTS = {
  [HIGHLIGHTER_HEADERS_KEY]: undefined as boolean | undefined,
  [LEGACY_HIGHLIGHTER_HEADERS_KEY]: false,
};

export function resolveHighlighterHeadersEnabled(
  stored: Record<string, unknown> | null | undefined
): boolean {
  const values = stored || {};
  if (values[HIGHLIGHTER_HEADERS_KEY] !== undefined) {
    return !!values[HIGHLIGHTER_HEADERS_KEY];
  }
  return !!values[LEGACY_HIGHLIGHTER_HEADERS_KEY];
}

/**
 * Pick the new value out of a storage.onChanged batch, or undefined when the
 * batch says nothing about this setting. Both names are watched because an
 * un-migrated profile can still be written under the legacy key.
 */
export function highlighterChangeValue(
  changes: Record<string, { newValue?: unknown }>
): boolean | undefined {
  if (changes[HIGHLIGHTER_HEADERS_KEY]) {
    return !!changes[HIGHLIGHTER_HEADERS_KEY].newValue;
  }
  if (changes[LEGACY_HIGHLIGHTER_HEADERS_KEY]) {
    return !!changes[LEGACY_HIGHLIGHTER_HEADERS_KEY].newValue;
  }
  return undefined;
}

/* ---------------------------------------------------------------------------
 * JAR acknowledgement — gates the X-MAC-Container-Name header.
 *
 * Keep in sync with JAR_ACK_VERSION_KEY / REQUIRED_JAR_VERSION /
 * isJarAcknowledged in src/js/shared/requestHeaderHelpers.js (a parity test in
 * test/highlighter-settings.test.mjs pins them together).
 * ------------------------------------------------------------------------- */

export const JAR_ACK_VERSION_KEY = "highlighterJarAckVersion";
export const REQUIRED_JAR_VERSION = "1.2.0";

/** Where to get the JAR. The releases page, not a pinned asset: it cannot 404. */
export const HIGHLIGHTER_RELEASES_URL =
  "https://github.com/avihayf/PhoenixBox-Highlighter/releases/latest";

export function compareVersions(a: unknown, b: unknown): number {
  const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isJarAcknowledged(ackVersion: unknown, required = REQUIRED_JAR_VERSION): boolean {
  if (!ackVersion) return false;
  return compareVersions(ackVersion, required) >= 0;
}

export type HighlighterNotice = "setup" | "confirm" | null;

/** What to show when the popup opens. Reminds only people using the feature. */
export function noticeOnPopupOpen(enabled: boolean, acknowledged: boolean): HighlighterNotice {
  return enabled && !acknowledged ? "confirm" : null;
}

/** What to show when the user switches the Highlighter on. */
export function noticeOnEnable(setupShownBefore: boolean, acknowledged: boolean): HighlighterNotice {
  if (!setupShownBefore) return "setup";
  return acknowledged ? null : "confirm";
}

export type NoticeAction = "confirm-installed" | "download" | "dismiss";

/**
 * The acknowledgement to store for a modal action, or null to store nothing.
 * Only an explicit confirmation counts: downloading is not installing, and a
 * dismissal must leave the name withheld.
 */
export function acknowledgementFor(action: NoticeAction): string | null {
  return action === "confirm-installed" ? REQUIRED_JAR_VERSION : null;
}
