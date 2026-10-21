export type ParsedProxy = {
  type: "http" | "https" | "socks" | "socks4";
  host: string;
  port: number;
  username?: string;
  password?: string;
  mozProxyEnabled: false;
};

export type StoredProxy = Omit<ParsedProxy, "password">;

const SCHEME_TYPES: Record<string, ParsedProxy["type"]> = {
  http: "http",
  https: "https",
  socks: "socks",
  // Firefox's ProxyInfo type "socks" is SOCKS5, and it resolves DNS through the
  // proxy when proxyDNS is set, so both spellings map onto it.
  socks5: "socks",
  socks5h: "socks",
  socks4: "socks4",
};

// Host and explicit port straight from the raw text. `URL` drops a port that
// equals the scheme default, so http://host:80 would otherwise look portless
// and be rejected. Handles bracketed IPv6 hosts.
const AUTHORITY_PORT = /^[a-z0-9]+:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d+))?/i;

function decodeCredential(value: string): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseGlobalProxyUrl(input: string | null | undefined): ParsedProxy | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  // Require explicit scheme://host:port to avoid ambiguous parsing.
  if (!raw.includes("://")) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const scheme = (url.protocol || "").replace(":", "").toLowerCase();
  const type = SCHEME_TYPES[scheme];
  if (!type) return null;

  // Firefox's proxy API wants a bare IPv6 address, without the URL brackets.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (!host) return null;

  // URL keeps credentials percent-encoded; the proxy needs the real values.
  const username = decodeCredential(url.username);
  const password = decodeCredential(url.password);

  // Require an explicit port for all schemes.
  const explicitPort = AUTHORITY_PORT.exec(raw)?.[2] || url.port;
  if (!explicitPort) return null;
  const port = Number(explicitPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  return {
    type,
    host,
    port,
    username,
    password,
    mozProxyEnabled: false,
  };
}

export function stripSensitiveProxyFields(proxy: ParsedProxy | null | undefined): StoredProxy | null {
  if (!proxy) return null;

  const { password: _password, ...storedProxy } = proxy;
  return storedProxy;
}

/**
 * The proxy URL as it may be written to storage: rebuilt from a successful
 * parse, with the username but never the password.
 *
 * Text that does not parse yields "" rather than being stored with a
 * best-effort regex. It is almost always a URL mid-typing — `http://admin:hunt`
 * before the "@" exists — and the regex could not tell a half-typed password
 * from a host, so it wrote it to disk verbatim.
 */
export function sanitizeProxyUrlForStorage(input: string | null | undefined): string {
  const parsed = parseGlobalProxyUrl(input);
  if (!parsed) return "";
  const auth = parsed.username ? `${encodeURIComponent(parsed.username)}@` : "";
  const host = parsed.host.includes(":") ? `[${parsed.host}]` : parsed.host;
  return `${parsed.type}://${auth}${host}:${parsed.port}`;
}
