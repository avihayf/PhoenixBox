type MaybeBrowser = typeof browser | undefined;

// WebExtension API access.
// In Firefox, `browser` exists. (Chrome uses `chrome`, but this extension targets Firefox.)
export const webext: MaybeBrowser = (globalThis as any).browser;

export function requireWebExt(): typeof browser {
  if (!webext) {
    throw new Error("WebExtension API not available: globalThis.browser is undefined");
  }
  return webext;
}

