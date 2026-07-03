import { useState } from 'react';
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

interface ContainerSelectorViewProps {
  title: string;
  containers: Container[];
  onBack: () => void;
  onSelectContainer: (container: Container) => void;
  children?: React.ReactNode;
}

export function ContainerSelectorView({
  title,
  containers,
  onBack,
  onSelectContainer,
  children,
}: ContainerSelectorViewProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        <h1 className="tracking-wide uppercase text-[var(--ext-accent)] brand-title truncate flex-1">{title}</h1>
      </div>

      {/* Container List */}
      <div className="flex-1 min-h-0 p-2 space-y-1 overflow-y-auto custom-scrollbar">
        {containers.map(container => {
          const cHex = getContainerColorHex(container.color);
          const hovered = hoveredId === container.cookieStoreId;
          return (
            <button
              key={container.cookieStoreId}
              onClick={() => onSelectContainer(container)}
              onMouseEnter={() => setHoveredId(container.cookieStoreId)}
              onMouseLeave={() => setHoveredId(null)}
              className="group w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors"
              style={{
                border: `1px solid ${hovered ? `${cHex}99` : 'transparent'}`,
                background: hovered ? `${cHex}1a` : 'transparent',
              }}
            >
              <ContainerIcon iconKey={container.displayIcon || container.icon} colorHex={cHex} />
              <span className="text-sm text-[var(--ext-text)] flex-1 truncate">{container.name}</span>
              {container.tabCount > 0 && (
                <span
                  className="text-xs min-w-[1.5rem] text-center shrink-0"
                  style={{ color: cHex }}
                  title={`${container.tabCount} open`}
                >
                  {container.tabCount}
                </span>
              )}
              <ChevronRight
                className="w-4 h-4 shrink-0 transition-colors"
                style={{ color: hovered ? cHex : 'var(--ext-text-muted)' }}
              />
            </button>
          );
        })}
      </div>

      {/* Additional content (like "Extract Endpoints" / "Add Container" button) */}
      {children}
    </div>
  );
}
