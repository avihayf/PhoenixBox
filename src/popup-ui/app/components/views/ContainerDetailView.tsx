import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Eye, ArrowLeftRight, Hourglass, Trash2, X } from 'lucide-react';
import { ContainerIcon } from '../ContainerIcon';
import { getContainerColorHex } from '../../../lib/containerColors';
import type { ProxyPreset } from '../../../lib/proxyPresets';

import type { Tab } from '../../../lib/types';

interface ContainerDetailViewProps {
  containerName: string;
  containerColor: string;
  containerIcon?: string;
  tabs: Tab[];
  activeProxyPresetId?: string;
  proxyPresets?: ProxyPreset[];
  onBack: () => void;
  onManageContainer: () => void;
  onOpenNewTab: () => void;
  onHideContainer: () => void;
  onMoveToWindow: () => void;
  onManageSites: () => void;
  /** Resolves true when the container's site data was cleared. */
  onClearStorage: () => Promise<boolean>;
  onCloseTab: (tabId: number) => void;
  onSelectProxyPreset?: (preset: ProxyPreset | null) => void;
  /**
   * Burp listener, shown only while the container is marked for highlighting.
   * Resolves to an error message, or null once the pin is saved.
   */
  burpListener?: {
    address?: string;
    pin?: string;
    error?: string;
    onSetPin: (pin: string | null) => Promise<string | null>;
  };
}

export function ContainerDetailView({
  containerName,
  containerColor,
  containerIcon,
  tabs,
  activeProxyPresetId,
  proxyPresets = [],
  onBack,
  onManageContainer,
  onOpenNewTab,
  onHideContainer,
  onMoveToWindow,
  onManageSites,
  onClearStorage,
  onCloseTab,
  onSelectProxyPreset,
  burpListener,
}: ContainerDetailViewProps) {
  const colorHex = getContainerColorHex(containerColor);

  // Clearing wipes the session this container exists to hold, with no undo,
  // so it takes a second click; the first arms it for a few seconds.
  const [clearState, setClearState] = useState<'idle' | 'armed' | 'busy' | 'done' | 'failed'>('idle');
  useEffect(() => {
    if (clearState !== 'armed' && clearState !== 'done' && clearState !== 'failed') return;
    const timer = window.setTimeout(() => setClearState('idle'), clearState === 'armed' ? 4000 : 3000);
    return () => window.clearTimeout(timer);
  }, [clearState]);

  const handleClearClick = async () => {
    if (clearState === 'busy') return;
    if (clearState !== 'armed') {
      setClearState('armed');
      return;
    }
    setClearState('busy');
    setClearState((await onClearStorage().catch(() => false)) ? 'done' : 'failed');
  };

  const clearLabel = {
    idle: 'Clear container storage',
    armed: 'Click again to clear cookies & site data',
    busy: 'Clearing…',
    done: 'Container storage cleared',
    failed: 'Could not clear storage',
  }[clearState];

  const themed = {
    '--c-accent': colorHex,
    '--c-accent-10': `${colorHex}1a`,
    '--c-accent-15': `${colorHex}26`,
    '--c-accent-25': `${colorHex}40`,
  } as React.CSSProperties;

  return (
    <div className="w-full h-auto max-h-[600px] flex flex-col bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-xl shadow-xl overflow-hidden" style={themed}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--ext-border)] z-20" style={{ background: `${colorHex}08` }}>
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg transition-all duration-200"
          style={{ color: colorHex }}
          aria-label="Back"
          onMouseEnter={e => (e.currentTarget.style.background = `${colorHex}15`)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2.5 flex-1 overflow-hidden">
          <span
            className="flex items-center justify-center w-9 h-9 rounded-[11px] flex-shrink-0"
            style={{ background: `${colorHex}24`, border: `1px solid ${colorHex}55` }}
          >
            <ContainerIcon iconKey={containerIcon || 'circle'} colorHex={colorHex} className="w-[20px] h-[22px]" />
          </span>
          <h1 className="tracking-wide uppercase brand-title truncate" style={{ color: colorHex }}>{containerName}</h1>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Actions */}
        <div className="p-2.5 space-y-1 flex-shrink-0">
          <ActionButton
            icon={<Plus className="w-4 h-4 text-[var(--ext-accent)]" />}
            label="Open new tab in this container"
            onClick={onOpenNewTab}
            accentColor={colorHex}
            chipColor="var(--ext-accent)"
          />
          <ActionButton
            icon={<Eye className="w-4 h-4 text-[var(--ext-purple)]" />}
            label="Hide this container"
            onClick={onHideContainer}
            accentColor={colorHex}
            chipColor="var(--ext-purple)"
          />
          <ActionButton
            icon={<ArrowLeftRight className="w-4 h-4 text-[var(--ext-green)]" />}
            label="Move tabs to a new window"
            onClick={onMoveToWindow}
            accentColor={colorHex}
            chipColor="var(--ext-green)"
          />
          <ActionButton
            icon={<Hourglass className="w-4 h-4 text-[var(--ext-yellow)]" />}
            label="Always open site in container"
            onClick={onManageSites}
            accentColor={colorHex}
            chipColor="var(--ext-yellow)"
          />
          {/* divider before the destructive action */}
          <div className="h-px bg-[var(--ext-border)] mx-2 my-1.5" />
          <ActionButton
            icon={<Trash2 className="w-4 h-4 text-[var(--ext-red)]" />}
            label={clearLabel}
            onClick={() => void handleClearClick()}
            variant="danger"
          />
          <p className="sr-only" role="status" aria-live="polite">{clearState === 'idle' ? '' : clearLabel}</p>
        </div>

        {/* Proxy Quick-Switch */}
        {onSelectProxyPreset && proxyPresets.length > 0 && (
          <div className="px-2.5 pb-2.5 flex-shrink-0">
            <div className="flex items-center gap-2 p-2 rounded-lg border border-[var(--ext-border)] bg-[var(--ext-bg-secondary)]">
              <span className="text-xs text-[var(--ext-text-muted)] uppercase tracking-wider flex-shrink-0">Proxy Preset</span>
              <select
                value={activeProxyPresetId || ""}
                onChange={(e) => {
                  if (e.target.value === "") {
                    onSelectProxyPreset(null);
                  } else if (e.target.value === "__direct__") {
                    onSelectProxyPreset({ id: "__direct__", name: "Disable Proxy", scheme: "direct", host: "", port: 0 });
                  } else {
                    const preset = proxyPresets.find(p => p.id === e.target.value) || null;
                    onSelectProxyPreset(preset);
                  }
                }}
                className="flex-1 min-w-0 text-xs bg-transparent border-none text-[var(--ext-text)] focus:outline-none cursor-pointer"
              >
                <option value="">— None —</option>
                {proxyPresets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__direct__">Disable Proxy</option>
              </select>
            </div>
          </div>
        )}

        {burpListener && <BurpListenerPin {...burpListener} />}

        {/* Open Tabs Section */}
        <div className="p-2.5 border-t border-[var(--ext-border)] flex-1 flex flex-col min-h-0 space-y-1">
          <h2 className="text-xs uppercase tracking-wider mb-2.5 font-bold opacity-80 flex-shrink-0" style={{ color: colorHex }}>
            Open Tabs ({tabs.length})
          </h2>

          <div className="flex-1 overflow-y-auto min-h-0 space-y-1 themed-scrollbar pr-1">
            {tabs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-xs text-[var(--ext-text-muted)] opacity-60 uppercase tracking-widest italic">
                No active tabs
              </div>
            ) : (
              tabs.map(tab => (
                <div
                  key={tab.id}
                  className="group flex items-center gap-2.5 p-2 rounded transition-colors cursor-pointer"
                  onMouseEnter={e => (e.currentTarget.style.background = `${colorHex}0d`)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-xs text-[var(--ext-text)] flex-1 truncate font-medium">{tab.title || tab.url}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    aria-label={`Close ${tab.title || tab.url}`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 hover:bg-[var(--ext-red)]/10 text-[var(--ext-text-muted)] hover:text-[var(--ext-red)] rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="p-2.5 border-t border-[var(--ext-border)] bg-[var(--ext-bg)]">
        <button
          onClick={onManageContainer}
          className="w-full flex items-center justify-center py-2 border-2 rounded-lg font-medium text-sm transition-colors"
          style={{ borderColor: colorHex, color: colorHex }}
          onMouseEnter={e => (e.currentTarget.style.background = `${colorHex}14`)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Manage This Container
        </button>
      </div>

    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  accentColor?: string;
  chipColor?: string;
}

function ActionButton({ icon, label, onClick, variant = 'default', accentColor, chipColor }: ActionButtonProps) {
  if (variant === 'danger') {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left group text-[var(--ext-red)] hover:bg-[var(--ext-red)]/5"
      >
        <span
          className="flex items-center justify-center w-[30px] h-[30px] rounded-full shrink-0 transition-transform group-hover:scale-105"
          style={{ background: 'color-mix(in srgb, var(--ext-red) 20%, transparent)' }}
        >
          {icon}
        </span>
        <span className="text-sm font-medium leading-none flex-1">{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left group text-[var(--ext-text)]"
      onMouseEnter={e => { if (accentColor) e.currentTarget.style.background = `${accentColor}10`; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        className="flex items-center justify-center w-[30px] h-[30px] rounded-full shrink-0 transition-transform group-hover:scale-105"
        style={{ background: chipColor ? `color-mix(in srgb, ${chipColor} 22%, transparent)` : 'transparent' }}
      >
        {icon}
      </span>
      <span className="text-sm font-medium leading-none flex-1">{label}</span>
    </button>
  );
}

/**
 * Which Burp listener a highlighted container uses, and an optional pin to a
 * specific IP:port, e.g. a listener built in Burp with special settings, which
 * the Highlighter then uses as-is.
 */
function BurpListenerPin({ address, pin, error, onSetPin }: NonNullable<ContainerDetailViewProps['burpListener']>) {
  const [draft, setDraft] = useState(pin || '');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { setDraft(pin || ''); }, [pin]);

  const save = async (value: string | null) => {
    setSaveError(await onSetPin(value));
  };

  return (
    <div className="px-2.5 pb-2.5 flex-shrink-0">
      <div className="p-2 rounded-lg border border-[var(--ext-border)] bg-[var(--ext-bg-secondary)] space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--ext-text-muted)] uppercase tracking-wider flex-shrink-0">Burp Listener</span>
          <span className="flex-1 min-w-0 text-xs font-mono truncate text-right" style={{ color: error ? 'var(--ext-red)' : 'var(--ext-text)' }}>
            {error ? 'not listening' : address || 'waiting…'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(draft.trim() || null); }}
            placeholder="Automatic · or pin ip:port"
            aria-label="Pin this container to a Burp listener address"
            spellCheck={false}
            className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)]"
          />
          <button
            type="button"
            onClick={() => void save(draft.trim() || null)}
            className="px-2 py-1 text-xs border border-[var(--ext-border)] rounded text-[var(--ext-text)] hover:border-[var(--ext-accent)] transition-colors"
          >
            {draft.trim() ? 'Pin' : 'Auto'}
          </button>
        </div>
        {(saveError || error) && (
          <p className="text-[10px] text-[var(--ext-red)] leading-snug">{saveError || error}</p>
        )}
      </div>
    </div>
  );
}
