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
        {containers.map(container => (
          <button
            key={container.cookieStoreId}
            onClick={() => onSelectContainer(container)}
            className="w-full flex items-center gap-2.5 p-2 bg-[var(--ext-bg-secondary)] hover:bg-[var(--ext-bg-tertiary)] border border-[var(--ext-border)]/50 rounded transition-colors group"
          >
            <ContainerIcon iconKey={container.displayIcon || container.icon} colorHex={getContainerColorHex(container.color)} />
            <span className="text-sm text-[var(--ext-text)] flex-1 text-left font-medium leading-none">{container.name}</span>
            <span className="text-xs text-[var(--ext-accent)] bg-[var(--ext-cyan-bg)] px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center font-medium">
              {container.tabCount}
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--ext-text-muted)] group-hover:text-[var(--ext-accent)] transition-colors" />
          </button>
        ))}

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
