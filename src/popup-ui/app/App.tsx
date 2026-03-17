import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SiteActionsView } from "./components/views/SiteActionsView";
import { ContainerSelectorView } from "./components/views/ContainerSelectorView";
import { ManageContainersView } from "./components/views/ManageContainersView";
import { ContainerDetailView } from "./components/views/ContainerDetailView";
import { EditContainerView } from "./components/views/EditContainerView";
import { AssignedSitesView } from "./components/views/AssignedSitesView";
import { AdvancedProxySettingsView, type AdvancedProxyForm } from "./components/views/AdvancedProxySettingsView";
import { OnboardingView } from "./components/views/OnboardingView";
import { requireWebExt } from "../lib/browser";
import { parseGlobalProxyUrl, sanitizeProxyUrlForStorage, stripSensitiveProxyFields } from "../lib/proxy";
import { getUserAgents, type UserAgentData } from "../lib/userAgent";
import { DEFAULT_PROXY_PRESETS, type ProxyPreset } from "../data/mockData";
import { logError } from "../lib/logger";
import { type AccentValue, ACCENT_PRESETS, applyCustomHue, clearCustomHue, serializeAccent, deserializeAccent } from "../lib/accentColors";

type View = "main" | "detail" | "edit" | "picker" | "manage" | "assignedSites" | "advancedProxy" | "onboarding";

type Container = {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
  displayIcon: string;
  tabCount: number;
  proxyUrl?: string;
  isIsolated?: boolean;
  userAgent?: string;
};

type Tab = {
  id: number;
  title: string;
  url: string;
  favicon?: string;
};

type AssignedSite = {
  key: string;
  hostname: string;
};

// Enforce standard Firefox container colors for our security profiles.
const FIREFOX_DEFAULT_ICONS = new Set([
  "fingerprint", "briefcase", "dollar", "cart", "circle",
  "gift", "vacation", "food", "fruit", "pet", "tree", "chill"
]);

function PopupWrapper({ children, isMainView = false }: { children: ReactNode; isMainView?: boolean }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const updatePopupHeight = () => {
      const measured = el.scrollHeight || el.getBoundingClientRect().height;
      const height = Math.ceil(measured);
      // Guard against transient zero-height measurements which can cause
      // the entire popup to become invisible (html/body height set to 0).
      if (!height || height < 20) return;
      const heightPx = `${height}px`;
      document.documentElement.style.height = heightPx;
      document.body.style.height = heightPx;
      const root = document.getElementById("root");
      if (root) root.style.height = heightPx;
    };

    updatePopupHeight();

    let observer: ResizeObserver | null = null;
    try {
      observer = new ResizeObserver(() => updatePopupHeight());
      observer.observe(el);
    } catch {
      // ResizeObserver might be unavailable in some environments.
      observer = null;
    }

    const handleResizeRequest = () => {
      requestAnimationFrame(() => updatePopupHeight());
    };
    window.addEventListener("phoenix-popup-resize", handleResizeRequest);

    return () => {
      observer?.disconnect();
      window.removeEventListener("phoenix-popup-resize", handleResizeRequest);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`extension-popup w-[340px] h-fit bg-[var(--ext-bg)]${isMainView ? ' main-view' : ''}`}
    >
      {children}
    </div>
  );
}

function applyAccentToDOM(accent: AccentValue, isDark: boolean) {
  const presetIds = ACCENT_PRESETS.map(p => p.id);
  presetIds.forEach(id => document.documentElement.classList.remove(`accent-${id}`));

  if (accent.type === 'preset') {
    clearCustomHue();
    document.documentElement.classList.add(`accent-${accent.id}`);
  } else {
    applyCustomHue(accent.hue, isDark);
  }
}

function App() {
  const [currentView, setCurrentView] = useState<View>("main");
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [globalProxyEnabled, setGlobalProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");
  const [globalProxyError, setGlobalProxyError] = useState<string>("");
  const [proxyToggleBusy, setProxyToggleBusy] = useState(false);
  const proxyToggleBusyRef = useRef(false);
  const [paintBurp, setPaintBurp] = useState(false);
  const [globalUserAgent, setGlobalUserAgent] = useState(false);
  const [userAgentType, setUserAgentType] = useState<'all' | 'desktop' | 'mobile'>('all');
  const [selectedUserAgent, setSelectedUserAgent] = useState("");
  const [userAgentsData, setUserAgentsData] = useState<UserAgentData>({
    all: [],
    desktop: [],
    mobile: [],
  });
  const [containers, setContainers] = useState<Container[]>([]);
  const [isDark, setIsDark] = useState(true);
  const [accentColor, setAccentColor] = useState<AccentValue>({ type: 'preset', id: 'cyan' });
  const [tabsByContainer, setTabsByContainer] = useState<Record<string, Tab[]>>({});
  const [windowId, setWindowId] = useState<number | null>(null);
  const [pickerTitle, setPickerTitle] = useState<string>("");
  const [pickerAction, setPickerAction] = useState<
    "openNewTab" | "reopenSiteIn" | "alwaysOpenIn" | null
  >(null);
  const [assignedSites, setAssignedSites] = useState<AssignedSite[]>([]);
  const [assignedSitesLoading, setAssignedSitesLoading] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<number | null>(null);
  const [advancedProxyInitial, setAdvancedProxyInitial] = useState<AdvancedProxyForm | null>(null);
  const [returnView, setReturnView] = useState<View>("edit");

  // Mozilla VPN (safe phase): show status + permissions warning dot
  const [vpnWarnDot, setVpnWarnDot] = useState(false);
  const [customProxyPresets, setCustomProxyPresets] = useState<ProxyPreset[]>([]);

  const loadCustomProxyPresets = async () => {
    const browser = requireWebExt();
    const stored = await browser.storage.local.get({ 
      customProxyPresets: [],
      proxyPresetsInitialized: false 
    });
    
    if (!stored.proxyPresetsInitialized) {
      // First time initialization - merge default presets with any existing custom ones
      const initial = [...DEFAULT_PROXY_PRESETS, ...(stored.customProxyPresets || [])];
      setCustomProxyPresets(initial);
      await browser.storage.local.set({ 
        customProxyPresets: initial,
        proxyPresetsInitialized: true 
      });
    } else {
      setCustomProxyPresets(stored.customProxyPresets || []);
    }
  };

  const handleSaveProxyPreset = async (preset: Omit<ProxyPreset, 'id'>) => {
    const browser = requireWebExt();
    const newPreset: ProxyPreset = {
      ...preset,
      id: `custom-${Date.now()}`,
    };
    const updated = [...customProxyPresets, newPreset];
    setCustomProxyPresets(updated);
    await browser.storage.local.set({ customProxyPresets: updated });
  };

  const handleUpdateProxyPreset = async (id: string, preset: Omit<ProxyPreset, 'id'>) => {
    const browser = requireWebExt();
    const updated = customProxyPresets.map(p => p.id === id ? { ...preset, id } : p);
    setCustomProxyPresets(updated);
    await browser.storage.local.set({ customProxyPresets: updated });
  };

  const handleDeleteProxyPreset = async (id: string) => {
    const browser = requireWebExt();
    const updated = customProxyPresets.filter(p => p.id !== id);
    setCustomProxyPresets(updated);
    await browser.storage.local.set({ customProxyPresets: updated });
  };

  const filteredContainers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter((c) => c.name.toLowerCase().includes(q));
  }, [containers, searchTerm]);

  const loadUserAgents = async (forceRefresh = false) => {
    try {
      const data = await getUserAgents(forceRefresh);
      setUserAgentsData(data);
    } catch (error) {
      logError("Failed to load User-Agents:", error);
    }
  };

  const handleContainerClick = async (container: Container) => {
    const browser = requireWebExt();
    await browser.tabs.create({ cookieStoreId: container.cookieStoreId });
    window.close();
  };

  const handleContainerDetails = (container: Container) => {
    setSelectedContainer(container);
    setCurrentView("detail");
  };

  const handleManageContainer = () => {
    setCurrentView("edit");
  };

  const handleBack = () => {
    if (currentView === "edit") {
      if (selectedContainer?.cookieStoreId === "new") {
        setCurrentView("manage");
      } else {
        setCurrentView("detail");
      }
      return;
    }
    if (currentView === "detail") {
      setCurrentView("main");
      setSelectedContainer(null);
      return;
    }
    if (currentView === "assignedSites" || currentView === "advancedProxy") {
      setCurrentView(returnView);
      return;
    }
    if (currentView === "picker") {
      setCurrentView("main");
      setPickerAction(null);
      setPickerTitle("");
      return;
    }
    if (currentView === "manage") {
      setCurrentView("main");
      return;
    }
    setCurrentView("main");
  };

  const cookieStoreIdToUserContextId = (cookieStoreId?: string | null) => {
    const csid = cookieStoreId || "";
    const userContextId = csid.replace("firefox-container-", "");
    return userContextId !== csid ? Number(userContextId) : false;
  };

  const enforceProfileColor = (name: string, color: string) => {
    const lower = (name || "").toLowerCase();
    if (lower === "attacker") return "red";
    if (lower === "victim") return "orange";
    if (lower === "member") return "yellow";
    return color;
  };

  const getSecurityProfileIcon = (cookieStoreId: string, name: string) => {
    const n = Number(cookieStoreId.replace("firefox-container-", ""));
    if (n === 1) return "skull";
    if (n === 2) return "user-x";
    if (n === 3) return "user-cog";
    if (n === 4) return "user-minus";

    const lower = (name || "").toLowerCase();
    if (lower === "attacker") return "skull";
    if (lower === "victim") return "user-x";
    if (lower === "admin") return "user-cog";
    if (lower === "member") return "user-minus";
    return null;
  };

  const normalizeContainerColor = (value: string) => {
    return (value || "").toLowerCase();
  };

  const getCurrentTab = async () => {
    const browser = requireWebExt();
    const tabs = await browser.tabs.query({
      active: true,
      windowId: browser.windows.WINDOW_ID_CURRENT,
    });
    return tabs[0] || null;
  };

  const openPicker = (title: string, action: NonNullable<typeof pickerAction>) => {
    setPickerTitle(title);
    setPickerAction(action);
    setCurrentView("picker");
  };

  const onPickContainer = async (c: Container) => {
    const browser = requireWebExt();

    if (pickerAction === "openNewTab") {
      await browser.tabs.create({ cookieStoreId: c.cookieStoreId });
      window.close();
      return;
    }

    const tab = await getCurrentTab();
    if (!tab || !tab.url) {
      return;
    }

    const newUserContextId = cookieStoreIdToUserContextId(c.cookieStoreId);
    const currentUserContextId = cookieStoreIdToUserContextId(tab.cookieStoreId);

    if (pickerAction === "reopenSiteIn") {
      await browser.runtime.sendMessage({
        method: "reloadInContainer",
        url: tab.url,
        currentUserContextId,
        newUserContextId,
        tabIndex: tab.index + 1,
        active: tab.active,
        groupId: tab.groupId,
      });
      window.close();
      return;
    }

    if (pickerAction === "alwaysOpenIn") {
      if (tab.cookieStoreId !== c.cookieStoreId) {
        await browser.runtime.sendMessage({
          method: "assignAndReloadInContainer",
          url: tab.url,
          currentUserContextId: false,
          newUserContextId,
          tabIndex: tab.index + 1,
          active: tab.active,
          groupId: tab.groupId,
        });
      } else {
        await browser.runtime.sendMessage({
          method: "setOrRemoveAssignment",
          tabId: tab.id,
          url: tab.url,
          userContextId: newUserContextId,
          value: false,
        });
      }
      window.close();
      return;
    }
  };

  const refreshContainers = async () => {
    const browser = requireWebExt();
    const win = await browser.windows.getCurrent();
    const winId = win?.id ?? null;
    const identities = await browser.contextualIdentities.query({});
    const originalIconById = new Map(
      identities.map((id) => [id.cookieStoreId, id.icon]),
    );
    const { containerDisplayIconOverrides = {} } = await browser.storage.local.get({
      containerDisplayIconOverrides: {},
    });
    // Ensure security profiles keep their intended custom icons.
    const securityIcons = new Set(["skull", "user-x", "user-cog", "user-minus"]);
    const desiredSecurityIconByName: Record<string, string> = {
      attacker: "skull",
      victim: "user-x",
      admin: "user-cog",
      member: "user-minus",
    };
    const normalizedOverrides =
      containerDisplayIconOverrides && typeof containerDisplayIconOverrides === "object"
        ? { ...containerDisplayIconOverrides }
        : {};
    let overridesChanged = false;
    const normalizedIdentities = identities.map((id) => ({ ...id }));
    for (const id of normalizedIdentities) {
      const desired = desiredSecurityIconByName[(id.name || "").toLowerCase()];
      if (!desired) continue;
      const current = normalizedOverrides[id.cookieStoreId];
      if (!current || !securityIcons.has(current)) {
        normalizedOverrides[id.cookieStoreId] = desired;
        overridesChanged = true;
      }
    }
    if (overridesChanged) {
      await browser.storage.local.set({ containerDisplayIconOverrides: normalizedOverrides });
    }
    for (const id of normalizedIdentities) {
      const updates: { name: string; color?: string; icon?: string } = {
        name: id.name,
      };
      let shouldUpdate = false;

      // Determine the intended icon from overrides or the current identity.
      const overrideIcon = normalizedOverrides[id.cookieStoreId];
      const intendedIcon = overrideIcon || id.icon;
      const isCustomIcon = intendedIcon && !FIREFOX_DEFAULT_ICONS.has(intendedIcon);
      const targetIconForFirefox = isCustomIcon ? "fingerprint" : intendedIcon;

      if (id.icon !== targetIconForFirefox) {
        updates.icon = targetIconForFirefox;
        shouldUpdate = true;
        id.icon = targetIconForFirefox;
      }

      const enforcedColor = enforceProfileColor(id.name, id.color);
      if (enforcedColor !== id.color) {
        updates.color = enforcedColor;
        shouldUpdate = true;
        id.color = enforcedColor;
      }

      if (shouldUpdate) {
        try {
          await browser.contextualIdentities.update(id.cookieStoreId, updates);
        } catch (err) {
          logError("Failed to enforce container identity:", err);
        }
      }
    }
    const tabQuery = await browser.tabs.query(winId ? { windowId: winId } : {});
    const { proxifiedContainersKey = [] } = await browser.storage.local.get({
      proxifiedContainersKey: [],
    });
    const { containerUserAgents = {} } = await browser.storage.local.get({
      containerUserAgents: {},
    });
    const proxifiedMap = new Map(
      (proxifiedContainersKey as any[]).map((p) => [p.cookieStoreId, p.proxy]),
    );

    const tabsGrouped: Record<string, Tab[]> = {};
    for (const t of tabQuery) {
      const csid = t.cookieStoreId;
      if (!csid || csid === "firefox-default" || csid === "firefox-private") continue;
      (tabsGrouped[csid] ||= []).push({
        id: t.id!,
        title: t.title || t.url || "",
        url: t.url || "",
        favicon: (t.favIconUrl as string | undefined) || undefined,
      });
    }
    setTabsByContainer(tabsGrouped);
    const computed: Container[] = await Promise.all(normalizedIdentities.map(async (id) => {
      const enforcedColor = enforceProfileColor(id.name, id.color);
      const overrideIcon =
        normalizedOverrides && typeof normalizedOverrides === "object"
          ? normalizedOverrides[id.cookieStoreId]
          : null;
      const uiFallbackIcon =
        originalIconById.get(id.cookieStoreId) || id.icon;
      
      const containerStateKey = `identitiesState@@_${id.cookieStoreId}`;
      const containerState = await browser.storage.local.get(containerStateKey);
      const isIsolated = !!containerState[containerStateKey]?.isIsolated;
      
      const proxyObj = proxifiedMap.get(id.cookieStoreId);
      let proxyUrlStr = "";
      if (proxyObj) {
        proxyUrlStr = `${proxyObj.type}://${proxyObj.host}${proxyObj.port ? ":" + proxyObj.port : ""}`;
      }

      return {
        cookieStoreId: id.cookieStoreId,
        name: id.name,
        color: enforcedColor,
        icon: id.icon,
        displayIcon:
          overrideIcon ||
          getSecurityProfileIcon(id.cookieStoreId, id.name) ||
          uiFallbackIcon,
        tabCount: (tabsGrouped[id.cookieStoreId] || []).length,
        proxyUrl: proxyUrlStr,
        isIsolated,
        userAgent: containerUserAgents[id.cookieStoreId] || "",
      };
    }));
    setContainers(computed);
    return computed;
  };

  const loadAssignedSites = async (cookieStoreId: string) => {
    const browser = requireWebExt();
    const userContextId = cookieStoreIdToUserContextId(cookieStoreId);
    if (!userContextId) return;
    setAssignedSitesLoading(true);
    try {
      const response = await browser.runtime.sendMessage({
        method: "getAssignmentObjectByContainer",
        message: { userContextId },
      });
      const assignments = response || {};
      const sites = Object.keys(assignments).map((key) => {
        const site = assignments[key] || {};
        const hostname = site.hostname || key.replace(/^siteContainerMap@@_/, "");
        return { key, hostname };
      });
      setAssignedSites(sites);
    } catch (err) {
      logError("Failed to load assigned sites:", err);
      setAssignedSites([]);
    } finally {
      setAssignedSitesLoading(false);
    }
  };

  const setProxyForContainer = async (
    cookieStoreId: string,
    proxy: { type: string; host: string; port: number; mozProxyEnabled: boolean; proxyDNS?: boolean } | null,
  ) => {
    try {
      const browser = requireWebExt();
      const { proxifiedContainersKey = [] } = await browser.storage.local.get({
        proxifiedContainersKey: [],
      });
      const store = Array.isArray(proxifiedContainersKey) ? [...(proxifiedContainersKey as any[])] : [];
      const idx = store.findIndex((p) => p.cookieStoreId === cookieStoreId);
      if (!proxy) {
        if (idx !== -1) {
          store.splice(idx, 1);
          await browser.storage.local.set({ proxifiedContainersKey: store });
        }
        return;
      }
      if (idx === -1) {
        store.push({ cookieStoreId, proxy });
      } else {
        store[idx] = { cookieStoreId, proxy };
      }
      await browser.storage.local.set({ proxifiedContainersKey: store });
    } catch (err) {
      logError("Failed to set proxy for container:", err);
    }
  };

  const loadAdvancedProxyInitial = async (cookieStoreId: string) => {
    try {
      const browser = requireWebExt();
      const { proxifiedContainersKey = [] } = await browser.storage.local.get({
        proxifiedContainersKey: [],
      });
      const entries = Array.isArray(proxifiedContainersKey) ? (proxifiedContainersKey as any[]) : [];
      const entry = entries.find((p) => p.cookieStoreId === cookieStoreId);
      // Show whatever proxy is configured (including VPN proxies) so the
      // user can see what's active.  Previously, VPN proxies (which have
      // countryCode) were silently filtered out, letting users unknowingly
      // overwrite them.
      if (entry?.proxy?.host && entry?.proxy?.port) {
        setAdvancedProxyInitial({
          type: entry.proxy.type || "http",
          host: entry.proxy.host,
          port: String(entry.proxy.port),
          proxyDNS: !!entry.proxy.proxyDNS,
        });
        return;
      }
      setAdvancedProxyInitial(null);
    } catch (err) {
      logError("Failed to load advanced proxy settings:", err);
      setAdvancedProxyInitial(null);
    }
  };

  // Initial load: containers, current window, tab counts, and global toggles.
  useEffect(() => {
    let intervalId: number | null = null;

    // Default to dark mode if no theme is set
    const savedTheme = localStorage.getItem("theme");
    const shouldBeDark = savedTheme === "dark" || !savedTheme;
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }

    // Load saved accent color
    const savedRaw = localStorage.getItem("accentColor");
    const accent = deserializeAccent(savedRaw);
    setAccentColor(accent);
    applyAccentToDOM(accent, document.documentElement.classList.contains('dark'));

    const run = async () => {
      const browser = requireWebExt();

      // Kick VPN status refresh (safe, uses existing background port if available)
      try {
        await browser.runtime.sendMessage({ method: "MozillaVPN_queryStatus" });
      } catch {
        // ignore
      }

      const win = await browser.windows.getCurrent();
      const winId = win?.id ?? null;
      setWindowId(winId);

      // Get current global settings from storage (keep existing keys).
      const stored = await browser.storage.local.get({
        "onboarding-stage": 0,
        globalProxyEnabled: false,
        globalProxyUrl: "",
        globalProxyParsed: null,
        addContainerColorHeaderEnabled: false,
        globalUserAgentEnabled: false,
        globalUserAgentType: 'all',
        globalUserAgent: "",
        containerUserAgents: {},
      });

      const stage = Number(stored["onboarding-stage"] ?? 0);
      setOnboardingStage(stage);
      if (stage < 9) {
        setCurrentView("onboarding");
      }

      // If proxy permission is missing, force global proxy off to avoid
      // a confusing "enabled but not working" state.
      let hasProxyPermission = true;
      try {
        hasProxyPermission = await browser.permissions.contains({ permissions: ["proxy"] });
      } catch {
        hasProxyPermission = true;
      }

      const sanitizedStoredProxyUrl = sanitizeProxyUrlForStorage(String(stored.globalProxyUrl || ""));
      if (sanitizedStoredProxyUrl !== String(stored.globalProxyUrl || "")) {
        await browser.storage.local.set({ globalProxyUrl: sanitizedStoredProxyUrl });
      }

      if (stored.globalProxyEnabled && !hasProxyPermission) {
        setGlobalProxyEnabled(false);
        setGlobalProxyError("Proxy permission missing. Re-enable it, then toggle again.");
        await browser.storage.local.set({ globalProxyEnabled: false });
      } else {
        setGlobalProxyEnabled(!!stored.globalProxyEnabled);
        setGlobalProxyError("");
      }
      setProxyUrl(sanitizedStoredProxyUrl);

      setPaintBurp(!!stored.addContainerColorHeaderEnabled);
      setGlobalUserAgent(!!stored.globalUserAgentEnabled);
      setUserAgentType(stored.globalUserAgentType as any);
      setSelectedUserAgent(String(stored.globalUserAgent || ""));

      await refreshContainers();
      if (
        stored.globalUserAgentEnabled ||
        stored.globalUserAgent ||
        Object.keys(stored.containerUserAgents || {}).length > 0
      ) {
        await loadUserAgents(false);
      }
      await loadCustomProxyPresets();

      // Mozilla VPN status + permissions warning
      const refreshVpn = async () => {
        try {
          await browser.runtime.sendMessage({ method: "MozillaVPN_queryStatus" });
        } catch {
          // ignore
        }

        try {
          await Promise.all([
            browser.runtime.sendMessage({ method: "MozillaVPN_getInstallationStatus" }),
            browser.runtime.sendMessage({ method: "MozillaVPN_getConnectionStatus" }),
          ]);
        } catch {
          // VPN may not be installed
        }

        const permissionsOk = await browser.permissions.contains({
          permissions: ["proxy", "nativeMessaging"],
        });
        const storedVpn = await browser.storage.local.get({
          mozillaVpnHiddenToutsList: [],
        });
        const list = Array.isArray(storedVpn.mozillaVpnHiddenToutsList)
          ? storedVpn.mozillaVpnHiddenToutsList
          : [];
        const hidden = !!list.find((t: any) => t && t.name === "moz-permissions-warning-dot");
        setVpnWarnDot(!permissionsOk && !hidden);
      };

      await refreshVpn();
      intervalId = window.setInterval(() => {
        refreshVpn().catch(() => {});
      }, 3000);

      // Listen for storage changes from background (e.g. permission rescue)
      const handleStorageChange = (changes: any, areaName: string) => {
        if (areaName !== "local") return;
        if (changes.globalProxyEnabled) {
          setGlobalProxyEnabled(!!changes.globalProxyEnabled.newValue);
          if (changes.globalProxyEnabled.newValue) setGlobalProxyError("");
        }
        if (changes.globalProxyUrl) {
          setProxyUrl(String(changes.globalProxyUrl.newValue || ""));
        }
        if (changes.addContainerColorHeaderEnabled) {
          setPaintBurp(!!changes.addContainerColorHeaderEnabled.newValue);
        }
        if (changes.containerUserAgents) {
          refreshContainers().catch((e) => logError("Failed to refresh container UAs:", e));
        }
      };
      browser.storage.onChanged.addListener(handleStorageChange);
      return () => {
        if (intervalId) window.clearInterval(intervalId);
        browser.storage.onChanged.removeListener(handleStorageChange);
      };
    };

    run().catch((e) => logError("Failed to load popup data:", e));
  }, []);

  // Shared wrapper style for all views - RESTORED h-fit for auto-adjusting
  // Main view uses fixed height to keep footer visible; other views auto-fit.
  // Main view: fixed height within Firefox popup limit (~600px max)
  const mainWrapperClass = "w-[352px] h-[580px] flex flex-col bg-[var(--phoenix-bg)] text-[var(--phoenix-text)] dark:text-[var(--phoenix-text)] border border-[var(--phoenix-border)] shadow-xl font-['JetBrains_Mono',monospace]";
  const subWrapperClass = "w-[352px] h-fit max-h-[620px] flex flex-col bg-[var(--phoenix-bg)] text-[var(--phoenix-text)] dark:text-[var(--phoenix-text)] border border-[var(--phoenix-border)] overflow-hidden shadow-xl font-['JetBrains_Mono',monospace]";

  // Onboarding View
  if (currentView === "onboarding") {
    return (
      <PopupWrapper>
        <div className="w-[352px] h-[580px] bg-[var(--phoenix-bg)]">
          <OnboardingView
            initialStep={onboardingStage ?? 0}
            onComplete={() => {
              setOnboardingStage(9);
              setCurrentView("main");
            }}
          />
        </div>
      </PopupWrapper>
    );
  }

  // Picker View (Open/Reopen/Always-open)
  if (currentView === "picker") {
    return (
      <PopupWrapper>
        <ContainerSelectorView
          title={pickerTitle}
          containers={containers}
          onBack={handleBack}
          onSelectContainer={onPickContainer}
        />
      </PopupWrapper>
    );
  }

  // Assigned Sites View
  if (currentView === "assignedSites" && selectedContainer) {
    return (
      <PopupWrapper>
        <AssignedSitesView
          containerName={selectedContainer.name}
          sites={assignedSites}
          loading={assignedSitesLoading}
          onBack={handleBack}
          onRemoveSite={async (siteKey) => {
            const browser = requireWebExt();
            const userContextId = cookieStoreIdToUserContextId(selectedContainer.cookieStoreId);
            if (!userContextId) return;
            await browser.runtime.sendMessage({
              method: "setOrRemoveAssignment",
              tabId: null,
              url: siteKey,
              userContextId,
              value: true,
            });
            setAssignedSites((prev) => prev.filter((s) => s.key !== siteKey));
          }}
          onResetCookies={async (hostname) => {
            const browser = requireWebExt();
            const granted = await browser.permissions.request({ permissions: ["browsingData"] });
            if (!granted) return;
            await browser.runtime.sendMessage({
              method: "resetCookiesForSite",
              pageUrl: hostname,
              cookieStoreId: selectedContainer.cookieStoreId,
            });
          }}
        />
      </PopupWrapper>
    );
  }

  // Advanced Proxy View
  if (currentView === "advancedProxy" && selectedContainer) {
    return (
      <PopupWrapper>
        <AdvancedProxySettingsView
          containerName={selectedContainer.name}
          initialValue={advancedProxyInitial || undefined}
          onBack={handleBack}
          onClear={async () => {
            try {
              await setProxyForContainer(selectedContainer.cookieStoreId, null);
              const updated = await refreshContainers();
              const next = updated.find((c) => c.cookieStoreId === selectedContainer.cookieStoreId);
              if (next) setSelectedContainer(next);
              setCurrentView(returnView);
            } catch (err) {
              logError("Failed to clear container proxy:", err);
            }
          }}
          onSave={async (value) => {
            try {
              const proxy = {
                type: value.type,
                host: value.host,
                port: Number(value.port),
                mozProxyEnabled: false,
                // Always store proxyDNS for SOCKS proxies so the background
                // handler can distinguish "explicitly false" from "not set".
                ...((value.type === "socks" || value.type === "socks4")
                  ? { proxyDNS: !!value.proxyDNS }
                  : {}),
              };
              await setProxyForContainer(selectedContainer.cookieStoreId, proxy);
              const updated = await refreshContainers();
              const next = updated.find((c) => c.cookieStoreId === selectedContainer.cookieStoreId);
              if (next) setSelectedContainer(next);
              setCurrentView(returnView);
            } catch (err) {
              logError("Failed to save container proxy:", err);
            }
          }}
        />
      </PopupWrapper>
    );
  }

  // Manage view: choose a container to edit
  if (currentView === "manage") {
    return (
      <PopupWrapper>
        <ManageContainersView
          containers={containers}
          onBack={handleBack}
          onSelectContainer={(c) => {
            setSelectedContainer(c);
            setCurrentView("edit");
          }}
          onAddContainer={() => {
            setSelectedContainer({
              cookieStoreId: "new",
              name: "",
              color: "blue",
              icon: "circle",
              displayIcon: "circle",
              tabCount: 0,
            });
            setCurrentView("edit");
          }}
        />
      </PopupWrapper>
    );
  }

  // Edit Container View
  if (currentView === "edit" && selectedContainer) {
    return (
      <PopupWrapper>
        <EditContainerView
          container={selectedContainer}
          onBack={handleBack}
          onSave={async (name, color, icon, proxyUrl, siteIsolation) => {
          try {
            const browser = requireWebExt();
            const isNew = selectedContainer.cookieStoreId === "new";
            const userContextId = isNew
              ? "new"
              : String(cookieStoreIdToUserContextId(selectedContainer.cookieStoreId));

            const nativeIcon = icon === "skull" ? "circle" : icon;

            const response = await browser.runtime.sendMessage({
              method: "createOrUpdateContainer",
              message: {
                userContextId,
                params: {
                  name: name || (isNew ? "New Container" : selectedContainer.name),
                  color: normalizeContainerColor(color),
                  icon: nativeIcon,
                },
              },
            });
            const targetId = isNew ? response?.cookieStoreId : selectedContainer.cookieStoreId;

            // Persist the user's chosen display icon (supports security icons) so UI matches choice.
            if (targetId) {
              const stored = await browser.storage.local.get({
                containerDisplayIconOverrides: {},
              });
              const overrides =
                (stored.containerDisplayIconOverrides &&
                  typeof stored.containerDisplayIconOverrides === "object"
                  ? stored.containerDisplayIconOverrides
                  : {}) || {};
              overrides[targetId] = icon;
              await browser.storage.local.set({ containerDisplayIconOverrides: overrides });
            }

            const updatedContainers = await refreshContainers();

            if (isNew && response) {
              const realId = response.cookieStoreId;
              const newC = updatedContainers.find(c => c.cookieStoreId === realId);
              if (newC) setSelectedContainer(newC);
            }

            if (!isNew && siteIsolation !== !!selectedContainer.isIsolated) {
              await browser.runtime.sendMessage({
                method: "addRemoveSiteIsolation",
                cookieStoreId: selectedContainer.cookieStoreId,
                remove: !siteIsolation,
              });
            }

            if (proxyUrl) {
              const parsed = parseGlobalProxyUrl(proxyUrl);
              if (parsed) {
                if (targetId) {
                  const { proxifiedContainersKey = [] } = await browser.storage.local.get({
                    proxifiedContainersKey: [],
                  });
                  const store = [...(proxifiedContainersKey as any[])];
                  const idx = store.findIndex(p => p.cookieStoreId === targetId);
                  // Preserve existing proxy properties (e.g. proxyDNS set
                  // via Advanced Proxy Settings) when updating from the
                  // simple URL input.
                  const existing = idx !== -1 ? store[idx].proxy : {};
                  const merged = { ...existing, ...parsed };
                  if (idx === -1) {
                    store.push({ cookieStoreId: targetId, proxy: merged });
                  } else {
                    store[idx] = { cookieStoreId: targetId, proxy: merged };
                  }
                  await browser.storage.local.set({ proxifiedContainersKey: store });
                }
              }
            } else if (!isNew) {
              // Clear proxy if empty
              const { proxifiedContainersKey = [] } = await browser.storage.local.get({
                proxifiedContainersKey: [],
              });
              const store = (proxifiedContainersKey as any[]).filter(p => p.cookieStoreId !== selectedContainer.cookieStoreId);
              await browser.storage.local.set({ proxifiedContainersKey: store });
            }

            const latestContainers = await refreshContainers();
            if (targetId) {
              const latestContainer = latestContainers.find((c) => c.cookieStoreId === targetId);
              if (latestContainer) {
                setSelectedContainer(latestContainer);
              }
            }
            setCurrentView("detail");
          } catch (err) {
            logError("Save failed:", err);
          }
        }}
          userAgentsData={userAgentsData}
          onRefreshUserAgents={() => loadUserAgents(true)}
          onSelectContainerUserAgent={async (userAgent) => {
            if (!selectedContainer || selectedContainer.cookieStoreId === "new") return;
            const browser = requireWebExt();
            const stored = await browser.storage.local.get({ containerUserAgents: {} });
            const next = {
              ...(stored.containerUserAgents && typeof stored.containerUserAgents === "object"
                ? stored.containerUserAgents
                : {}),
              [selectedContainer.cookieStoreId]: userAgent,
            } as Record<string, string>;
            if (userAgent) {
              next[selectedContainer.cookieStoreId] = userAgent;
            } else {
              delete next[selectedContainer.cookieStoreId];
            }
            await browser.storage.local.set({ containerUserAgents: next });
            setSelectedContainer((current) => current ? { ...current, userAgent: userAgent || "" } : current);
          }}
          onClearContainerUserAgent={async () => {
            if (!selectedContainer || selectedContainer.cookieStoreId === "new") return;
            const browser = requireWebExt();
            const stored = await browser.storage.local.get({ containerUserAgents: {} });
            const next = {
              ...(stored.containerUserAgents && typeof stored.containerUserAgents === "object"
                ? stored.containerUserAgents
                : {}),
            };
            delete next[selectedContainer.cookieStoreId];
            await browser.storage.local.set({ containerUserAgents: next });
            setSelectedContainer((current) => current ? { ...current, userAgent: "" } : current);
          }}
          onManageSites={async () => {
            if (!selectedContainer?.cookieStoreId) return;
            setReturnView("edit");
            setCurrentView("assignedSites");
            await loadAssignedSites(selectedContainer.cookieStoreId);
          }}
          onAdvancedProxy={async () => {
            if (!selectedContainer?.cookieStoreId) return;
            setAdvancedProxyInitial(null); // Clear stale data from previous container
            setReturnView("edit");
            setCurrentView("advancedProxy");
            await loadAdvancedProxyInitial(selectedContainer.cookieStoreId);
          }}
          onDelete={async () => {
          const browser = requireWebExt();
          const userContextId = Number(selectedContainer.cookieStoreId.split("-").pop());
          await browser.runtime.sendMessage({
            method: "deleteContainer",
            message: { userContextId },
          });
          // Remove any display icon override for this container
          const stored = await browser.storage.local.get({
            containerDisplayIconOverrides: {},
          });
          const overrides =
            (stored.containerDisplayIconOverrides &&
              typeof stored.containerDisplayIconOverrides === "object"
              ? stored.containerDisplayIconOverrides
              : {}) || {};
          if (overrides[selectedContainer.cookieStoreId]) {
            delete overrides[selectedContainer.cookieStoreId];
            await browser.storage.local.set({ containerDisplayIconOverrides: overrides });
          }
          await refreshContainers();
          setCurrentView("main");
            setSelectedContainer(null);
          }}
        />
      </PopupWrapper>
    );
  }

  // Container Detail View
  if (currentView === "detail" && selectedContainer) {
    return (
      <PopupWrapper>
        <ContainerDetailView
          containerName={selectedContainer.name}
          containerColor={selectedContainer.color}
          containerIcon={selectedContainer.displayIcon}
          tabs={tabsByContainer[selectedContainer.cookieStoreId] || []}
          onBack={handleBack}
          onOpenNewTab={async () => {
            const browser = requireWebExt();
            await browser.tabs.create({ cookieStoreId: selectedContainer.cookieStoreId });
          }}
          onHideContainer={async () => {
            const browser = requireWebExt();
            await browser.runtime.sendMessage({
              method: "hideTabs",
              cookieStoreId: selectedContainer.cookieStoreId,
              windowId,
            });
          }}
          onMoveToWindow={async () => {
            const browser = requireWebExt();
            await browser.runtime.sendMessage({
              method: "moveTabsToWindow",
              cookieStoreId: selectedContainer.cookieStoreId,
              windowId,
            });
          }}
          onManageSites={() => {
            if (!selectedContainer?.cookieStoreId) return;
            setReturnView("detail");
            setCurrentView("assignedSites");
            loadAssignedSites(selectedContainer.cookieStoreId).catch(() => {});
          }}
          onClearStorage={async () => {
            const browser = requireWebExt();
            const userContextId = Number(selectedContainer.cookieStoreId.split("-").pop());
            await browser.runtime.sendMessage({
              method: "deleteContainerDataOnly",
              message: { userContextId },
            });
          }}
          onManageContainer={handleManageContainer}
          onCloseTab={async (tabId) => {
            const browser = requireWebExt();
            await browser.tabs.remove(tabId);
            await refreshContainers();
          }}
          proxyPresets={customProxyPresets}
          activeProxyPresetId={(() => {
            // "Disable Proxy" — container has a direct entry overriding global proxy
            if (selectedContainer.proxyUrl === "direct://") return "__direct__";
            // Check per-container proxy first, then fall back to global proxy
            const effectiveUrl = selectedContainer.proxyUrl || (globalProxyEnabled ? proxyUrl : "");
            if (!effectiveUrl) return undefined;
            const match = customProxyPresets.find(p => {
              const presetUrl = `${p.scheme}://${p.host}:${p.port}`;
              return effectiveUrl === presetUrl;
            });
            return match?.id;
          })()}
          onSelectProxyPreset={async (preset) => {
            if (!preset) {
              await setProxyForContainer(selectedContainer.cookieStoreId, null);
            } else if (preset.id === "__direct__") {
              await setProxyForContainer(selectedContainer.cookieStoreId, {
                type: "direct",
                host: "",
                port: 0,
                mozProxyEnabled: false,
              });
            } else {
              await setProxyForContainer(selectedContainer.cookieStoreId, {
                type: preset.scheme,
                host: preset.host,
                port: preset.port,
                mozProxyEnabled: true,
              });
            }
            await refreshContainers();
          }}
        />
      </PopupWrapper>
    );
  }

  // Main View
  return (
    <PopupWrapper isMainView>
      <SiteActionsView
        containers={containers}
        isDarkMode={isDark}
        onToggleTheme={() => {
          const nextDark = !isDark;
          setIsDark(nextDark);
          document.documentElement.classList.toggle("dark", nextDark);
          localStorage.setItem("theme", nextDark ? "dark" : "light");
          applyAccentToDOM(accentColor, nextDark);
        }}
        accentColor={accentColor}
        onChangeAccent={(value) => {
          const currentDark = document.documentElement.classList.contains('dark');
          applyAccentToDOM(value, currentDark);
          setAccentColor(value);
          localStorage.setItem("accentColor", serializeAccent(value));
        }}
        onManageContainers={() => setCurrentView("manage")}
        onSelectContainer={handleContainerClick}
        onContainerDetails={handleContainerDetails}
        proxyEnabled={globalProxyEnabled}
        onToggleProxy={async (enabled, urlOverride) => {
          if (proxyToggleBusyRef.current) return false;
          proxyToggleBusyRef.current = true;
          const browser = requireWebExt();
          setProxyToggleBusy(true);
          try {
            setGlobalProxyError("");
            if (enabled) {
              const urlToUse = urlOverride !== undefined ? urlOverride : proxyUrl;
              const parsed = parseGlobalProxyUrl(urlToUse);
              if (!parsed) {
                setGlobalProxyError("Enter valid proxy URL.");
                setGlobalProxyEnabled(false);
                await browser.storage.local.set({ globalProxyEnabled: false });
                return false;
              }

              let granted = false;
              try {
                // Must be called from user gesture; this handler is invoked by the Switch.
                granted = await browser.permissions.request({ permissions: ["proxy"] });
              } catch {
                granted = false;
              }

              if (!granted) {
                setGlobalProxyError("Proxy permission denied (or popup closed).");
                setGlobalProxyEnabled(false);
                await browser.storage.local.set({ globalProxyEnabled: false });
                return false;
              }

              await browser.runtime.sendMessage({ method: "setGlobalProxyConfig", proxy: parsed });

              setGlobalProxyEnabled(true);
              await browser.storage.local.set({
                globalProxyEnabled: true,
                globalProxyUrl: sanitizeProxyUrlForStorage(urlToUse),
                globalProxyParsed: stripSensitiveProxyFields(parsed),
                globalProxyUserDisabled: false,
              });
              return true;
            }

            setGlobalProxyEnabled(false);
            await browser.runtime.sendMessage({ method: "clearGlobalProxyConfig" });
            await browser.storage.local.set({
              globalProxyEnabled: false,
              globalProxyUserDisabled: true,
            });
            // Auto-disable Paint the Burp when proxy is disabled
            if (paintBurp) {
              setPaintBurp(false);
              await browser.storage.local.set({ addContainerColorHeaderEnabled: false });
            }
            return true;
          } finally {
            proxyToggleBusyRef.current = false;
            setProxyToggleBusy(false);
          }
        }}
        proxyToggleDisabled={proxyToggleBusy}
        proxyUrl={proxyUrl}
        onProxyUrlChange={async (url) => {
          setProxyUrl(url);
          setGlobalProxyError("");
          const browser = requireWebExt();
          const updates: Record<string, any> = { globalProxyUrl: sanitizeProxyUrlForStorage(url) };
          const parsed = parseGlobalProxyUrl(url);
          if (parsed) {
            await browser.runtime.sendMessage({ method: "setGlobalProxyConfig", proxy: parsed });
            updates.globalProxyParsed = stripSensitiveProxyFields(parsed);
          }
          await browser.storage.local.set(updates);
        }}
        proxyError={globalProxyError}
        paintBurp={paintBurp}
        onTogglePaintBurp={async (enabled) => {
          setPaintBurp(enabled);
          const browser = requireWebExt();
          await browser.storage.local.set({ addContainerColorHeaderEnabled: enabled });
        }}
        userAgentEnabled={globalUserAgent}
        onToggleUserAgent={async (enabled) => {
          setGlobalUserAgent(enabled);
          const browser = requireWebExt();
          if (enabled) {
            await loadUserAgents(false);
            await browser.storage.local.set({ globalUserAgentEnabled: true });
          } else {
            await browser.storage.local.set({ globalUserAgentEnabled: false, globalUserAgent: "" });
            setSelectedUserAgent("");
          }
        }}
        userAgentType={userAgentType}
        onSelectUserAgentType={async (type) => {
          setUserAgentType(type);
          const browser = requireWebExt();
          await browser.storage.local.set({ globalUserAgentType: type });
        }}
        selectedUserAgent={selectedUserAgent}
        onSelectUserAgent={async (ua) => {
          setSelectedUserAgent(ua);
          const browser = requireWebExt();
          await browser.storage.local.set({ globalUserAgent: ua });
        }}
        onClearUserAgent={async () => {
          setSelectedUserAgent("");
          const browser = requireWebExt();
          await browser.storage.local.set({ globalUserAgent: "" });
        }}
        userAgentsData={userAgentsData}
        onRefreshUserAgents={() => loadUserAgents(true)}
        onOpenInNewTab={() => openPicker("Open in new tab in…", "openNewTab")}
        onReopenSiteIn={() => openPicker("Reopen this site in…", "reopenSiteIn")}
        onSortTabs={async () => {
          const browser = requireWebExt();
          await browser.runtime.sendMessage({ method: "sortTabs" });
        }}
        onAlwaysOpenIn={() => openPicker("Always open this site in…", "alwaysOpenIn")}
        vpnWarnDot={vpnWarnDot}
        onOpenOptions={async () => {
          try {
            const browser = requireWebExt();
            browser.runtime.openOptionsPage();
            if (vpnWarnDot) {
              const stored = await browser.storage.local.get({
                mozillaVpnHiddenToutsList: [],
              });
              const list = Array.isArray(stored.mozillaVpnHiddenToutsList) ? stored.mozillaVpnHiddenToutsList : [];
              if (!list.find((t: any) => t && t.name === "moz-permissions-warning-dot")) {
                list.push({ name: "moz-permissions-warning-dot" });
                await browser.storage.local.set({ mozillaVpnHiddenToutsList: list });
              }
              setVpnWarnDot(false);
            }
          } catch { /* ignore */ }
        }}
        proxyPresets={customProxyPresets}
        onSaveProxyPreset={handleSaveProxyPreset}
        onUpdateProxyPreset={handleUpdateProxyPreset}
        onDeleteProxyPreset={handleDeleteProxyPreset}
      />
    </PopupWrapper>
  );
}

export default App;
