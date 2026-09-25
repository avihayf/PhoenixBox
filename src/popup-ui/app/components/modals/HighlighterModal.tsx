import { useEffect, useState } from 'react';
import { X, Highlighter, Download, Info, Link2, Unlink } from 'lucide-react';
import type { Container } from '../../../lib/types';
import {
  HIGHLIGHTER_RELEASES_URL, parsePairingString, describeStatus, formatAddress,
  type HighlighterPairing, type HighlighterStatus,
} from '../../../lib/highlighterSettings';

interface HighlighterModalProps {
  isOpen: boolean;
  onClose: () => void;
  pairing: HighlighterPairing | null;
  status: HighlighterStatus | null;
  containers: Container[];
  onPair: (pairing: HighlighterPairing) => Promise<void>;
  onUnpair: () => Promise<void>;
}

/**
 * Pairing with the PhoenixBox Highlighter JAR, and what it is doing. Containers
 * are marked for highlighting from the container list, not here.
 */
export function HighlighterModal({ isOpen, onClose, pairing, status, containers, onPair, onUnpair }: HighlighterModalProps) {
  const [pairingInput, setPairingInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPairingInput('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePair = async () => {
    const parsed = parsePairingString(pairingInput);
    if (!parsed) {
      setError("That isn't a pairing string. Copy it from the PhoenixBox tab in Burp; it starts with phx1:");
      return;
    }
    setError('');
    await onPair(parsed);
    setPairingInput('');
  };

  const connected = !!pairing && status?.state === 'connected';
  const nameOf = (id: string) => containers.find((c) => c.cookieStoreId === id)?.name || id;
  const problems = Object.entries(status?.errors || {});

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="highlighter-modal-title"
          className="relative bg-[var(--ext-bg-secondary)] border border-[var(--ext-accent)]/40 rounded-2xl overflow-hidden w-full max-w-[340px] max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar pointer-events-auto animate-in scale-in-95 duration-200"
          style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 32px var(--ext-glow-accent)' }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        >
          <div
            className="h-0.5 w-full"
            style={{ background: 'linear-gradient(90deg, transparent, var(--ext-accent) 30%, var(--ext-accent-light) 50%, var(--ext-accent) 70%, transparent)' }}
          />

          <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[var(--ext-accent)]/15">
            <div
              className="w-10 h-10 flex-none rounded-xl flex items-center justify-center border border-[var(--ext-accent)]/40"
              style={{ background: 'var(--ext-accent-bg)', boxShadow: 'inset 0 0 18px var(--ext-glow-accent)' }}
            >
              <Highlighter className="w-5 h-5 text-[var(--ext-accent)]" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--ext-text-muted)] mb-1.5">
                Burp Integration
              </div>
              <h2 id="highlighter-modal-title" className="font-medium uppercase tracking-wider text-[var(--ext-text)] brand-title" style={{ fontSize: '15px', lineHeight: 1.2 }}>
                Phoenix Highlighter
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close"
              autoFocus
              onClick={onClose}
              className="w-8 h-8 flex-none flex items-center justify-center rounded-lg text-[var(--ext-text-muted)] hover:bg-[var(--ext-accent-bg)] hover:text-[var(--ext-accent)] transition-all duration-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pt-4 pb-5 space-y-3.5">
            <p className="text-sm text-[var(--ext-text)] leading-relaxed">
              Mark containers with the <Highlighter className="inline w-3.5 h-3.5 -mt-0.5 text-[var(--ext-accent)]" /> button in the container list. Each marked container gets its own Burp listener, so Burp colours its traffic and notes the container name. Requests are never modified.
            </p>

            <div
              className="flex items-start gap-2.5 p-3 rounded-xl border"
              style={{
                borderColor: connected ? 'var(--ext-accent)' : status?.state === 'error' ? 'var(--ext-red)' : 'var(--ext-border)',
                background: connected ? 'var(--ext-accent-bg)' : 'transparent',
              }}
              role="status"
            >
              <Info className="w-4 h-4 flex-none mt-0.5" style={{ color: status?.state === 'error' ? 'var(--ext-red)' : 'var(--ext-accent)' }} />
              <p className="text-xs text-[var(--ext-text)] leading-relaxed">{describeStatus(status, !!pairing)}</p>
            </div>

            {problems.length > 0 && (
              <ul className="space-y-1">
                {problems.map(([id, message]) => (
                  <li key={id} className="text-[11px] text-[var(--ext-red)] leading-snug">
                    <strong>{nameOf(id)}</strong>: {message}
                  </li>
                ))}
              </ul>
            )}

            {pairing ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-[var(--ext-text-muted)] font-mono truncate">
                  Paired with {formatAddress(pairing)}
                </span>
                <button
                  type="button"
                  onClick={() => void onUnpair()}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-[var(--ext-border)] text-[var(--ext-text-muted)] rounded-lg hover:text-[var(--ext-red)] hover:border-[var(--ext-red)] transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Unpair
                </button>
              </div>
            ) : null}

            <div>
              <label htmlFor="highlighter-pairing" className="text-xs text-[var(--ext-text-muted)] mb-1.5 block uppercase tracking-wider">
                {pairing ? 'Pair again' : 'Pairing string'}
              </label>
              <div className="flex gap-1.5">
                <input
                  id="highlighter-pairing"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={pairingInput}
                  onChange={(e) => setPairingInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handlePair(); }}
                  placeholder="phx1:127.0.0.1:8079:…"
                  className="flex-1 min-w-0 px-3 py-2 text-xs bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] font-mono focus:outline-none focus:border-[var(--ext-accent)] transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => void handlePair()}
                  disabled={!pairingInput.trim()}
                  className="flex items-center gap-1 px-3 py-2 text-xs bg-[var(--ext-accent)] text-black rounded-lg hover:bg-[var(--ext-accent-light)] transition-colors font-medium disabled:opacity-50"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Pair
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-[var(--ext-text-muted)] leading-snug">
                In Burp, open the PhoenixBox tab and copy the pairing string.
              </p>
              {error && <p className="mt-1.5 text-[10px] text-[var(--ext-red)]">{error}</p>}
            </div>

            <a
              href={HIGHLIGHTER_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-[var(--ext-text)] border border-[var(--ext-accent)]/35 rounded-xl hover:bg-[var(--ext-accent-bg)] transition-colors font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Get Phoenix Highlighter (v2.0.0 or later)
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
