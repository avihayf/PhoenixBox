import { useEffect, useMemo, useState } from "react";
import { requireWebExt } from "../../lib/browser";
import { Switch } from "./ui/switch";
import * as msg from "../../lib/messages";
import { getProxyForContainer, setProxyForContainer, PROXY_STORAGE_KEY,
  type ProxyEntry } from "../../lib/proxyStore";

type VpnServerCity = {
  name: string;
  servers: { socksName?: string }[];
};

type VpnServerCountry = {
  code: string;
  name?: string;
  cities: VpnServerCity[];
};

interface MozillaVpnSectionProps {
  cookieStoreId: string;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

export function MozillaVpnSection({ cookieStoreId, expanded, onToggle }: MozillaVpnSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = typeof expanded === "boolean" ? expanded : internalExpanded;
  const [installed, setInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [permissionsOk, setPermissionsOk] = useState(false);
  const [servers, setServers] = useState<VpnServerCountry[]>([]);
  const [countryCode, setCountryCode] = useState("");
  const [cityName, setCityName] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    const browser = requireWebExt();

    const load = async () => {
      try {
        await msg.vpnAttemptPort();
      } catch {}

      try {
        await msg.vpnQueryStatus();
      } catch {}

      if (isExpanded) {
        try {
          await msg.vpnQueryServers();
        } catch {}
      }

      const [isInstalled, isConnected, permOk, stored, containerProxy] = await Promise.all([
        msg.vpnGetInstallationStatus<any>(),
        msg.vpnGetConnectionStatus<any>(),
        browser.permissions.contains({ permissions: ["proxy", "nativeMessaging"] }),
        browser.storage.local.get({ mozillaVpnServers: [] }),
        getProxyForContainer(cookieStoreId),
      ]);

      if (!active) return;

      setInstalled(!!isInstalled);
      setConnected(!!isConnected);
      setPermissionsOk(!!permOk);
      setServers(Array.isArray(stored.mozillaVpnServers) ? stored.mozillaVpnServers : []);

      setCountryCode(containerProxy?.countryCode || "");
      setCityName(containerProxy?.cityName || "");
      setEnabled(containerProxy?.mozProxyEnabled === true);
    };

    const refresh = () => {
      load().catch(() => {});
    };

    const onStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName !== "local") return;
      if (changes.mozillaVpnServers || changes[PROXY_STORAGE_KEY]) {
        refresh();
      }
    };

    refresh();
    browser.storage.onChanged.addListener(onStorageChange);
    browser.permissions.onAdded.addListener(refresh);
    browser.permissions.onRemoved.addListener(refresh);

    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onStorageChange);
      browser.permissions.onAdded.removeListener(refresh);
      browser.permissions.onRemoved.removeListener(refresh);
    };
  }, [cookieStoreId, isExpanded]);

  const selectedCountry = useMemo(
    () => servers.find((s) => s.code === countryCode),
    [servers, countryCode],
  );

  const selectedCity = useMemo(
    () => selectedCountry?.cities?.find((c) => c.name === cityName),
    [selectedCountry, cityName],
  );

  const getDefaultLocation = () => {
    for (const country of servers) {
      const city = country.cities?.find((c) => c.servers?.some((s) => s.socksName));
      if (city) {
        return { countryCode: country.code, cityName: city.name };
      }
    }
    return { countryCode: "", cityName: "" };
  };

  const buildProxy = (nextCountry: string, nextCity: string, mozProxyEnabled: boolean) => {
    const country = servers.find((s) => s.code === nextCountry);
    const city = country?.cities?.find((c) => c.name === nextCity);
    const server = city?.servers?.find((s) => s.socksName);
    if (!server?.socksName) return null;

    return {
      type: "socks",
      host: `${server.socksName}.mullvad.net`,
      port: 1080,
      countryCode: nextCountry,
      cityName: nextCity,
      mozProxyEnabled,
    };
  };

  const saveProxy = async (proxy: ProxyEntry["proxy"] | null) => {
    await setProxyForContainer(cookieStoreId, proxy);
  };

  const handleToggle = async (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    if (!nextEnabled) {
      await saveProxy(null);
      return;
    }

    let nextCountry = countryCode;
    let nextCity = cityName;
    if (!nextCountry || !nextCity) {
      const def = getDefaultLocation();
      nextCountry = def.countryCode;
      nextCity = def.cityName;
      setCountryCode(nextCountry);
      setCityName(nextCity);
    }

    const proxy = buildProxy(nextCountry, nextCity, true);
    if (proxy) {
      await saveProxy(proxy);
    }
  };

  const handleLocationChange = async (nextCountry: string, nextCity: string) => {
    setCountryCode(nextCountry);
    setCityName(nextCity);
    if (!enabled) return;
    const proxy = buildProxy(nextCountry, nextCity, true);
    if (proxy) {
      await saveProxy(proxy);
    }
  };

  const handleGetVpn = async () => {
    const browser = requireWebExt();
    await browser.tabs.create({
      url: "https://www.mozilla.org/products/vpn",
    });
  };

  const handleEnablePermissions = async () => {
    const browser = requireWebExt();
    const granted = await browser.permissions.request({ permissions: ["proxy", "nativeMessaging"] });
    setPermissionsOk(granted);
  };

  return (
    <div className="p-2.5 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--ext-accent)] font-bold">
            Mozilla VPN
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              installed ? (connected ? "bg-[var(--ext-green)]" : "bg-[var(--ext-yellow)]") : "bg-[var(--ext-text-muted)]"
            }`}
            title={installed ? (connected ? "Connected" : "Disconnected") : "Not installed"}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !isExpanded;
            if (typeof expanded === "boolean") {
              onToggle?.(next);
            } else {
              setInternalExpanded(next);
              onToggle?.(next);
            }
          }}
          className="text-xs text-[var(--ext-accent)] hover:underline"
        >
          {isExpanded ? "Hide" : "Show"}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {!installed ? (
            <button
              onClick={handleGetVpn}
              className="w-full px-3 py-2 text-xs bg-[var(--ext-accent)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-colors"
            >
              Get Mozilla VPN
            </button>
          ) : !permissionsOk ? (
            <button
              onClick={handleEnablePermissions}
              className="w-full px-3 py-2 text-xs bg-[var(--ext-accent)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-colors"
            >
              Enable VPN Permissions
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--ext-text)]">Use VPN for this container</span>
                <Switch aria-label="Use Mozilla VPN for this container" checked={enabled} onCheckedChange={handleToggle} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--ext-accent)] mb-1 font-bold opacity-80">
                    Country
                  </label>
                  <select
                    value={countryCode}
                    onChange={(e) => {
                      const nextCountry = e.target.value;
                      const nextCity = servers.find((c) => c.code === nextCountry)?.cities?.[0]?.name || "";
                      handleLocationChange(nextCountry, nextCity);
                    }}
                    className="w-full px-2 py-1.5 bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded text-[10px] text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)]"
                  >
                    <option value="">Select…</option>
                    {servers.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name || country.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--ext-accent)] mb-1 font-bold opacity-80">
                    City
                  </label>
                  <select
                    value={cityName}
                    onChange={(e) => handleLocationChange(countryCode, e.target.value)}
                    className="w-full px-2 py-1.5 bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded text-[10px] text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)]"
                    disabled={!selectedCountry}
                  >
                    <option value="">Select…</option>
                    {selectedCountry?.cities?.map((city) => (
                      <option key={city.name} value={city.name}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!connected && (
                <div className="text-[10px] text-[var(--ext-text-muted)]">
                  Mozilla VPN must be connected to activate container proxy.
                </div>
              )}

              {selectedCity?.servers?.length === 0 && (
                <div className="text-[10px] text-[var(--ext-red)]">
                  No VPN servers available for this location.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
