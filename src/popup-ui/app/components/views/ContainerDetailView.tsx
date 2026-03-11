import { ArrowLeft, Plus, Eye, ArrowLeftRight, Hourglass, Trash2, X } from 'lucide-react';
import { ContainerIcon } from '../ContainerIcon';
import { getContainerColorHex } from '../../../lib/containerColors';

interface Tab {
  id: number;
  title: string;
  url: string;
  favicon?: string;
}

interface ContainerDetailViewProps {
  containerName: string;
  containerColor: string;
  containerIcon?: string;
  tabs: Tab[];
  onBack: () => void;
  onManageContainer: () => void;
  onOpenNewTab: () => void;
  onHideContainer: () => void;
  onMoveToWindow: () => void;
  onManageSites: () => void;
  onClearStorage: () => void;
  onCloseTab: (tabId: number) => void;
}

export function ContainerDetailView({
  containerName,
  containerColor,
  containerIcon,
  tabs,
  onBack,
  onManageContainer,
  onOpenNewTab,
  onHideContainer,
  onMoveToWindow,
  onManageSites,
  onClearStorage,
  onCloseTab,
}: ContainerDetailViewProps) {
  const colorHex = getContainerColorHex(containerColor);

  const themed = {
    '--c-accent': colorHex,
    '--c-accent-10': `${colorHex}1a`,
    '--c-accent-15': `${colorHex}26`,
    '--c-accent-25': `${colorHex}40`,
  } as React.CSSProperties;

  return (
    <div className="w-full h-auto max-h-[720px] flex flex-col bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-xl shadow-xl overflow-hidden" style={themed}>
      {/* Accent top stripe */}
      <div className="h-[2px] w-full flex-shrink-0" style={{ background: 'var(--ext-accent)' }} />

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
          <ContainerIcon iconKey={containerIcon || 'circle'} colorHex={colorHex} className="w-[20px] h-[22px]" />
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
          />
          <ActionButton
            icon={<Eye className="w-4 h-4 text-[var(--ext-purple)]" />}
            label="Hide this container"
            onClick={onHideContainer}
            accentColor={colorHex}
          />
          <ActionButton
            icon={<ArrowLeftRight className="w-4 h-4 text-[var(--ext-green)]" />}
            label="Move tabs to a new window"
            onClick={onMoveToWindow}
            accentColor={colorHex}
          />
          <ActionButton
            icon={<Hourglass className="w-4 h-4 text-[var(--ext-yellow)]" />}
            label="Always open site in container"
            onClick={onManageSites}
            accentColor={colorHex}
          />
          <ActionButton
            icon={<Trash2 className="w-4 h-4 text-[var(--ext-red)]" />}
            label="Clear container storage"
            onClick={onClearStorage}
            variant="danger"
          />
        </div>

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
                  {tab.favicon ? (
                    <img src={tab.favicon} alt="" className="w-3.5 h-3.5 flex-shrink-0 rounded-sm" />
                  ) : (
                    <div className="w-3.5 h-3.5 flex-shrink-0 bg-[var(--ext-bg-tertiary)] rounded-sm" />
                  )}
                  <span className="text-xs text-[var(--ext-text)] flex-1 truncate font-medium">{tab.title || tab.url}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--ext-red)]/10 text-[var(--ext-text-muted)] hover:text-[var(--ext-red)] rounded transition-colors"
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
          style={{ borderColor: 'var(--ext-accent)', color: 'var(--ext-accent)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--ext-accent) 9%, transparent)')}
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
}

function ActionButton({ icon, label, onClick, variant = 'default', accentColor }: ActionButtonProps) {
  if (variant === 'danger') {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-2.5 p-2 rounded transition-colors text-left group text-[var(--ext-red)] hover:bg-[var(--ext-red)]/5"
      >
        <span className="flex items-center justify-center w-5 h-5 transition-transform group-hover:scale-110 shrink-0">{icon}</span>
        <span className="text-sm font-medium leading-none flex-1">{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded transition-colors text-left group text-[var(--ext-text)]"
      onMouseEnter={e => { if (accentColor) e.currentTarget.style.background = `${accentColor}10`; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="flex items-center justify-center w-5 h-5 transition-transform group-hover:scale-110 shrink-0">{icon}</span>
      <span className="text-sm font-medium leading-none flex-1">{label}</span>
    </button>
  );
}
