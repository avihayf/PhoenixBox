export interface ProxyPreset {
  id: string;
  name: string;
  scheme: string;
  host: string;
  port: number;
  autoEnablePaintBurp?: boolean;
}

export const DEFAULT_PROXY_PRESETS: ProxyPreset[] = [
  {
    id: 'burp-suite',
    name: 'Burp Suite',
    scheme: 'http',
    host: '127.0.0.1',
    port: 8080,
  },
];

/** Firefox's ProxyInfo type for a preset scheme (socks5 is Firefox's "socks"). */
export function presetProxyType(scheme: string): string {
  const s = String(scheme || "").toLowerCase();
  return s === "socks5" || s === "socks5h" ? "socks" : s;
}

type EndpointLike = { type?: unknown; host?: unknown; port?: unknown } | null | undefined;

function sameEndpoint(a: EndpointLike, b: EndpointLike): boolean {
  if (!a || !b) return false;
  return String(a.type || "") === String(b.type || "") &&
    String(a.host || "").toLowerCase() === String(b.host || "").toLowerCase() &&
    Number(a.port) === Number(b.port);
}

/**
 * Which preset the container-detail dropdown should show as selected: the
 * proxy the container's traffic will actually use.
 *
 * It used to compare raw URL strings (so any "user@" never matched) and to
 * assume the global proxy applied to every container — showing "Burp" for a
 * container that the promoted-container list sends DIRECT.
 *
 * @param containerProxy the container's own proxy entry, if any.
 * @param globalProxy the parsed global proxy when it is enabled, else null.
 * @param globalAppliesToContainer whether the promoted list lets this
 *   container fall back to the global proxy.
 */
export function effectivePresetId(
  containerProxy: EndpointLike,
  globalProxy: EndpointLike,
  globalAppliesToContainer: boolean,
  presets: ProxyPreset[],
): string | undefined {
  if (containerProxy && containerProxy.type === "direct") return "__direct__";
  const effective = containerProxy || (globalAppliesToContainer ? globalProxy : null);
  if (!effective) return undefined;
  const match = (presets || []).find((preset) =>
    sameEndpoint(effective, { type: presetProxyType(preset.scheme), host: preset.host, port: preset.port }));
  return match?.id;
}
