import { ArrowLeft, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ContainerIcon } from '../ContainerIcon';
import { MozillaVpnSection } from '../MozillaVpnSection';
import { UserAgentModal } from '../modals/UserAgentModal';
import { Switch } from '../ui/switch';
import { CONTAINER_COLORS, getContainerColorHex } from '../../../lib/containerColors';
import type { UserAgentData } from '../../../lib/userAgent';

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

interface EditContainerViewProps {
  container?: Container;
  onBack: () => void;
  onSave: (name: string, color: string, icon: string, proxyUrl: string, siteIsolation: boolean) => void;
  onDelete?: () => void;
  onManageSites?: () => void;
  onAdvancedProxy?: () => void;
  userAgentsData: UserAgentData;
  onRefreshUserAgents: () => void;
  onSelectContainerUserAgent: (userAgent: string) => void;
  onClearContainerUserAgent: () => void;
}

const CONTAINER_ICONS = [
  'fingerprint',
  'skull',
  'user-x',
  'user-cog',
  'user-minus',
  'briefcase',
  'dollar',
  'cart',
  'circle',
  'gift',
  'vacation',
  'food',
  'fruit',
  'pet',
  'tree',
  'chill',
  'fence',
];

export function EditContainerView({
  container,
  onBack,
  onSave,
  onDelete,
  onManageSites,
  onAdvancedProxy,
  userAgentsData,
  onRefreshUserAgents,
  onSelectContainerUserAgent,
  onClearContainerUserAgent,
}: EditContainerViewProps) {
  const [name, setName] = useState(container?.name || '');
  const [color, setColor] = useState(container?.color || 'blue');
  const [icon, setIcon] = useState(container?.displayIcon || container?.icon || 'circle');
  const [proxyUrl, setProxyUrl] = useState(container?.proxyUrl || '');
  const [siteIsolation, setSiteIsolation] = useState(container?.isIsolated || false);
  const [vpnExpanded, setVpnExpanded] = useState(false);
  const [showUserAgentModal, setShowUserAgentModal] = useState(false);
  const [containerUserAgentType, setContainerUserAgentType] = useState<'all' | 'desktop' | 'mobile'>('all');

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave(trimmedName, color, icon, proxyUrl, siteIsolation);
  };

  const selectedColorHex = getContainerColorHex(color);
  const isNew = container?.cookieStoreId === 'new';

  return (
    <div className="w-full h-auto max-h-[600px] flex flex-col bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-[var(--ext-border)] bg-[var(--ext-bg)] z-20">
        <button
          onClick={onBack}
          className="p-2 hover:bg-[var(--ext-bg-secondary)] rounded transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-[var(--ext-accent)]" />
        </button>
        <h1 className="tracking-wide uppercase text-[var(--ext-accent)] brand-title flex-1 truncate">
          {container?.cookieStoreId === 'new' ? 'New Container' : 'Edit Container'}
        </h1>
      </div>

      {/* Form Content */}
      <div
        className="flex-1 min-h-0 p-3 space-y-3 overflow-y-auto custom-scrollbar"
      >
        {/* Name Input */}
        <div>
          <label className="block text-sm uppercase tracking-wider text-[var(--ext-accent)] mb-2 font-bold opacity-80 pl-2">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Container name"
            className="w-full px-3 py-1.5 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)] transition-colors"
          />
        </div>

        {/* Color Picker */}
        <div>
          <label className="block text-sm uppercase tracking-wider text-[var(--ext-accent)] mb-2 font-bold opacity-80 pl-2">
            Color
          </label>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3 items-start pl-2"> {/* aligned with icon grid */}
            {CONTAINER_COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${color === c.value
                  ? 'bg-[var(--ext-bg-secondary)] ring-2 ring-white'
                  : 'bg-[var(--ext-bg-secondary)] hover:bg-[var(--ext-bg-tertiary)] opacity-60 hover:opacity-100'
                  }`}
                title={c.label}
              >
                <span
                  className="block w-4 h-4 rounded-full"
                  style={{ backgroundColor: c.hex }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Icon Picker */}
        <div>
          <label className="block text-sm uppercase tracking-wider text-[var(--ext-accent)] mb-2 font-bold opacity-80 pl-2">
            Icon
          </label>
          <div className="grid grid-cols-6 gap-x-2 gap-y-3 items-start pl-2">
            {CONTAINER_ICONS.map(i => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                aria-label={`Set icon to ${i}`}
                className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${icon === i
                  ? 'bg-[var(--ext-bg-secondary)] ring-2 ring-white'
                  : 'bg-[var(--ext-bg-secondary)] hover:bg-[var(--ext-bg-tertiary)] opacity-60 hover:opacity-100'
                  }`}
              >
                <ContainerIcon
                  iconKey={i}
                  colorHex={selectedColorHex}
                />
              </button>
            ))}
          </div>
        </div>

        {!isNew && container?.cookieStoreId && (
          <MozillaVpnSection
            cookieStoreId={container.cookieStoreId}
            expanded={vpnExpanded}
            onToggle={setVpnExpanded}
          />
        )}

        {/* Advanced Proxy Settings */}
        {!isNew && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onAdvancedProxy}
              className="w-full flex items-center justify-between p-2.5 bg-[var(--ext-bg-secondary)] rounded-lg hover:bg-[var(--ext-bg-tertiary)] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[var(--ext-purple)]" />
                <span className="text-sm text-[var(--ext-text)]">Advanced Proxy Settings</span>
              </span>
              <span className="text-xs text-[var(--ext-text-muted)]">Configure</span>
            </button>
            <input
              type="text"
              value={proxyUrl}
              readOnly
              placeholder="Set via Advanced Proxy Settings"
              className="w-full px-2.5 py-1.5 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] placeholder:text-[var(--ext-text-muted)] focus:outline-none focus:border-[var(--ext-accent)] transition-colors"
            />
          </div>
        )}

        {!isNew && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={async () => {
                if (
                  userAgentsData.all.length === 0 &&
                  userAgentsData.desktop.length === 0 &&
                  userAgentsData.mobile.length === 0
                ) {
                  await onRefreshUserAgents();
                }
                setShowUserAgentModal(true);
              }}
              className="w-full flex items-center justify-between p-2.5 bg-[var(--ext-bg-secondary)] rounded-lg hover:bg-[var(--ext-bg-tertiary)] transition-colors"
            >
              <span className="text-sm text-[var(--ext-text)]">Container User-Agent</span>
              <span className="text-xs text-[var(--ext-text-muted)]">
                {container?.userAgent ? "Configured" : "Off"}
              </span>
            </button>
          </div>
        )}

        {/* Options */}
        {!isNew && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2.5 bg-[var(--ext-bg-secondary)]/50 border border-[var(--ext-border)]/50 rounded-lg hover:border-[var(--ext-border)] transition-colors">
              <span className="text-xs text-[var(--ext-text)]">Limit to designated sites</span>
              <Switch
                checked={siteIsolation}
                onCheckedChange={setSiteIsolation}
              />
            </div>
            {siteIsolation && (
              <button
                type="button"
                onClick={onManageSites}
                className="text-xs text-[var(--ext-accent)] hover:underline px-1"
              >
                Manage Site List…
              </button>
            )}
          </div>
        )}

        {/* Delete Button (only for existing containers) */}
        {container && container.cookieStoreId !== 'new' && onDelete && (
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#2a0a1a] hover:bg-[#3a0a2a] border border-[var(--ext-pink)] text-[var(--ext-pink)] rounded-lg transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Delete This Container
          </button>
        )}
      </div>

      {!isNew && (
        <UserAgentModal
          isOpen={showUserAgentModal}
          onClose={() => setShowUserAgentModal(false)}
          userAgentType={containerUserAgentType}
          selectedUserAgent={container?.userAgent || ""}
          onSelectUserAgentType={setContainerUserAgentType}
          onSelectUserAgent={onSelectContainerUserAgent}
          onClearUserAgent={onClearContainerUserAgent}
          userAgentsData={userAgentsData}
          onRefreshUserAgents={onRefreshUserAgents}
        />
      )}

      {/* Bottom Buttons */}
      <div className="p-2.5 border-t border-[var(--ext-border)] bg-[var(--ext-bg)] flex gap-2.5">
        <button
          onClick={onBack}
          className="flex-1 flex items-center justify-center py-2.5 border border-[var(--ext-border)] text-[var(--ext-text)] rounded-lg hover:bg-[var(--ext-bg-secondary)] transition-colors uppercase tracking-wider text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center py-2.5 bg-[var(--ext-accent)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 btn-brand-primary disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!name.trim()}
        >
          Save Identity
        </button>
      </div>

    </div>
  );
}
