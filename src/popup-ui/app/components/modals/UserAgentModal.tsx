import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { parseUserAgentForDisplay, type UserAgentData } from '../../../lib/userAgent';

interface UserAgentModalProps {
  isOpen: boolean;
  /** Called with the User-Agent in effect as the modal closes ("" if none). */
  onClose: (userAgent: string) => void;
  userAgentType: 'all' | 'desktop' | 'mobile';
  selectedUserAgent: string;
  onSelectUserAgentType: (type: 'all' | 'desktop' | 'mobile') => void;
  onSelectUserAgent: (userAgent: string) => void;
  onClearUserAgent: () => void;
  userAgentsData: UserAgentData;
  onRefreshUserAgents: () => void;
}

export function UserAgentModal({
  isOpen,
  onClose,
  userAgentType,
  selectedUserAgent,
  onSelectUserAgentType,
  onSelectUserAgent,
  onClearUserAgent,
  userAgentsData,
  onRefreshUserAgents,
}: UserAgentModalProps) {
  const typeList = userAgentsData[userAgentType] || [];
  const userAgents = typeList.length > 0 ? typeList : userAgentsData.all;
  const isCustomUserAgent = !!selectedUserAgent && !userAgents.includes(selectedUserAgent);
  const [customMode, setCustomMode] = useState(isCustomUserAgent);
  const selectValue = customMode ? "custom" : selectedUserAgent;

  // Custom text is edited locally and written after a pause (or on close),
  // not on every keystroke: each write re-attached the header listener and
  // made the popup rebuild every container.
  const [customDraft, setCustomDraft] = useState(selectedUserAgent);
  const commitTimer = useRef<number | null>(null);
  const pendingDraft = useRef<string | null>(null);

  // Decide custom mode when the modal opens, not on every change: deriving it
  // from the current value dropped the user out of custom mode the moment
  // they cleared the box to retype it.
  useEffect(() => {
    if (!isOpen) return;
    setCustomMode(isCustomUserAgent);
    setCustomDraft(selectedUserAgent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const flushDraft = (): string | null => {
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    const draft = pendingDraft.current;
    pendingDraft.current = null;
    if (draft !== null) onSelectUserAgent(draft);
    return draft;
  };

  useEffect(() => () => { flushDraft(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const close = () => {
    const flushed = flushDraft();
    onClose(flushed !== null ? flushed : selectedUserAgent);
  };

  const handleClear = () => {
    pendingDraft.current = null;
    flushDraft();
    onClearUserAgent();
    onClose("");
  };

  const handleDraftChange = (value: string) => {
    setCustomDraft(value);
    pendingDraft.current = value;
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => { flushDraft(); }, 400);
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={close}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ua-modal-title"
          className="bg-[var(--ext-bg-secondary)] border-2 border-[var(--ext-accent)] rounded-xl shadow-2xl w-full max-w-[320px] pointer-events-auto animate-in scale-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ext-border)]">
            <h2 id="ua-modal-title" className="text-sm font-medium uppercase tracking-wider text-[var(--ext-accent)] brand-title">
              User-Agent Settings
            </h2>
            <button
              type="button"
              aria-label="Close"
              autoFocus
              onClick={close}
              className="p-1.5 hover:bg-[var(--ext-bg-tertiary)] rounded transition-all duration-200 active:ring-2 active:ring-[var(--ext-accent)] active:ring-offset-1 active:ring-offset-[var(--ext-bg)]"
            >
              <X className="w-4 h-4 text-[var(--ext-text-muted)]" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Refresh Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--ext-text-muted)]">
                User-Agent
              </span>
              <button
                onClick={onRefreshUserAgents}
                className="flex items-center gap-1 text-xs text-[var(--ext-accent)] hover:underline transition-all duration-200"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>

            {/* Type Selection */}
            <div>
              <label className="text-xs text-[var(--ext-text-muted)] mb-2 block">
                Platform Type
              </label>
              <div className="flex gap-2">
                {(['all', 'desktop', 'mobile'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => onSelectUserAgentType(type)}
                    className={`flex-1 px-3 py-2 text-xs rounded border transition-all duration-200 active:ring-2 active:ring-[var(--ext-accent)] active:ring-offset-2 active:ring-offset-[var(--ext-bg)] ${
                      userAgentType === type
                        ? 'border-[var(--ext-accent)] bg-[var(--ext-cyan-bg)] text-[var(--ext-accent)]'
                        : 'border-[var(--ext-border)] text-[var(--ext-text)] hover:border-[var(--ext-accent)]'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* User Agent Dropdown */}
            <div>
              <label className="text-xs text-[var(--ext-text-muted)] mb-2 block">
                Select User-Agent
              </label>
              <select
                value={selectValue}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setCustomMode(true);
                    setCustomDraft(selectedUserAgent);
                    return;
                  }
                  setCustomMode(false);
                  onSelectUserAgent(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)] transition-all duration-200"
              >
                <option value="">-- Select User-Agent --</option>
                {userAgents.map((ua) => (
                  <option key={ua} value={ua}>
                    {parseUserAgentForDisplay(ua)}
                  </option>
                ))}
                <option value="custom">-- Custom User-Agent --</option>
              </select>
            </div>

            {customMode && (
              <div>
                <label className="text-xs text-[var(--ext-text-muted)] mb-2 block">
                  Custom User-Agent
                </label>
                <input
                  type="text"
                  value={customDraft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onBlur={() => { flushDraft(); }}
                  placeholder="Enter custom User-Agent"
                  className="w-full px-3 py-2 text-xs bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)] transition-all duration-200"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleClear}
                className="flex-1 flex items-center justify-center px-3 py-2 text-xs border border-[var(--ext-border)] text-[var(--ext-text-muted)] rounded-lg hover:bg-[var(--ext-bg-tertiary)] hover:text-[var(--ext-text)] transition-all duration-200 active:ring-2 active:ring-[var(--ext-accent)] active:ring-offset-2 active:ring-offset-[var(--ext-bg)]"
              >
                Clear Override
              </button>
              <button
                onClick={close}
                className="flex-1 flex items-center justify-center px-3 py-2 text-xs bg-[var(--ext-accent)] text-black rounded-lg hover:bg-[var(--ext-cyan-light)] transition-all duration-200 font-medium active:ring-2 active:ring-[var(--ext-accent)] active:ring-offset-2 active:ring-offset-[var(--ext-bg)]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
