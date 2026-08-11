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
