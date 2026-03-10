import { Plus, RotateCcw, ArrowUpDown, Hourglass, Sun, Moon, Info, Search, ChevronRight, ChevronDown, ChevronUp, Palette, Trash2, Edit2, X, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ContainerIcon } from '../ContainerIcon';
import { Switch } from '../ui/switch';
import { UserAgentModal } from '../modals/UserAgentModal';
import { ProxyPresetModal } from '../modals/ProxyPresetModal';
import type { UserAgentData } from '../../../lib/userAgent';
import { getContainerColorHex } from '../../../lib/containerColors';
import { DEFAULT_PROXY_PRESETS, type ProxyPreset } from '../../../data/mockData';
import { requireWebExt } from '../../../lib/browser';
import { HueAccentPicker } from '../HueAccentPicker';
import type { AccentValue } from '../../../lib/accentColors';

type Container = {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
  displayIcon: string;
  tabCount: number;
};

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
  paintBurp: boolean;
  onTogglePaintBurp: (enabled: boolean) => Promise<void>;

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

  // Proxy Presets
  proxyPresets: ProxyPreset[];
  onSaveProxyPreset: (preset: Omit<ProxyPreset, 'id'>) => void;
  onUpdateProxyPreset: (id: string, preset: Omit<ProxyPreset, 'id'>) => void;
  onDeleteProxyPreset: (id: string) => void;
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
  paintBurp,
  onTogglePaintBurp,
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
  proxyPresets,
  onSaveProxyPreset,
  onUpdateProxyPreset,
  onDeleteProxyPreset,
}: SiteActionsViewProps) {
  const [showUserAgentModal, setShowUserAgentModal] = useState(false);
  const [isQuickActionsExpanded, setIsQuickActionsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAccentPicker, setShowAccentPicker] = useState(false);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ProxyPreset | null>(null);
  const [showPaintBurpFirstTimeMessage, setShowPaintBurpFirstTimeMessage] = useState(false);
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

  const handleCloseUserAgentModal = () => {
    setShowUserAgentModal(false);
    // If no user-agent was selected, auto-disable the toggle
    if (!selectedUserAgent) {
      onToggleUserAgent(false);
    }
  };

  const toggleQuickActions = () => {
    setIsQuickActionsExpanded(!isQuickActionsExpanded);
  };

  const filteredContainers = containers.filter(container =>
    container.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const shouldScrollContainers = filteredContainers.length > 6;

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
                <HueAccentPicker value={accentColor} onChange={onChangeAccent} />
              </div>
            )}
          </div>
        </div>

        <h1 className="brand-main-title text-[32px] text-[var(--ext-accent)]">
          PhoenixBox
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
            {/* Proxy Toggle */}
            <div className="flex items-center justify-between">
            <span className="text-[calc(0.875rem+0.5px)] leading-[1.25rem] text-[var(--ext-text)]">Proxy all tabs</span>
              <Switch
                checked={proxyEnabled}
                onCheckedChange={onToggleProxy}
                disabled={!!proxyToggleDisabled}
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
                                const proxyEnabled = await onToggleProxy(true, url);
                                if (preset.autoEnablePaintBurp && proxyEnabled) {
                                  await onTogglePaintBurp(true);
                                }
                                setShowPresetDropdown(false);
                              }}
                              className="flex-1 px-3 py-2 text-left min-w-0"
                            >
                              <p className="text-xs text-[var(--ext-text)] font-medium truncate">{preset.name}</p>
                              <p className="text-[10px] text-[var(--ext-text-muted)] font-mono truncate">
                                {preset.scheme}://{preset.host}:{preset.port}
                              </p>
                            </button>
                            <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPreset(preset);
                                      setShowProxyModal(true);
                                      setShowPresetDropdown(false);
                                    }}
                                    className="p-1.5 text-[var(--ext-text-muted)] hover:text-[var(--ext-accent)] transition-colors"
                                    title="Edit preset"
                                  >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteProxyPreset(preset.id);
                                }}
                                className="p-1.5 text-[var(--ext-text-muted)] hover:text-[var(--ext-red)] transition-colors"
                                title="Delete preset"
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
                
                {/* Proxy URL Input */}
                <input
                  type="text"
                  value={proxyUrl}
                  onChange={(e) => onProxyUrlChange(e.target.value)}
                  readOnly={proxyEnabled}
                  placeholder="Select preset"
                  className={`flex-1 px-2.5 py-1.5 bg-transparent border border-[var(--ext-border)] rounded-lg text-xs text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)] ${proxyEnabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
              <div className="mt-1 space-y-1">
                {proxyError && (
                  <p className="text-[10px] text-[var(--ext-red)]">{proxyError}</p>
                )}
                {proxyEnabled && !proxyError && (
                  <p className="text-[10px] text-[var(--ext-text-muted)] flex items-center gap-1">
                    <Info className="w-2.5 h-2.5" />
                    Disable proxy to edit URL manually
                  </p>
                )}
              </div>
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

            {/* Paint the Burp */}
            <div className="flex items-center justify-between">
            <span className="text-[calc(0.875rem+0.5px)] leading-[1.25rem] text-[var(--ext-text)]">Paint the Burp</span>
              <Switch
                checked={paintBurp}
                onCheckedChange={async (enabled) => {
                  await onTogglePaintBurp(enabled);
                  // Check if this is the first time enabling
                  if (enabled) {
                    const browser = requireWebExt();
                    const stored = await browser.storage.local.get({ paintBurpFirstTimeMessageShown: false });
                    if (!stored.paintBurpFirstTimeMessageShown) {
                      await browser.storage.local.set({ paintBurpFirstTimeMessageShown: true });
                      setShowPaintBurpFirstTimeMessage(true);
                    }
                  }
                }}
                disabled={!proxyEnabled}
              />
            </div>

            {/* User Agent Toggle */}
            <div className="flex items-center justify-between">
            <span className="text-[calc(0.875rem+0.5px)] leading-[1.25rem] text-[var(--ext-text)]">Set User-Agent</span>
              <Switch
                checked={userAgentEnabled}
                onCheckedChange={handleToggleUserAgent}
              />
            </div>

            {/* User Agent Configure Button (when enabled) */}
            {userAgentEnabled && (
              <button
                onClick={() => setShowUserAgentModal(true)}
                className="w-full px-3 py-2 text-xs bg-[var(--ext-accent-bg)] border border-[var(--ext-accent)] text-[var(--ext-accent)] rounded-lg hover:bg-[var(--ext-accent)] hover:text-black transition-colors"
              >
                Configure User-Agent
              </button>
            )}
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
              className="p-1 hover:bg-[var(--ext-bg-secondary)] rounded transition-colors"
              aria-label="Search containers"
            >
                <Search className="w-3.5 h-3.5 text-[var(--ext-accent)]" />
              </button>
            </div>

            {/* Search Input */}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full px-2.5 py-1.5 mb-2.5 text-xs bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)] flex-shrink-0"
            />

            {/* Container List */}
            <div className={`${shouldScrollContainers ? 'max-h-[220px] overflow-y-auto custom-scrollbar' : ''}`}>
              <div className="space-y-1">
                {filteredContainers.map(container => {
                  const cHex = getContainerColorHex(container.color);
                  return (
                    <div
                      key={container.cookieStoreId}
                      className="relative group container-item"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectContainer(container)}
                        className="w-full flex items-center gap-2.5 p-2 pr-8 border border-transparent rounded transition-colors text-left"
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = `${cHex}66`;
                          e.currentTarget.style.background = `${cHex}0d`;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <ContainerIcon iconKey={container.displayIcon || container.icon} colorHex={cHex} />
                        <span className="text-sm text-[var(--ext-text)] flex-1">{container.name}</span>
                        <span className="text-xs min-w-[1.5rem] text-center" style={{ color: cHex }}>
                          {container.tabCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onContainerDetails(container);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                        style={{ color: 'var(--ext-text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${cHex}1a`; e.currentTarget.style.color = cHex; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ext-text-muted)'; }}
                        aria-label={`Edit ${container.name}`}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
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

      {/* Paint the Burp First-Time Message Modal */}
      {showPaintBurpFirstTimeMessage && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setShowPaintBurpFirstTimeMessage(false)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div 
              className="bg-[var(--ext-bg-secondary)] border-2 border-[var(--ext-accent)] rounded-xl shadow-2xl w-full max-w-[320px] pointer-events-auto animate-in scale-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ext-border)]">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[var(--ext-accent)]" />
                  <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--ext-accent)] brand-title">
                    Paint the Burp Setup
                  </h2>
                </div>
                <button
                  onClick={() => setShowPaintBurpFirstTimeMessage(false)}
                  className="p-1.5 hover:bg-[var(--ext-bg-tertiary)] rounded transition-all duration-200"
                >
                  <X className="w-4 h-4 text-[var(--ext-text-muted)]" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                <p className="text-xs text-[var(--ext-text)] leading-relaxed">
                  For this feature to work, make sure you load the <strong className="text-[var(--ext-accent)]">Phoenix JAR</strong> in your Burp extension.
                </p>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => setShowPaintBurpFirstTimeMessage(false)}
                  className="w-full px-3 py-2 text-xs bg-[var(--ext-accent)] text-black rounded-lg hover:bg-[var(--ext-accent-light)] transition-all duration-200 font-medium"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
