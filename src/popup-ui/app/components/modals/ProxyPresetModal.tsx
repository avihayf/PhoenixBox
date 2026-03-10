import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { ProxyPreset } from '../../data/mockData';
import { parseGlobalProxyUrl } from '../../../lib/proxy';
import { Switch } from '../ui/switch';

interface ProxyPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preset: Omit<ProxyPreset, 'id'>) => void;
  initialData?: ProxyPreset;
}

export function ProxyPresetModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: ProxyPresetModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [url, setUrl] = useState(initialData ? `${initialData.scheme}://${initialData.host}:${initialData.port}` : '');
  const [autoEnablePaintBurp, setAutoEnablePaintBurp] = useState(initialData?.autoEnablePaintBurp || false);
  const [error, setError] = useState('');

  // Reset state when modal opens with new data
  React.useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setUrl(initialData ? `${initialData.scheme}://${initialData.host}:${initialData.port}` : '');
      setAutoEnablePaintBurp(initialData?.autoEnablePaintBurp || false);
      setError('');
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSave = () => {
    setError('');
    
    if (!name.trim()) {
      setError('Please enter a name for the preset.');
      return;
    }

    if (!url.trim()) {
      setError('Please enter a proxy URL.');
      return;
    }

    if (!url.includes('://')) {
      setError('Please include the scheme (e.g., http://, socks://).');
      return;
    }

    try {
      const parsed = parseGlobalProxyUrl(url);
      if (!parsed) {
        setError('Please enter a valid proxy URL with an explicit port (e.g., http://127.0.0.1:8080).');
        return;
      }

      onSave({
        name: name.trim(),
        scheme: parsed.type,
        host: parsed.host,
        port: parsed.port,
        autoEnablePaintBurp,
      });
      
      setName('');
      setUrl('');
      setAutoEnablePaintBurp(false);
      onClose();
    } catch (e) {
      setError('Please enter a valid proxy URL (e.g., http://127.0.0.1:8080).');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-[var(--ext-bg-secondary)] border-2 border-[var(--ext-accent)] rounded-xl shadow-2xl w-full max-w-[320px] pointer-events-auto animate-in scale-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ext-border)]">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--ext-accent)] brand-title">
              {initialData ? 'Edit Proxy Preset' : 'Add Proxy Preset'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--ext-bg-tertiary)] rounded transition-all duration-200"
            >
              <X className="w-4 h-4 text-[var(--ext-text-muted)]" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-[var(--ext-text-muted)] mb-1.5 block uppercase tracking-wider">
                Preset Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My Custom Proxy"
                className="w-full px-3 py-2 text-xs bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)] transition-all duration-200"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs text-[var(--ext-text-muted)] mb-1.5 block uppercase tracking-wider">
                Proxy URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1:8080"
                className="w-full px-3 py-2 text-xs bg-[var(--ext-bg)] border border-[var(--ext-border)] rounded-lg text-[var(--ext-text)] focus:outline-none focus:border-[var(--ext-accent)] transition-all duration-200"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <p className="mt-1.5 text-[10px] text-[var(--ext-text-muted)]">
                Format: scheme://host:port
              </p>
            </div>

            {/* Auto Enable Paint the Burp */}
            <div className="flex items-center justify-between py-2">
              <label htmlFor="auto-enable-paint-burp" className="text-xs text-[var(--ext-text)] cursor-pointer flex-1">
                Auto enable Paint the Burp when this preset is selected
              </label>
              <Switch
                id="auto-enable-paint-burp"
                checked={autoEnablePaintBurp}
                onCheckedChange={setAutoEnablePaintBurp}
              />
            </div>

            {error && (
              <p className="text-[10px] text-[var(--ext-red)] animate-in fade-in slide-in-from-top-1">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2 text-xs border border-[var(--ext-border)] text-[var(--ext-text-muted)] rounded-lg hover:bg-[var(--ext-bg-tertiary)] hover:text-[var(--ext-text)] transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-[var(--ext-accent)] text-black rounded-lg hover:bg-[var(--ext-accent-light)] transition-all duration-200 font-medium"
              >
                <Save className="w-3.5 h-3.5" />
                {initialData ? 'Update Preset' : 'Save Preset'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
