import { Plus, RotateCcw, ArrowUpDown, Hourglass, Sun, Moon, Info, Search, ChevronRight, ChevronDown, ChevronUp, Palette, Trash2, Edit2, X, ArrowUp, Eye, EyeOff, Globe, Highlighter, UserCog, Settings, Lock, type LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ContainerIcon } from '../ContainerIcon';
import { UserAgentModal } from '../modals/UserAgentModal';
import { ProxyPresetModal } from '../modals/ProxyPresetModal';
import type { UserAgentData } from '../../../lib/userAgent';
import { getContainerColorHex } from '../../../lib/containerColors';
import { type ProxyPreset } from '../../../lib/proxyPresets';
import { HueAccentPicker } from '../HueAccentPicker';
import { LogoAccentPicker } from '../LogoAccentPicker';
import { accentToHue, type AccentValue, type LogoAccentValue } from '../../../lib/accentColors';
import { HighlighterModal } from '../modals/HighlighterModal';
import type { HighlighterPairing, HighlighterStatus } from '../../../lib/highlighterSettings';

/**
 * Compact on/off toggle tile used for the Proxy / Highlighter / User-Agent controls.
 * `onConfigure` adds a corner settings button inside the tile, so turning a
 * control on never makes the main view taller.
 */
function ControlTile({ icon: Icon, label, active, disabled, onClick, onConfigure }: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  onConfigure?: () => void;
}) {
  const color = active ? 'var(--ext-accent)' : 'var(--ext-text-muted)';
  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        className="w-full flex flex-col items-center gap-1.5 py-2.5 px-1.5 rounded-xl border transition-colors disabled:opacity-50"
        style={{ borderColor: active ? 'var(--ext-accent)' : 'var(--ext-border)', background: active ? 'var(--ext-accent-bg)' : 'transparent' }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
        <span className="text-[11px] font-medium leading-tight text-center" style={{ color }}>{label}</span>
        <span className="text-[9px] uppercase tracking-wide font-semibold" style={{ color }}>{active ? 'On' : 'Off'}</span>
      </button>
      {onConfigure && (
        <button
          type="button"
          onClick={onConfigure}
          className="absolute top-1 right-1 p-1 rounded-md text-[var(--ext-accent)] hover:bg-[var(--ext-accent)]/15 focus-visible:bg-[var(--ext-accent)]/15 transition-colors"
          aria-label={`Configure ${label}`}
          title={`Configure ${label}`}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

import type { Container } from '../../../lib/types';

interface SiteActionsViewProps {
  containers: Container[];
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onManageContainers: () => void;
  onSelectContainer: (container: Container) => void;
  onContainerDetails: (container: Container) => void;

  // Proxy & Settings
  proxyEnabled: boolean;
  onToggleProxy: (enabled: boolean, urlOverride?: string) => Promise<boolean>;
  proxyToggleDisabled?: boolean;
  proxyUrl: string;
  onProxyUrlChange: (url: string) => void;
  proxyError?: string;

  // Burp highlighting: one Burp listener per marked container
  highlighterContainerIds: string[];
  onToggleHighlighterContainer: (container: Container) => void;
  highlighterPairing: HighlighterPairing | null;
  highlighterStatus: HighlighterStatus | null;
  onPairHighlighter: (pairing: HighlighterPairing) => Promise<void>;
  onUnpairHighlighter: () => Promise<void>;

  // User Agent
  userAgentEnabled: boolean;
  onToggleUserAgent: (enabled: boolean) => void;
  userAgentType: 'all' | 'desktop' | 'mobile';
  onSelectUserAgentType: (type: 'all' | 'desktop' | 'mobile') => void;
  selectedUserAgent: string;
  onSelectUserAgent: (userAgent: string) => void;
  onClearUserAgent: () => void;
  userAgentsData: UserAgentData;
  onRefreshUserAgents: () => void;

  // Actions
  onOpenInNewTab: () => void;
  onReopenSiteIn: () => void;
  onSortTabs: () => void;
  onAlwaysOpenIn: () => void;

  // VPN
  vpnWarnDot: boolean;
  onOpenOptions: () => void;

  // Accent Color
  accentColor: AccentValue;
  onChangeAccent: (value: AccentValue) => void;
  logoAccent: LogoAccentValue;
  onChangeLogoAccent: (value: LogoAccentValue) => void;

  // Proxy Presets
  proxyPresets: ProxyPreset[];
  onSaveProxyPreset: (preset: Omit<ProxyPreset, 'id'>) => void;
  onUpdateProxyPreset: (id: string, preset: Omit<ProxyPreset, 'id'>) => void;
  onDeleteProxyPreset: (id: string) => void;
  onQuickDeleteContainer: (container: Container) => void;
  onQuickHideContainer: (container: Container) => void;
  promotedProxyContainerIds: string[];
  onTogglePromotedProxyContainer: (container: Container) => void;
}

export function SiteActionsView({
  containers,
  isDarkMode,
  onToggleTheme,
  onManageContainers,
  onSelectContainer,
  onContainerDetails,
  proxyEnabled,
  onToggleProxy,
  proxyToggleDisabled,
  proxyUrl,
  onProxyUrlChange,
  proxyError,
  highlighterContainerIds,
  onToggleHighlighterContainer,
  highlighterPairing,
  highlighterStatus,
  onPairHighlighter,
  onUnpairHighlighter,
  userAgentEnabled,
  onToggleUserAgent,
  userAgentType,
  onSelectUserAgentType,
  selectedUserAgent,
  onSelectUserAgent,
  onClearUserAgent,
  userAgentsData,
  onRefreshUserAgents,
  onOpenInNewTab,
  onReopenSiteIn,
  onSortTabs,
  onAlwaysOpenIn,
  vpnWarnDot,
  onOpenOptions,
  accentColor,
  onChangeAccent,
  logoAccent,
  onChangeLogoAccent,
  proxyPresets,
  onSaveProxyPreset,
  onUpdateProxyPreset,
  onDeleteProxyPreset,
  onQuickDeleteContainer,
  onQuickHideContainer,
  promotedProxyContainerIds,
  onTogglePromotedProxyContainer,
}: SiteActionsViewProps) {
  const [showUserAgentModal, setShowUserAgentModal] = useState(false);
  const [isQuickActionsExpanded, setIsQuickActionsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAccentPicker, setShowAccentPicker] = useState(false);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ProxyPreset | null>(null);
  const [showHighlighterModal, setShowHighlighterModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeletePresetId, setConfirmDeletePresetId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [hoveredContainerId, setHoveredContainerId] = useState<string | null>(null);
  const presetDropdownRef = useRef<HTMLDivElement>(null);
  const accentPickerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(event.target as Node)) {
        setShowPresetDropdown(false);
      }
      if (accentPickerRef.current && !accentPickerRef.current.contains(event.target as Node)) {
        setShowAccentPicker(false);
      }
    };

    if (showPresetDropdown || showAccentPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPresetDropdown, showAccentPicker]);

  const handleToggleUserAgent = (enabled: boolean) => {
    onToggleUserAgent(enabled);
    if (enabled) {
      setShowUserAgentModal(true);
    }
  };

  // Uses the value the modal reports rather than the selectedUserAgent prop,
  // which after "Clear Override" was still the old agent in this render — the
  // tile stayed on with no User-Agent set.
  const handleCloseUserAgentModal = (userAgent: string) => {
    setShowUserAgentModal(false);
    // If no user-agent was selected, auto-disable the toggle
    if (!userAgent) {
      onToggleUserAgent(false);
    }
  };

  const toggleQuickActions = () => {
    setIsQuickActionsExpanded(!isQuickActionsExpanded);
  };

  const filteredContainers = containers.filter(container =>
    container.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  // A fresh profile has four containers, and the view is sized so those four
  // fit the 600px popup without scrolling. Past that the list scrolls on its
  // own, capped at four rows, so the Manage button stays in view.
  const shouldScrollContainers = filteredContainers.length > 4;

  return (
    <div className="w-full max-h-[600px] flex flex-col bg-[var(--ext-bg)] rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ext-border)] flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleTheme}
            className="p-1.5 hover:bg-[var(--ext-bg-secondary)] rounded-lg transition-all hover:scale-110"
            aria-label="Toggle theme"
          >
            {isDarkMode ? (
              <Sun className="w-6 h-6 text-[var(--ext-accent)]" />
            ) : (
              <Moon className="w-6 h-6 text-[var(--ext-accent)]" />
            )}
          </button>

          {/* Accent Color Picker */}
          <div className="relative" ref={accentPickerRef}>
            <button
              onClick={() => setShowAccentPicker(!showAccentPicker)}
              className="p-1.5 hover:bg-[var(--ext-bg-secondary)] rounded-lg transition-all hover:scale-110"
              aria-label="Change accent color"
            >
              <Palette className="w-6 h-6 text-[var(--ext-accent)]" />
            </button>

            {showAccentPicker && (
              <div className="absolute top-full left-0 mt-1 p-3 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg shadow-xl z-50 w-[220px]">
                <HueAccentPicker value={accentColor} onChange={onChangeAccent} isDark={isDarkMode} />
                <LogoAccentPicker
                  value={logoAccent}
                  themeHue={accentToHue(accentColor)}
                  isDark={isDarkMode}
                  onChange={onChangeLogoAccent}
                />
              </div>
            )}
          </div>
        </div>

        <h1 className="brand-main-title text-[32px] leading-none">
          {"PhoenixBox".split("").map((ch, i) => (
            <span key={i} style={{ color: i >= 7 ? 'var(--ext-logo-accent)' : 'var(--ext-accent)' }}>
              {ch}
            </span>
          ))}
        </h1>

        <button
          onClick={onOpenOptions}
          className="p-1.5 hover:bg-[var(--ext-bg-secondary)] rounded transition-colors relative"
          aria-label="Open options"
        >
          <Info className="w-6 h-6 text-[var(--ext-accent)]" />
          {vpnWarnDot && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-[var(--ext-pink)] rounded-full badge-pulse" />
          )}
        </button>
      </div>

      {/* Content - scrollable so Manage button stays reachable */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {/* Quick Actions - Click to Toggle */}
        <div className="p-2.5 flex-shrink-0">
          {/* Toggle Header - Clickable */}
          <button
            onClick={toggleQuickActions}
            aria-expanded={isQuickActionsExpanded}
            aria-controls="quick-actions-list"
            className="w-full flex items-center gap-2.5 p-2 hover:bg-[var(--ext-bg-secondary)] rounded transition-colors group"
          >
            <Plus className="w-4 h-4 text-[var(--ext-accent)]" />
            <span className="text-sm text-[var(--ext-text)] flex-1 text-left">Quick Actions</span>
            {isQuickActionsExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--ext-accent)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--ext-text-muted)] group-hover:text-[var(--ext-accent)] transition-colors" />
            )}
          </button>

          {/* Expandable Actions */}
          <div
            id="quick-actions-list"
            // Collapsed actions stay out of the tab order and the a11y tree;
            // visually hiding them left invisible buttons focusable.
            // (React 18's types predate `inert`; "" sets the boolean attribute.)
            {...({ inert: isQuickActionsExpanded ? undefined : "" } as Record<string, unknown>)}
            className={`overflow-hidden transition-all duration-300 ease-in-out space-y-1 ${isQuickActionsExpanded
              ? 'max-h-40 opacity-100 mt-1'
              : 'max-h-0 opacity-0'
              }`}
            onTransitionEnd={() => {
              window.dispatchEvent(new Event("phoenix-popup-resize"));
            }}
          >
            <ActionItem
              icon={<Plus className="w-4 h-4 text-[var(--ext-accent)]" />}
              label="Open in new tab"
              onClick={onOpenInNewTab}
            />
            <ActionItem
              icon={<RotateCcw className="w-4 h-4 text-[var(--ext-green)]" />}
              label="Reopen this site in"
              onClick={onReopenSiteIn}
            />
            <ActionItem
              icon={<ArrowUpDown className="w-4 h-4 text-[var(--ext-purple)]" />}
              label="Sort tabs by container"
              onClick={onSortTabs}
            />
            <ActionItem
              icon={<Hourglass className="w-4 h-4 text-[var(--ext-yellow)]" />}
              label="Always open this site in"
              onClick={onAlwaysOpenIn}
            />
          </div>
        </div>

        {/* Burp / Proxy Section */}
        <div className="px-2.5 py-2.5 border-t border-[var(--ext-border)] flex-shrink-0">
          <h2 className="text-xs uppercase tracking-wider text-[var(--ext-accent)] mb-2.5">
            Burp / Proxy
          </h2>

          <div className="space-y-2.5">
            {/* Burp / Proxy control tiles */}
            <div className="flex gap-2">
              <ControlTile
                icon={Globe}
                label="Proxy"
                active={proxyEnabled}
                disabled={!!proxyToggleDisabled}
                onClick={() => onToggleProxy(!proxyEnabled)}
              />
              {/* On means paired and talking to the JAR; containers are marked in the list below. */}
              <ControlTile
                icon={Highlighter}
                label="Highlighter"
                active={!!highlighterPairing && highlighterStatus?.state === 'connected'}
                onClick={() => setShowHighlighterModal(true)}
              />
              <ControlTile
                icon={UserCog}
                label="User-Agent"
                active={userAgentEnabled}
                onClick={() => handleToggleUserAgent(!userAgentEnabled)}
                onConfigure={userAgentEnabled ? () => setShowUserAgentModal(true) : undefined}
              />
            </div>

            {/* Proxy URL Input with Presets */}
            <div className="relative">
              <div className="flex gap-1.5">
                {/* Preset Dropdown Button */}
                <div className="relative" ref={presetDropdownRef}>
                  <button
                    onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                    className={`px-2.5 py-1.5 border rounded-lg text-xs transition-colors flex items-center gap-1 whitespace-nowrap ${
                      showPresetDropdown
                        ? 'border-[var(--ext-accent)] bg-[var(--ext-accent-bg)] text-[var(--ext-accent)]'
                        : 'border-[var(--ext-border)] text-[var(--ext-text)] hover:border-[var(--ext-accent)]'
                    }`}
                  >
                    <span>Presets</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showPresetDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {/* Preset Dropdown Menu */}
                  {showPresetDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-64 bg-[var(--ext-bg)] border border-[var(--ext-accent)] rounded-lg shadow-lg z-50 overflow-hidden">
                      <div className="max-h-48 overflow-y-auto overflow-x-hidden custom-scrollbar">
                        {proxyPresets.map((preset, index) => (
                          <div 
                            key={preset.id}
                            className={`group flex items-center hover:bg-[var(--ext-bg-secondary)] transition-colors ${index < proxyPresets.length - 1 ? 'border-b border-[var(--ext-border)]' : ''}`}
                          >
                            <button
                              onClick={async () => {
                                const url = `${preset.scheme}://${preset.host}:${preset.port}`;
                                onProxyUrlChange(url);
                                await onToggleProxy(true, url);
                                setShowPresetDropdown(false);
                              }}
                              className="flex-1 px-3 py-2 text-left min-w-0"
                            >
                              <p className="text-xs text-[var(--ext-text)] font-medium truncate">{preset.name}</p>
                              <p className="text-[10px] text-[var(--ext-text-muted)] font-mono truncate">
                                {preset.scheme}://{preset.host}:{preset.port}
                              </p>
                            </button>
                            <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                              <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPreset(preset);
                                      setShowProxyModal(true);
                                      setShowPresetDropdown(false);
                                    }}
                                    className="p-1.5 text-[var(--ext-text-muted)] hover:text-[var(--ext-accent)] transition-colors"
                                    title="Edit preset"
                                    aria-label={`Edit ${preset.name}`}
                                  >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Two clicks: the built-in Burp preset cannot be
                                  // restored once deleted.
                                  if (confirmDeletePresetId !== preset.id) {
                                    setConfirmDeletePresetId(preset.id);
                                    return;
                                  }
                                  setConfirmDeletePresetId(null);
                                  onDeleteProxyPreset(preset.id);
                                }}
                                className={`p-1.5 transition-colors ${confirmDeletePresetId === preset.id ? 'text-[var(--ext-red)]' : 'text-[var(--ext-text-muted)] hover:text-[var(--ext-red)]'}`}
                                title={confirmDeletePresetId === preset.id ? 'Click again to delete' : 'Delete preset'}
                                aria-label={confirmDeletePresetId === preset.id ? `Confirm deleting ${preset.name}` : `Delete ${preset.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setEditingPreset(null);
                          setShowProxyModal(true);
                          setShowPresetDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-xs text-[var(--ext-accent)] bg-[var(--ext-bg-secondary)] border-t border-[var(--ext-border)] hover:bg-[var(--ext-accent-bg)] transition-colors text-left font-medium flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New Preset
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Proxy URL Input - locked while the proxy is on */}
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    value={proxyUrl}
                    onChange={(e) => onProxyUrlChange(e.target.value)}
                    readOnly={proxyEnabled}
                    placeholder="Select preset"
                    aria-invalid={!!proxyError}
                    aria-describedby={proxyError ? 'proxy-url-error' : undefined}
                    title={proxyEnabled ? 'Disable proxy to edit URL manually' : undefined}
                    className={`w-full px-2.5 py-1.5 bg-transparent border rounded-lg text-xs text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)] ${proxyError ? 'border-[var(--ext-red)]' : 'border-[var(--ext-border)]'} ${proxyEnabled ? 'pr-7 opacity-70 cursor-not-allowed' : ''}`}
                  />
                  {proxyEnabled && (
                    <Lock
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--ext-text-muted)] pointer-events-none"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
              {/* Floats over the section below so an error never resizes the view */}
              {proxyError && (
                <p
                  id="proxy-url-error"
                  role="alert"
                  className="absolute left-0 right-0 top-full mt-1 z-20 px-2 py-1 text-[10px] text-[var(--ext-red)] bg-[var(--ext-bg-secondary)] border border-[var(--ext-red)]/50 rounded-md shadow-lg"
                >
                  {proxyError}
                </p>
              )}
            </div>

            {/* Proxy Modal for Custom Configuration */}
            <ProxyPresetModal
              isOpen={showProxyModal}
              onClose={() => {
                setShowProxyModal(false);
                setEditingPreset(null);
              }}
              onSave={(preset) => {
                if (editingPreset) {
                  onUpdateProxyPreset(editingPreset.id, preset);
                } else {
                  onSaveProxyPreset(preset);
                }
              }}
              initialData={editingPreset || undefined}
            />

          </div>
        </div>

        {/* Containers Section */}
        <div className="border-t border-[var(--ext-border)]">
          <div className="px-2.5 py-2.5 flex flex-col">
            <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
              <h2 className="text-xs uppercase tracking-wider text-[var(--ext-accent)]">
                Containers
              </h2>
            <button
              type="button"
              onClick={() => searchInputRef.current?.focus()}
              className="p-1 hover:bg-[var(--ext-bg-secondary)] rounded transition-colors"
              aria-label="Search containers"
            >
                <Search className="w-3.5 h-3.5 text-[var(--ext-accent)]" />
              </button>
            </div>

            {/* Search Input */}
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Search containers"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full px-2.5 py-1.5 mb-2.5 text-xs bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)] flex-shrink-0"
            />

            {/* Container List */}
            <div className={`${shouldScrollContainers ? 'max-h-[164px] overflow-y-auto custom-scrollbar' : ''}`}>
              <div className="space-y-1">
                {filteredContainers.map(container => {
                  const cHex = getContainerColorHex(container.color);
                  const isConfirming = confirmDeleteId === container.cookieStoreId;
                  const isPromoted = promotedProxyContainerIds.includes(container.cookieStoreId);
                  const isHighlighted = highlighterContainerIds.includes(container.cookieStoreId);
                  const highlighterError = highlighterStatus?.errors?.[container.cookieStoreId];
                  const highlighterAddress = highlighterStatus?.addresses?.[container.cookieStoreId];
                  const pinned = isPromoted || isHighlighted;
                  const hasVisibleTabs = container.visibleTabCount > 0;
                  const hasHiddenTabs = container.hiddenTabCount > 0;
                  const hideActionLabel = hasVisibleTabs ? "Hide" : "Show";
                  return (
                    <div
                      key={container.cookieStoreId}
                      className="relative group container-item rounded-lg overflow-hidden transition-colors"
                      style={{
                        border: `1px solid ${
                          hoveredContainerId === container.cookieStoreId
                            ? `${cHex}99`
                            : isPromoted
                              ? `${cHex}40`
                              : 'transparent'
                        }`,
                        background:
                          hoveredContainerId === container.cookieStoreId
                            ? `${cHex}1a`
                            : isPromoted
                              ? `${cHex}0d`
                              : 'transparent',
                      }}
                      onMouseEnter={() => setHoveredContainerId(container.cookieStoreId)}
                      onMouseLeave={() => setHoveredContainerId(null)}
                    >
                      {isPromoted && !isConfirming && (
                        <div
                          className="absolute left-[3px] top-2 bottom-2 w-[3px] rounded z-10"
                          style={{ background: cHex }}
                        />
                      )}
                      {isConfirming ? (
                        <div
                          className="flex items-center gap-2 p-2 rounded border"
                          style={{ borderColor: `${cHex}66`, background: `${cHex}0d` }}
                        >
                          <ContainerIcon iconKey={container.displayIcon || container.icon} colorHex={cHex} />
                          <span className="text-xs text-[var(--ext-text)] flex-1 truncate">
                            Delete <strong>{container.name}</strong>?
                          </span>
                          <button
                            type="button"
                            onClick={() => { onQuickDeleteContainer(container); setConfirmDeleteId(null); }}
                            className="px-2 py-0.5 text-xs font-medium bg-[var(--ext-red)] text-white rounded hover:opacity-80 transition-opacity"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 text-xs font-medium border border-[var(--ext-border)] text-[var(--ext-text-muted)] rounded hover:text-[var(--ext-text)] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelectContainer(container)}
                            className="w-full flex items-center gap-2.5 p-2 pr-[11.5rem] rounded text-left"
                          >
                            <ContainerIcon iconKey={container.displayIcon || container.icon} colorHex={cHex} />
                            <span className="text-sm text-[var(--ext-text)] flex-1 truncate">{container.name}</span>
                            {isPromoted && (
                              <span className="text-[10px] uppercase tracking-wide font-medium shrink-0" style={{ color: cHex }}>
                                Proxy
                              </span>
                            )}
                          </button>
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <span
                              className="text-xs min-w-[1.5rem] text-center pointer-events-none"
                              style={{ color: cHex }}
                              title={`${container.visibleTabCount} open, ${container.hiddenTabCount} hidden`}
                            >
                              {container.tabCount}
                            </span>
                            <div
                              className={`flex items-center gap-1 transition-opacity duration-150 ${
                                pinned
                                  ? 'opacity-100'
                                  : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
                              }`}
                            >
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onTogglePromotedProxyContainer(container); }}
                              className={`p-1 rounded transition-colors ${
                                isPromoted
                                  ? 'text-[var(--ext-accent)] bg-[var(--ext-accent-bg)]'
                                  : 'text-[var(--ext-accent)] hover:bg-[var(--ext-accent-bg)] focus-visible:bg-[var(--ext-accent-bg)]'
                              }`}
                              aria-label={isPromoted ? `Unpromote ${container.name} from proxy` : `Promote ${container.name} for proxy`}
                              title={isPromoted ? 'Unpromote from proxy' : 'Promote for proxy'}
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onToggleHighlighterContainer(container); }}
                              className={`p-1 rounded transition-colors ${
                                isHighlighted
                                  ? 'bg-[var(--ext-accent-bg)]'
                                  : 'hover:bg-[var(--ext-accent-bg)] focus-visible:bg-[var(--ext-accent-bg)]'
                              }`}
                              style={{ color: highlighterError ? 'var(--ext-red)' : 'var(--ext-accent)' }}
                              aria-pressed={isHighlighted}
                              aria-label={isHighlighted ? `Stop highlighting ${container.name} in Burp` : `Highlight ${container.name} in Burp`}
                              title={
                                !isHighlighted
                                  ? 'Highlight in Burp: give this container its own Burp listener'
                                  : highlighterError
                                    ? `Highlighter: ${highlighterError}`
                                    : highlighterAddress
                                      ? `Highlighted in Burp via ${highlighterAddress}`
                                      : 'Highlighted in Burp (waiting for the Highlighter)'
                              }
                            >
                              <Highlighter className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); onQuickHideContainer(container); }}
                              className="p-1 rounded transition-colors text-[var(--ext-purple)] hover:bg-[var(--ext-purple)]/10 focus-visible:bg-[var(--ext-purple)]/10"
                              aria-label={`${hideActionLabel} ${container.name}`}
                              title={hasVisibleTabs ? "Hide open tabs" : hasHiddenTabs ? "Show hidden tabs" : "No tabs to hide"}
                            >
                              {hasVisibleTabs ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(container.cookieStoreId); }}
                              className="p-1 rounded transition-colors text-[var(--ext-red)] hover:bg-[var(--ext-red)]/10 focus-visible:bg-[var(--ext-red)]/10"
                              aria-label={`Delete ${container.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onContainerDetails(container); }}
                              className="p-1 rounded transition-colors"
                              style={{ color: cHex }}
                              onMouseEnter={e => { e.currentTarget.style.background = `${cHex}1a`; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                              onFocus={e => { e.currentTarget.style.background = `${cHex}1a`; }}
                              onBlur={e => { e.currentTarget.style.background = 'transparent'; }}
                              aria-label={`Open ${container.name}`}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Button */}
          <div className="p-2.5 border-t border-[var(--ext-border)] bg-[var(--ext-bg)]">
            <button
              onClick={onManageContainers}
              className="w-full flex items-center justify-center py-2 border-2 border-[var(--ext-accent)] text-[var(--ext-accent)] rounded-lg hover:bg-[var(--ext-accent-bg)] transition-colors uppercase tracking-wider font-medium text-xs"
            >
              Manage Containers
            </button>
          </div>
        </div>

      </div>

      <HighlighterModal
        isOpen={showHighlighterModal}
        onClose={() => setShowHighlighterModal(false)}
        pairing={highlighterPairing}
        status={highlighterStatus}
        containers={containers}
        onPair={onPairHighlighter}
        onUnpair={onUnpairHighlighter}
      />

      {/* User Agent Modal */}
      <UserAgentModal
        isOpen={showUserAgentModal}
        onClose={handleCloseUserAgentModal}
        userAgentType={userAgentType}
        selectedUserAgent={selectedUserAgent}
        onSelectUserAgentType={onSelectUserAgentType}
        onSelectUserAgent={onSelectUserAgent}
        onClearUserAgent={onClearUserAgent}
        userAgentsData={userAgentsData}
        onRefreshUserAgents={onRefreshUserAgents}
      />

    </div>
  );
}

interface ActionItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function ActionItem({ icon, label, onClick }: ActionItemProps) {
  return (
    <button
      className="w-full flex items-center gap-2.5 p-2 hover:bg-[var(--ext-bg-secondary)] rounded transition-colors group"
      onClick={onClick}
    >
      <span className="text-[var(--ext-text)]">{icon}</span>
      <span className="text-sm text-[var(--ext-text)] flex-1 text-left">{label}</span>
      <ChevronRight className="w-4 h-4 text-[var(--ext-text-muted)] group-hover:text-[var(--ext-accent)] transition-colors" />
    </button>
  );
}
