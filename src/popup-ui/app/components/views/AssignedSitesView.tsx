import { ArrowLeft, Globe, RotateCcw, Trash2 } from "lucide-react";

type AssignedSite = {
  key: string;
  hostname: string;
};

interface AssignedSitesViewProps {
  containerName: string;
  sites: AssignedSite[];
  loading?: boolean;
  onBack: () => void;
  onRemoveSite: (siteKey: string) => void;
  onResetCookies: (hostname: string) => void;
}

export function AssignedSitesView({
  containerName,
  sites,
  loading = false,
  onBack,
  onRemoveSite,
  onResetCookies,
}: AssignedSitesViewProps) {
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
        <h1 className="tracking-wide uppercase text-[var(--ext-accent)] brand-title truncate">
          Manage Site List
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2.5 space-y-2.5 custom-scrollbar">
        <div className="text-xs text-[var(--ext-text-muted)] uppercase tracking-wider">
          {containerName}
        </div>

        {loading ? (
          <div className="text-xs text-[var(--ext-text-muted)]">Loading…</div>
        ) : sites.length === 0 ? (
          <div className="text-xs text-[var(--ext-text-muted)]">
            No designated sites yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {sites.map((site) => {
              return (
                <div
                  key={site.key}
                  className="flex items-center gap-2.5 p-2 bg-[var(--ext-bg-secondary)] border border-[var(--ext-border)]/50 rounded-lg"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[var(--ext-bg-tertiary)] text-[var(--ext-text-muted)]">
                    <Globe className="h-3 w-3" />
                  </span>
                  <span className="text-xs text-[var(--ext-text)] flex-1 truncate">
                    {site.hostname}
                  </span>
                  <button
                    onClick={() => onResetCookies(site.hostname)}
                    className="p-1.5 rounded hover:bg-[var(--ext-bg-tertiary)] text-[var(--ext-text-muted)] hover:text-[var(--ext-accent)]"
                    title="Reset site cookies"
                    aria-label={`Reset cookies for ${site.hostname}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onRemoveSite(site.key)}
                    className="p-1.5 rounded hover:bg-[var(--ext-red)]/10 text-[var(--ext-text-muted)] hover:text-[var(--ext-red)]"
                    title="Remove from list"
                    aria-label={`Remove ${site.hostname}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
