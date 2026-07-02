import { useCallback, useRef, useState } from 'react';
import { hueToHex, type LogoAccentValue } from '../../lib/accentColors';

interface LogoAccentPickerProps {
  value: LogoAccentValue;
  /** Current theme accent hue — shown as the swatch when linked. */
  themeHue: number;
  onChange: (value: LogoAccentValue) => void;
}

/**
 * Controls the color of the P, i, B letters in the PhoenixBox wordmark.
 * - Linked: the letters follow the theme accent (the hue bar). Slider hidden.
 * - Unlinked: a dedicated hue slider gives the letters their own fixed color.
 */
export function LogoAccentPicker({ value, themeHue, onChange }: LogoAccentPickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const currentHue = value.linked ? themeHue : value.hue;
  const clampHue = (h: number) => Math.max(0, Math.min(359, h));

  const hueFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return currentHue;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampHue(Math.round(ratio * 359));
  }, [currentHue]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (value.linked) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onChange({ linked: false, hue: hueFromPointer(e.clientX) });
  }, [value.linked, hueFromPointer, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || value.linked) return;
    onChange({ linked: false, hue: hueFromPointer(e.clientX) });
  }, [dragging, value.linked, hueFromPointer, onChange]);

  const handlePointerUp = useCallback(() => setDragging(false), []);

  const toggleLink = () => {
    // Unlinking seeds the logo hue from the current theme hue so it starts where it looked.
    onChange(value.linked ? { linked: false, hue: themeHue } : { linked: true });
  };

  const thumbLeft = `${(currentHue / 359) * 100}%`;
  const thumbColor = hueToHex(currentHue);

  return (
    <div className="flex flex-col gap-2 w-full pt-2.5 mt-2.5 border-t border-[var(--ext-border)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ext-text-muted)] font-semibold">
          Logo Highlight
          <span className="ml-1 font-data text-[var(--ext-logo-accent)]">P i B</span>
        </span>
        <button
          type="button"
          onClick={toggleLink}
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
          style={{
            borderColor: value.linked ? 'var(--ext-accent)' : 'var(--ext-border)',
            color: value.linked ? 'var(--ext-accent)' : 'var(--ext-text-muted)',
            background: value.linked ? 'var(--ext-accent-bg)' : 'transparent',
          }}
          aria-pressed={value.linked}
          title={value.linked ? 'Following the theme accent — tap to set a separate color' : 'Using its own color — tap to follow the theme accent'}
        >
          {value.linked ? '🔗 Linked' : 'Unlinked'}
        </button>
      </div>

      {value.linked ? (
        <p className="text-[10px] leading-snug text-[var(--ext-text-muted)]">
          Following the theme accent. Unlink to give the letters their own color.
        </p>
      ) : (
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Logo highlight hue"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={currentHue}
          className="relative h-3 rounded-full cursor-crosshair select-none touch-none focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-[var(--ext-bg)]"
          style={{
            background: 'linear-gradient(to right, hsl(0,85%,60%), hsl(60,85%,60%), hsl(120,85%,60%), hsl(180,85%,60%), hsl(240,85%,60%), hsl(300,85%,60%), hsl(359,85%,60%))',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{
              left: thumbLeft,
              backgroundColor: thumbColor,
              boxShadow: dragging ? `0 0 8px ${thumbColor}88` : `0 1px 3px rgba(0,0,0,0.4)`,
            }}
          />
        </div>
      )}
    </div>
  );
}
