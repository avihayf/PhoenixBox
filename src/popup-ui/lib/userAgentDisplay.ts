// A short human label for a User-Agent string, e.g. "Chrome 143 - Windows 10".
//
// Kept free of imports so tests can load it directly. Order matters: Edge and
// Opera agents also contain "Chrome/", Android agents contain "Linux", and
// iPhone/iPad agents contain "like Mac OS X", so the more specific checks run
// first — the reverse order labelled every Android agent "Linux" and every
// iPhone "macOS".

const major = (ua: string, pattern: RegExp): string => {
  const match = ua.match(pattern);
  return match ? match[1].split(".")[0] : "";
};

function browserOf(ua: string): { name: string; version: string } {
  if (ua.includes("Edg/") || ua.includes("EdgA/") || ua.includes("EdgiOS/")) {
    return { name: "Edge", version: major(ua, /Edg(?:A|iOS)?\/([\d.]+)/) };
  }
  if (ua.includes("OPR/") || ua.includes("Opera/")) {
    return { name: "Opera", version: major(ua, /OPR\/([\d.]+)/) || major(ua, /Opera\/([\d.]+)/) };
  }
  if (ua.includes("SamsungBrowser/")) {
    return { name: "Samsung Internet", version: major(ua, /SamsungBrowser\/([\d.]+)/) };
  }
  if (ua.includes("Firefox/") || ua.includes("FxiOS/")) {
    return { name: "Firefox", version: major(ua, /(?:Firefox|FxiOS)\/([\d.]+)/) };
  }
  if (ua.includes("Chrome/") || ua.includes("CriOS/")) {
    return { name: "Chrome", version: major(ua, /(?:Chrome|CriOS)\/([\d.]+)/) };
  }
  if (ua.includes("Safari/")) {
    return { name: "Safari", version: major(ua, /Version\/([\d.]+)/) };
  }
  return { name: "Unknown", version: "" };
}

function osOf(ua: string): string {
  const windows: Array<[string, string]> = [
    ["Windows NT 10.0", "Windows 10"],
    ["Windows NT 6.3", "Windows 8.1"],
    ["Windows NT 6.2", "Windows 8"],
    ["Windows NT 6.1", "Windows 7"],
  ];
  for (const [token, label] of windows) {
    if (ua.includes(token)) return label;
  }
  if (ua.includes("Windows")) return "Windows";

  if (ua.includes("iPhone")) {
    const m = ua.match(/iPhone OS ([\d_]+)/);
    return m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
  }
  if (ua.includes("iPad")) {
    const m = ua.match(/CPU OS ([\d_]+)/);
    return m ? `iPadOS ${m[1].replace(/_/g, ".")}` : "iPadOS";
  }
  if (ua.includes("Android")) {
    const m = ua.match(/Android ([\d.]+)/);
    return m ? `Android ${m[1]}` : "Android";
  }
  if (ua.includes("CrOS")) return "ChromeOS";
  if (ua.includes("Mac OS X")) {
    // Safari and Chrome write 10_15_7; Firefox writes 10.15.
    const m = ua.match(/Mac OS X ([\d_.]+)/);
    return m ? `macOS ${m[1].replace(/_/g, ".")}` : "macOS";
  }
  if (ua.includes("Linux")) return "Linux";
  return "";
}

export function parseUserAgentForDisplay(userAgent: string): string {
  if (!userAgent) return "Unknown";
  const { name, version } = browserOf(userAgent);
  const os = osOf(userAgent);
  let label = name;
  if (version) label += ` ${version}`;
  if (os) label += ` - ${os}`;
  return label;
}
