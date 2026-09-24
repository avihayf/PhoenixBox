import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { DEFAULT_PROXY_PRESETS, effectivePresetId, presetProxyType, type ProxyPreset } from "../lib/proxyPresets";
import { logError } from "../lib/logger";
import { type AccentValue, ACCENT_PRESETS, applyCustomHue, clearCustomHue, serializeAccent, deserializeAccent, type LogoAccentValue, applyLogoAccentToDOM, serializeLogoAccent, deserializeLogoAccent } from "../lib/accentColors";
import { toProxyType, type Container, type Tab, type AssignedSite } from "../lib/types";
import * as msg from "../lib/messages";
import { defaultSecurityIcon } from "../lib/securityProfiles";
import { HIGHLIGHTER_HEADERS_KEY, HIGHLIGHTER_STORAGE_DEFAULTS,
  resolveHighlighterHeadersEnabled, highlighterChangeValue } from "../lib/highlighterSettings";
import { readProxyMap, getProxyForContainer,
  setProxyForContainer as storeSetProxyForContainer } from "../lib/proxyStore";

type View = "main" | "detail" | "edit" | "picker" | "manage" | "assignedSites" | "advancedProxy" | "onboarding";

function countVisibleAndHiddenTabs(visibleTabs: unknown[], hiddenTabs: unknown) {
  const visibleCount = Array.isArray(visibleTabs) ? visibleTabs.length : 0;
  const hiddenCount = Array.isArray(hiddenTabs) ? hiddenTabs.length : 0;
  return visibleCount + hiddenCount;
}


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
  const [globalProxyEnabled, setGlobalProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");
  const [globalProxyError, setGlobalProxyError] = useState<string>("");
  const [proxyToggleBusy, setProxyToggleBusy] = useState(false);
  const proxyToggleBusyRef = useRef(false);
  // Proxy URLs this popup wrote itself. Their storage.onChanged echo must not
  // be copied back into the input: the stored copy is password-stripped, so
  // echoing it erased a password mid-typing (and a stale echo of an earlier
  // keystroke rewound the text).
  const selfWrittenProxyUrlsRef = useRef(new Set<string>());
  const quickHideBusyRef = useRef(new Set<string>());
  const [paintBurp, setPaintBurp] = useState(false);
  const [promotedProxyContainerIds, setPromotedProxyContainerIds] = useState<string[]>([]);
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
  const [logoAccent, setLogoAccent] = useState<LogoAccentValue>({ linked: true });
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

  // container.proxyUrl is "type://host:port" built by refreshContainers
  // (with "direct://" for a Disable-proxy entry).
  const parseContainerProxyUrl = (url: string) => {
    if (url === "direct://") return { type: "direct" };
    const m = /^([a-z0-9]+):\/\/(\[[^\]]+\]|[^:/]+)(?::(\d+))?/i.exec(url);
    return m ? { type: m[1], host: m[2].replace(/^\[|\]$/g, ""), port: Number(m[3]) } : null;
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
      await msg.reloadInContainer({
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
        await msg.assignAndReloadInContainer({
          url: tab.url,
          currentUserContextId: false,
          newUserContextId,
          tabIndex: tab.index + 1,
          active: tab.active,
          groupId: tab.groupId,
        });
      } else {
        await msg.setOrRemoveAssignment(tab.id, tab.url, newUserContextId, false);
      }
      window.close();
      return;
    }
  };

  // Read-only. It used to rewrite container identities and icon overrides on
  // every popup open — forcing colours by name (reverting a user's choice the
  // moment they saved it), forcing icons, and fighting the background's own
  // startup normalization. The background now owns that, once.
  const refreshContainers = async () => {
    const browser = requireWebExt();
    const identities = await browser.contextualIdentities.query({});
    // Every window, not just the current one. These counts drive the hide/show
    // toggle, and hiding is container-scoped — a per-window count would offer
    // "show" for a container whose tabs are simply in another window.
    const stateKeys = identities.map((id) => `identitiesState@@_${id.cookieStoreId}`);
    const [tabQuery, stored, proxifiedMap] = await Promise.all([
      browser.tabs.query({}),
      // One read for everything, rather than one per container.
      browser.storage.local.get([...stateKeys, "containerUserAgents", "containerDisplayIconOverrides"]),
      readProxyMap(),
    ]);
    const containerUserAgents = (stored.containerUserAgents || {}) as Record<string, string>;
    const overrides = (stored.containerDisplayIconOverrides || {}) as Record<string, string>;

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

    const computed: Container[] = identities.map((id) => {
      const storedContainerState =
        ((stored as Record<string, any>)[`identitiesState@@_${id.cookieStoreId}`] || {}) as Record<string, any>;
      const visibleTabs = tabsGrouped[id.cookieStoreId] || [];
      const hiddenTabs = Array.isArray(storedContainerState.hiddenTabs) ? storedContainerState.hiddenTabs : [];

      const proxyObj = proxifiedMap.get(id.cookieStoreId);
      const proxyUrlStr = proxyObj
        ? `${proxyObj.type}://${proxyObj.host}${proxyObj.port ? ":" + proxyObj.port : ""}`
        : "";
      const legacyAdvancedProxy =
        proxyObj &&
        !proxyObj.source &&
        proxyObj.type !== "direct" &&
        proxyObj.host &&
        proxyObj.port &&
        proxyObj.mozProxyEnabled === false;

      return {
        cookieStoreId: id.cookieStoreId,
        name: id.name,
        color: id.color,
        icon: id.icon,
        displayIcon:
          overrides[id.cookieStoreId] ||
          defaultSecurityIcon(id.cookieStoreId) ||
          id.icon,
        tabCount: countVisibleAndHiddenTabs(visibleTabs, hiddenTabs),
        visibleTabCount: visibleTabs.length,
        hiddenTabCount: hiddenTabs.length,
        proxyUrl: proxyUrlStr,
        proxySource: (proxyObj?.source as string | undefined) || (legacyAdvancedProxy ? "advanced" : undefined),
        isIsolated: !!storedContainerState.isIsolated,
        userAgent: containerUserAgents[id.cookieStoreId] || "",
      };
    });
    setContainers(computed);
    return computed;
  };

  const loadAssignedSites = async (cookieStoreId: string) => {
    const browser = requireWebExt();
    const userContextId = cookieStoreIdToUserContextId(cookieStoreId);
    if (!userContextId) return;
    setAssignedSitesLoading(true);
    try {
      const response = await msg.getAssignmentObjectByContainer<Record<string, any>>(userContextId);
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
    proxy: { type: string; host: string; port: number; mozProxyEnabled: boolean; proxyDNS?: boolean; source?: string } | null,
  ) => {
    try {
      await storeSetProxyForContainer(cookieStoreId, proxy);
    } catch (err) {
      logError("Failed to set proxy for container:", err);
    }
  };

  const loadAdvancedProxyInitial = async (cookieStoreId: string) => {
    try {
      const entryProxy = await getProxyForContainer(cookieStoreId);
      const entry = entryProxy ? { proxy: entryProxy } : undefined;
      // Show whatever proxy is configured (including VPN proxies) so the
      // user can see what's active.  Previously, VPN proxies (which have
      // countryCode) were silently filtered out, letting users unknowingly
      // overwrite them.
      if (entry?.proxy?.host && entry?.proxy?.port) {
        setAdvancedProxyInitial({
          type: toProxyType(entry.proxy.type),
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
    // Held in the effect's closure, not inside run(), so the cleanup React
    // actually receives can reach them: run() is async, so anything it returns
    // is a promise React discards.
    let permissionListener: (() => void) | null = null;
    let storageListener: ((changes: any, areaName: string) => void) | null = null;
    let cancelled = false;

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

    // Load saved logo highlight (P, i, B) color
    const savedLogo = deserializeLogoAccent(localStorage.getItem("logoAccent"));
    setLogoAccent(savedLogo);
    applyLogoAccentToDOM(savedLogo, document.documentElement.classList.contains('dark'));

    const run = async () => {
      const browser = requireWebExt();


      const win = await browser.windows.getCurrent();
      const winId = win?.id ?? null;
      setWindowId(winId);

      // Get current global settings from storage (keep existing keys).
      const stored = await browser.storage.local.get({
        "onboarding-stage": 0,
        globalProxyEnabled: false,
        globalProxyUrl: "",
        globalProxyParsed: null,
        globalProxyCredentialsMissing: false,
        ...HIGHLIGHTER_STORAGE_DEFAULTS,
        promotedProxyContainerId: "",
        promotedProxyContainerIds: null,
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
        // Proxy passwords are never written to disk, so an authenticated proxy
        // comes back without credentials after a browser restart.
        setGlobalProxyError(
          stored.globalProxyCredentialsMissing
            ? "Proxy password isn't saved. Re-enter the proxy URL with its password to reconnect."
            : ""
        );
      }
      setProxyUrl(sanitizedStoredProxyUrl);

      setPaintBurp(resolveHighlighterHeadersEnabled(stored as Record<string, unknown>));
      if (Array.isArray(stored.promotedProxyContainerIds)) {
        setPromotedProxyContainerIds(
          (stored.promotedProxyContainerIds as unknown[]).map((id) => String(id || "")).filter((id) => id)
        );
      } else {
        // Migrate the legacy single promoted container ID into the array key.
        const legacyId = String(stored.promotedProxyContainerId || "");
        const migrated = legacyId ? [legacyId] : [];
        setPromotedProxyContainerIds(migrated);
        await browser.storage.local.set({ promotedProxyContainerIds: migrated });
      }
      setGlobalUserAgent(!!stored.globalUserAgentEnabled);
      setUserAgentType(stored.globalUserAgentType as any);
      setSelectedUserAgent(String(stored.globalUserAgent || ""));

      await refreshContainers();
      if (
        stored.globalUserAgentEnabled ||
        stored.globalUserAgent ||
        Object.keys(stored.containerUserAgents || {}).length > 0
      ) {
        // Not awaited: on a cold cache this is three CDN fetches, and the
        // presets menu, VPN state and storage listener used to wait on them.
        void loadUserAgents(false);
      }
      await loadCustomProxyPresets();

      // Mozilla VPN status + permissions warning
      // Only the permissions warning dot lives in the main view. It depends on
      // two permissions and one storage key, all of which have change events,
      // so it is recomputed on those rather than polled. The old 3-second poll
      // also pinged the VPN app each time, and every status reply bumps the
      // VPN proxy isolation key — forcing fresh proxy connections every three
      // seconds while the popup was open.
      const refreshVpn = async () => {
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
      // The popup can be dismissed while the awaits above are still in flight,
      // in which case cleanup has already run and there is nothing to register.
      if (cancelled) return;

      permissionListener = () => { refreshVpn().catch(() => {}); };
      browser.permissions.onAdded.addListener(permissionListener);
      browser.permissions.onRemoved.addListener(permissionListener);

      // Listen for storage changes from background (e.g. permission rescue)
      const handleStorageChange = (changes: any, areaName: string) => {
        if (areaName !== "local") return;
        if (changes.globalProxyEnabled) {
          setGlobalProxyEnabled(!!changes.globalProxyEnabled.newValue);
          if (changes.globalProxyEnabled.newValue) setGlobalProxyError("");
        }
        if (changes.globalProxyUrl) {
          const next = String(changes.globalProxyUrl.newValue || "");
          if (!selfWrittenProxyUrlsRef.current.has(next)) setProxyUrl(next);
        }
        if (changes.globalProxyCredentialsMissing?.newValue) {
          setGlobalProxyError(
            "Proxy password isn't saved. Re-enter the proxy URL with its password to reconnect."
          );
        }
        const nextHighlighter = highlighterChangeValue(changes);
        if (nextHighlighter !== undefined) {
          setPaintBurp(nextHighlighter);
        }
        if (changes.promotedProxyContainerIds) {
          const next = changes.promotedProxyContainerIds.newValue;
          setPromotedProxyContainerIds(
            Array.isArray(next) ? next.map((id) => String(id || "")).filter((id) => id) : []
          );
        }
        if (changes.containerUserAgents) {
          // Patch the one field locally instead of rebuilding every container.
          const next = (changes.containerUserAgents.newValue || {}) as Record<string, string>;
          setContainers((current) => current.map((c) => ({ ...c, userAgent: next[c.cookieStoreId] || "" })));
        }
        if (changes.mozillaVpnHiddenToutsList) {
          refreshVpn().catch(() => {});
        }
      };
      storageListener = handleStorageChange;
      browser.storage.onChanged.addListener(handleStorageChange);
    };

    run().catch((e) => logError("Failed to load popup data:", e));

    return () => {
      cancelled = true;
      if (permissionListener) {
        try {
          const b = requireWebExt();
          b.permissions.onAdded.removeListener(permissionListener);
          b.permissions.onRemoved.removeListener(permissionListener);
        } catch {
          // Extension context already gone.
        }
        permissionListener = null;
      }
      if (storageListener) {
        try {
          requireWebExt().storage.onChanged.removeListener(storageListener);
        } catch {
          // Extension context already gone; nothing to detach from.
        }
        storageListener = null;
      }
    };
  }, []);


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
            await msg.setOrRemoveAssignment(null, siteKey, userContextId, true);
            setAssignedSites((prev) => prev.filter((s) => s.key !== siteKey));
          }}
          onResetCookies={async (hostname) => {
            const browser = requireWebExt();
            const granted = await browser.permissions.request({ permissions: ["browsingData"] });
            if (!granted) return;
            await msg.resetCookiesForSite(hostname, selectedContainer.cookieStoreId);
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
                source: "advanced",
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
              visibleTabCount: 0,
              hiddenTabCount: 0,
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
          onSave={async (name, color, icon, siteIsolation) => {
          try {
            const browser = requireWebExt();
            const isNew = selectedContainer.cookieStoreId === "new";
            const userContextId = isNew
              ? "new"
              : String(cookieStoreIdToUserContextId(selectedContainer.cookieStoreId));

            // The real chosen icon: the background maps it for Firefox and
            // records it as the display override, once.
            const response = await msg.createOrUpdateContainer<{ cookieStoreId?: string }>(
              userContextId,
              {
                name: name || (isNew ? "New Container" : selectedContainer.name),
                color: normalizeContainerColor(color),
                icon,
              }
            );
            const targetId = isNew ? response?.cookieStoreId : selectedContainer.cookieStoreId;

            if (!isNew && siteIsolation !== !!selectedContainer.isIsolated) {
              await msg.addRemoveSiteIsolation(selectedContainer.cookieStoreId, !siteIsolation);
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
          onAdvancedProxyToggle={async (enabled) => {
            if (!selectedContainer?.cookieStoreId) return;
            if (!enabled) {
              if (selectedContainer.proxySource !== "advanced") return;
              await setProxyForContainer(selectedContainer.cookieStoreId, null);
              const updated = await refreshContainers();
              const next = updated.find((c) => c.cookieStoreId === selectedContainer.cookieStoreId);
              if (next) setSelectedContainer(next);
              return;
            }
            setAdvancedProxyInitial(null); // Clear stale data from previous container
            setReturnView("edit");
            setCurrentView("advancedProxy");
            await loadAdvancedProxyInitial(selectedContainer.cookieStoreId);
          }}
          onDelete={async () => {
          const browser = requireWebExt();
          const userContextId = Number(selectedContainer.cookieStoreId.split("-").pop());
          await msg.deleteContainer(userContextId);
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
            await msg.hideTabs(selectedContainer.cookieStoreId);
          }}
          onMoveToWindow={async () => {
            const browser = requireWebExt();
            await msg.moveTabsToWindow(selectedContainer.cookieStoreId);
          }}
          onManageSites={() => {
            if (!selectedContainer?.cookieStoreId) return;
            setReturnView("detail");
            setCurrentView("assignedSites");
            loadAssignedSites(selectedContainer.cookieStoreId).catch(() => {});
          }}
          onClearStorage={async () => {
            const browser = requireWebExt();
            // browsingData is optional; request it from this click (a user
            // gesture). Without it the background call failed and the user
            // was never told, so they believed the session had been cleared.
            let granted = false;
            try {
              granted = await browser.permissions.request({ permissions: ["browsingData"] });
            } catch {
              granted = false;
            }
            if (!granted) return false;
            const userContextId = Number(selectedContainer.cookieStoreId.split("-").pop());
            const result = await msg.deleteContainerDataOnly<{ done?: boolean }>(userContextId);
            return !!(result && result.done);
          }}
          onManageContainer={handleManageContainer}
          onCloseTab={async (tabId) => {
            const browser = requireWebExt();
            await browser.tabs.remove(tabId);
            await refreshContainers();
          }}
          proxyPresets={customProxyPresets}
          activeProxyPresetId={effectivePresetId(
            selectedContainer.proxyUrl
              ? parseContainerProxyUrl(selectedContainer.proxyUrl)
              : null,
            globalProxyEnabled ? parseGlobalProxyUrl(proxyUrl) : null,
            promotedProxyContainerIds.length === 0 ||
              promotedProxyContainerIds.includes(selectedContainer.cookieStoreId),
            customProxyPresets,
          )}
          onSelectProxyPreset={async (preset) => {
            if (!preset) {
              await setProxyForContainer(selectedContainer.cookieStoreId, null);
            } else if (preset.id === "__direct__") {
              await setProxyForContainer(selectedContainer.cookieStoreId, {
                type: "direct",
                host: "",
                port: 0,
                mozProxyEnabled: false,
                source: "direct",
              });
            } else {
              await setProxyForContainer(selectedContainer.cookieStoreId, {
                type: presetProxyType(preset.scheme),
                host: preset.host,
                port: preset.port,
                // A preset is a plain proxy. true marked it as a Mozilla VPN
                // proxy, so the VPN section showed "Use VPN" on for it and
                // turning that off deleted the preset.
                mozProxyEnabled: false,
                source: "preset",
              });
            }
            // Keep the view's copy current, or the dropdown snaps back.
            const updated = await refreshContainers();
            const next = updated.find((c) => c.cookieStoreId === selectedContainer.cookieStoreId);
            if (next) setSelectedContainer(next);
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

          // White only reads on a dark background and black only on a light one,
          // so swap the mono choice when the mode flips to keep it visible.
          let nextAccent = accentColor;
          if (accentColor.type === 'preset') {
            if (!nextDark && accentColor.id === 'white') nextAccent = { type: 'preset', id: 'black' };
            else if (nextDark && accentColor.id === 'black') nextAccent = { type: 'preset', id: 'white' };
          }
          if (nextAccent !== accentColor) {
            setAccentColor(nextAccent);
            localStorage.setItem("accentColor", serializeAccent(nextAccent));
          }

          let nextLogo = logoAccent;
          if (!logoAccent.linked) {
            if (!nextDark && 'white' in logoAccent && logoAccent.white) nextLogo = { linked: false, black: true };
            else if (nextDark && 'black' in logoAccent && logoAccent.black) nextLogo = { linked: false, white: true };
          }
          if (nextLogo !== logoAccent) {
            setLogoAccent(nextLogo);
            localStorage.setItem("logoAccent", serializeLogoAccent(nextLogo));
          }

          applyAccentToDOM(nextAccent, nextDark);
          applyLogoAccentToDOM(nextLogo, nextDark);
        }}
        accentColor={accentColor}
        onChangeAccent={(value) => {
          const currentDark = document.documentElement.classList.contains('dark');
          applyAccentToDOM(value, currentDark);
          setAccentColor(value);
          localStorage.setItem("accentColor", serializeAccent(value));
        }}
        logoAccent={logoAccent}
        onChangeLogoAccent={(value) => {
          const currentDark = document.documentElement.classList.contains('dark');
          applyLogoAccentToDOM(value, currentDark);
          setLogoAccent(value);
          localStorage.setItem("logoAccent", serializeLogoAccent(value));
        }}
        onManageContainers={() => setCurrentView("manage")}
        onSelectContainer={handleContainerClick}
        onContainerDetails={handleContainerDetails}
        onQuickDeleteContainer={async (container) => {
          const browser = requireWebExt();
          const userContextId = Number(container.cookieStoreId.split("-").pop());
          await msg.deleteContainer(userContextId);
          const stored = await browser.storage.local.get({ containerDisplayIconOverrides: {}, promotedProxyContainerIds: null });
          const overrides = (stored.containerDisplayIconOverrides && typeof stored.containerDisplayIconOverrides === "object" ? stored.containerDisplayIconOverrides : {}) || {};
          if (overrides[container.cookieStoreId]) {
            delete overrides[container.cookieStoreId];
            await browser.storage.local.set({ containerDisplayIconOverrides: overrides });
          }
          const storedPromotedIds = Array.isArray(stored.promotedProxyContainerIds)
            ? (stored.promotedProxyContainerIds as unknown[]).map((id) => String(id || "")).filter((id) => id)
            : [];
          if (storedPromotedIds.includes(container.cookieStoreId)) {
            const nextIds = storedPromotedIds.filter((id) => id !== container.cookieStoreId);
            await browser.storage.local.set({ promotedProxyContainerIds: nextIds });
            setPromotedProxyContainerIds(nextIds);
          }
          await refreshContainers();
        }}
        onQuickHideContainer={async (container) => {
          const browser = requireWebExt();
          if (quickHideBusyRef.current.has(container.cookieStoreId)) return;
          quickHideBusyRef.current.add(container.cookieStoreId);
          try {
            let hasOpenTabs = container.visibleTabCount > 0;
            let hasHiddenTabs = container.hiddenTabCount > 0;
            try {
              const stateByContainer = await msg.queryIdentitiesState<Record<string, any>>(windowId);
              const state = stateByContainer?.[container.cookieStoreId];
              if (state) {
                hasOpenTabs = !!state.hasOpenTabs;
                hasHiddenTabs = !!state.hasHiddenTabs;
              }
            } catch {
              // Fall back to UI snapshot if state query fails.
            }

            if (hasOpenTabs) {
              await msg.hideTabs(container.cookieStoreId);
            } else if (hasHiddenTabs) {
              await msg.showTabs(container.cookieStoreId);
            }
            await refreshContainers();
          } finally {
            quickHideBusyRef.current.delete(container.cookieStoreId);
          }
        }}
        promotedProxyContainerIds={promotedProxyContainerIds}
        onTogglePromotedProxyContainer={async (container) => {
          const browser = requireWebExt();
          const isPromoted = promotedProxyContainerIds.includes(container.cookieStoreId);
          const nextIds = isPromoted
            ? promotedProxyContainerIds.filter((id) => id !== container.cookieStoreId)
            : [...promotedProxyContainerIds, container.cookieStoreId];
          setPromotedProxyContainerIds(nextIds);
          await browser.storage.local.set({ promotedProxyContainerIds: nextIds });
        }}
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

              await msg.setGlobalProxyConfig(parsed as unknown as Record<string, unknown>);

              setGlobalProxyEnabled(true);
              const storedUrl = sanitizeProxyUrlForStorage(urlToUse);
              selfWrittenProxyUrlsRef.current.add(storedUrl);
              await browser.storage.local.set({
                globalProxyEnabled: true,
                globalProxyUrl: storedUrl,
                globalProxyParsed: stripSensitiveProxyFields(parsed),
                globalProxyUserDisabled: false,
              });
              return true;
            }

            setGlobalProxyEnabled(false);
            await msg.clearGlobalProxyConfig();
            await browser.storage.local.set({
              globalProxyEnabled: false,
              globalProxyUserDisabled: true,
            });
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
          // Persist only a URL that parses. Anything else is mid-typing and may
          // hold a half-typed password; the last valid URL stays stored.
          const parsed = parseGlobalProxyUrl(url);
          if (!parsed) return;
          const browser = requireWebExt();
          await msg.setGlobalProxyConfig(parsed as unknown as Record<string, unknown>);
          const storedUrl = sanitizeProxyUrlForStorage(url);
          selfWrittenProxyUrlsRef.current.add(storedUrl);
          await browser.storage.local.set({
            globalProxyUrl: storedUrl,
            globalProxyParsed: stripSensitiveProxyFields(parsed),
          });
        }}
        proxyError={globalProxyError}
        paintBurp={paintBurp}
        onTogglePaintBurp={async (enabled) => {
          setPaintBurp(enabled);
          const browser = requireWebExt();
          await browser.storage.local.set({ [HIGHLIGHTER_HEADERS_KEY]: enabled });
        }}
        userAgentEnabled={globalUserAgent}
        onToggleUserAgent={async (enabled) => {
          setGlobalUserAgent(enabled);
          const browser = requireWebExt();
          if (enabled) {
            // Store first, then fetch: awaiting the (network) list first let a
            // quick close write "off" and then this late "on" win.
            await browser.storage.local.set({ globalUserAgentEnabled: true });
            void loadUserAgents(false);
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
          await msg.sortTabs();
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
