import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { requireWebExt } from "../../../lib/browser";
import { Switch } from "../ui/switch";

type ProxyType = "http" | "https" | "socks" | "socks4";

export type AdvancedProxyForm = {
  type: ProxyType;
  host: string;
  port: string;
  proxyDNS: boolean;
};

interface AdvancedProxySettingsViewProps {
  containerName: string;
  initialValue?: AdvancedProxyForm;
  onBack: () => void;
  onSave: (value: AdvancedProxyForm) => void;
  onClear: () => void;
}

export function AdvancedProxySettingsView({
  containerName,
  initialValue,
  onBack,
  onSave,
  onClear,
}: AdvancedProxySettingsViewProps) {
  const [hasPermission, setHasPermission] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [type, setType] = useState<ProxyType>(initialValue?.type || "http");
  const [host, setHost] = useState(initialValue?.host || "");
  const [port, setPort] = useState(initialValue?.port || "");
  const [proxyDNS, setProxyDNS] = useState(initialValue?.proxyDNS || false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const browser = requireWebExt();
      const allowed = await browser.permissions.contains({ permissions: ["proxy"] });
      setHasPermission(allowed);
      setCheckingPermission(false);
    };
    load().catch(() => setCheckingPermission(false));
  }, []);

  useEffect(() => {
    if (initialValue) {
      setType(initialValue.type);
      setHost(initialValue.host);
      setPort(initialValue.port);
      setProxyDNS(initialValue.proxyDNS);
    }
  }, [initialValue]);

  const canSave = useMemo(() => {
    if (!host.trim()) return false;
    const portNum = Number(port);
    // Port must be a positive integer within the valid range (Firefox proxy
    // API rejects non-integer ports).
    return Number.isInteger(portNum) && portNum > 0 && portNum <= 65535;
  }, [host, port]);

  const handleSave = () => {
    setError("");
    if (!canSave) {
      setError("Please enter a valid host and port.");
      return;
    }
    onSave({ type, host: host.trim(), port: port.trim(), proxyDNS });
  };

  const handleRequestPermission = async () => {
    const browser = requireWebExt();
    const granted = await browser.permissions.request({ permissions: ["proxy"] });
    setHasPermission(granted);
  };

  return (
    <div className="w-full h-auto max-h-[720px] flex flex-col bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--ext-border)] bg-[var(--ext-bg)] z-20">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-[var(--ext-bg-secondary)] rounded-lg transition-all duration-200 active:ring-2 active:ring-[var(--ext-accent)] active:ring-offset-1 active:ring-offset-[var(--ext-bg)]"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-[var(--ext-accent)]" />
        </button>
        <h1 className="tracking-wide uppercase text-[var(--ext-accent)] brand-title truncate">
          Advanced Proxy
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2.5 space-y-3 custom-scrollbar">
        <div className="text-xs text-[var(--ext-text-muted)] uppercase tracking-wider">
          {containerName}
        </div>

        {checkingPermission ? (
          <div className="text-xs text-[var(--ext-text-muted)]">Checking permissions…</div>
        ) : !hasPermission ? (
          <div className="p-3 rounded-lg border border-[var(--ext-border)] bg-[var(--ext-bg-secondary)] space-y-2">
            <div className="text-xs text-[var(--ext-text)]">
              Proxy permission is required to enable advanced proxy settings.
            </div>
            <button
              onClick={handleRequestPermission}
              className="w-full flex items-center justify-center py-2 text-xs bg-[var(--ext-accent)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-colors"
            >
              Enable Proxy Permission
            </button>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--ext-accent)] mb-1.5 font-bold opacity-80">
                Proxy Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ProxyType)}
                className="w-full px-2.5 py-1.5 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg text-xs text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)]"
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks">SOCKS5</option>
                <option value="socks4">SOCKS4</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--ext-accent)] mb-1.5 font-bold opacity-80">
                Host
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1"
                className="w-full px-2.5 py-1.5 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg text-xs text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--ext-accent)] mb-1.5 font-bold opacity-80">
                Port
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="8080"
                className="w-full px-2.5 py-1.5 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg text-xs text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)]"
              />
            </div>

            {(type === "socks" || type === "socks4") && (
              <div className="flex items-center justify-between p-2.5 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg">
                <span className="text-xs text-[var(--ext-text)]">Proxy DNS through SOCKS</span>
                <Switch checked={proxyDNS} onCheckedChange={setProxyDNS} />
              </div>
            )}

            {error && <div className="text-xs text-[var(--ext-red)]">{error}</div>}
          </>
        )}
      </div>

      {/* Bottom Buttons */}
      <div className="p-2.5 border-t border-[var(--ext-border)] bg-[var(--ext-bg)] flex gap-2.5">
        <button
          onClick={onClear}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-[var(--ext-border)] text-[var(--ext-text)] rounded-lg hover:bg-[var(--ext-bg-secondary)] transition-colors uppercase tracking-wider text-xs"
          disabled={!hasPermission}
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--ext-accent)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 btn-brand-primary disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!hasPermission || !canSave}
        >
          <Save className="w-4 h-4" />
          Save
        </button>
      </div>
    </div>
  );
}
