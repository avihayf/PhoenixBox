import { ArrowLeft, ChevronRight } from 'lucide-react';
import { ContainerIcon } from '../ContainerIcon';
import { getContainerColorHex } from '../../../lib/containerColors';

type Container = {
  cookieStoreId: string;
  name: string;
  color: string;
  icon: string;
  displayIcon: string;
  tabCount: number;
};

interface ManageContainersViewProps {
  containers: Container[];
  onBack: () => void;
  onSelectContainer: (container: Container) => void;
  onAddContainer: () => void;
}

export function ManageContainersView({
  containers,
  onBack,
  onSelectContainer,
  onAddContainer,
}: ManageContainersViewProps) {
  // Show scrollbar only when more than 10 containers
  const needsScroll = containers.length > 10;
  
  return (
    <div className="w-full h-fit flex flex-col bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--ext-border)] bg-[var(--ext-bg)] flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-[var(--ext-bg-secondary)] rounded-lg transition-all duration-200 active:ring-2 active:ring-[var(--ext-accent)] active:ring-offset-1 active:ring-offset-[var(--ext-bg)]"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-[var(--ext-accent)]" />
        </button>
        <h1 className="tracking-wide uppercase text-[var(--ext-accent)] brand-title flex-1">Manage</h1>
      </div>

      {/* Container List + Add Button - scrollable only after 10 items */}
      <div 
        className={`p-2.5 space-y-1 ${needsScroll ? 'max-h-[440px] overflow-y-auto custom-scrollbar' : ''}`}
      >
        {containers.map(container => {
          const hex = getContainerColorHex(container.color);
          const hasTabs = container.tabCount > 0;
          return (
            <button
              key={container.cookieStoreId}
              onClick={() => onSelectContainer(container)}
              className="relative w-full flex items-center gap-3 py-2.5 pl-4 pr-3 rounded-lg overflow-hidden transition-colors group"
              style={{ background: `${hex}0d`, border: `1px solid ${hex}33` }}
              onMouseEnter={e => (e.currentTarget.style.background = `${hex}1a`)}
              onMouseLeave={e => (e.currentTarget.style.background = `${hex}0d`)}
            >
              {/* left color bar */}
              <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: hex }} />
              {/* color-tinted icon chip */}
              <span
                className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
                style={{ background: `${hex}26` }}
              >
                <ContainerIcon iconKey={container.displayIcon || container.icon} colorHex={hex} />
              </span>
              {/* name + tab status */}
              <span className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
                <span className="text-sm font-semibold text-[var(--ext-text)] truncate leading-none">{container.name}</span>
                <span
                  className="text-[11px] leading-none"
                  style={{ color: hasTabs ? hex : 'var(--ext-text-muted)' }}
                >
                  {hasTabs ? `${container.tabCount} open ${container.tabCount === 1 ? 'tab' : 'tabs'}` : 'No open tabs'}
                </span>
              </span>
              {/* count badge — hidden when zero */}
              {hasTabs && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.6rem] text-center flex-shrink-0"
                  style={{ background: hex, color: '#050510' }}
                >
                  {container.tabCount}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-[var(--ext-text-muted)] group-hover:text-[var(--ext-accent)] transition-colors flex-shrink-0" />
            </button>
          );
        })}

        {/* Add New Container - attached to last profile */}
        <button
          onClick={onAddContainer}
          className="w-full flex items-center justify-center py-2 mt-1 border-2 border-[var(--ext-accent)] text-[var(--ext-accent)] rounded-lg hover:bg-[var(--ext-cyan-bg)] btn-brand-primary"
        >
          + Add New Container
        </button>
      </div>
    </div>
  );
}
