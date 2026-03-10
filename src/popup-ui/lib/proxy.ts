export type ParsedProxy = {
  type: "http" | "https" | "socks" | "socks4";
  host: string;
  port: number;
  username?: string;
  password?: string;
  mozProxyEnabled: false;
};

export type StoredProxy = Omit<ParsedProxy, "password">;

// Ported from `src/js/popup.js` to keep behavior identical.
export function parseGlobalProxyUrl(input: string | null | undefined): ParsedProxy | null {
  let raw = (input || "").trim();
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
  const host = url.hostname;
  const username = url.username || undefined;
  const password = url.password || undefined;

  if (!host) return null;

  let type: ParsedProxy["type"];
  switch (scheme) {
    case "http":
      type = "http";
      break;
    case "https":
      type = "https";
      break;
    case "socks":
      type = "socks";
      break;
    case "socks4":
      type = "socks4";
      break;
    default:
      return null;
  }

  // Require explicit port for all schemes.
  const portStr = url.port;
  if (!portStr) return null;
  const port = Number(portStr);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;

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

export function sanitizeProxyUrlForStorage(input: string | null | undefined): string {
  const raw = (input || "").trim();
  if (!raw) return "";

  const parsed = parseGlobalProxyUrl(raw);
  if (parsed) {
    const auth = parsed.username ? `${encodeURIComponent(parsed.username)}@` : "";
    return `${parsed.type}://${auth}${parsed.host}:${parsed.port}`;
  }

  return raw.replace(/(\/\/[^:@/]+):[^@/]*@/, "$1@");
}

