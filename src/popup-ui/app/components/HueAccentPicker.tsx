import { useCallback, useRef, useState } from 'react';
import { ACCENT_PRESETS, type AccentValue, accentToHue, hueToHex } from '../../lib/accentColors';

interface HueAccentPickerProps {
  value: AccentValue;
  onChange: (value: AccentValue) => void;
}

export function HueAccentPicker({ value, onChange }: HueAccentPickerProps) {
  const currentHue = accentToHue(value);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const clampHue = (h: number) => Math.max(0, Math.min(359, h));

  const hueFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return currentHue;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampHue(Math.round(ratio * 359));
  }, [currentHue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -1;
    else if (e.key === 'PageUp') delta = 15;
    else if (e.key === 'PageDown') delta = -15;
    else if (e.key === 'Home') { onChange({ type: 'custom', hue: 0 }); e.preventDefault(); return; }
    else if (e.key === 'End') { onChange({ type: 'custom', hue: 359 }); e.preventDefault(); return; }
    else return;

    e.preventDefault();
    onChange({ type: 'custom', hue: clampHue(currentHue + delta) });
  }, [currentHue, onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    const hue = hueFromPointer(e.clientX);
    onChange({ type: 'custom', hue });
  }, [hueFromPointer, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const hue = hueFromPointer(e.clientX);
    onChange({ type: 'custom', hue });
  }, [dragging, hueFromPointer, onChange]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const thumbLeft = `${(currentHue / 359) * 100}%`;
  const thumbColor = hueToHex(currentHue);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Preset dots */}
      <div className="flex gap-1.5 justify-center">
        {ACCENT_PRESETS.map((preset) => {
          const isActive = value.type === 'preset' && value.id === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onChange({ type: 'preset', id: preset.id })}
              className={`w-5 h-5 rounded-full transition-all hover:scale-110 ${
                isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-[var(--ext-bg)]' : ''
              }`}
              style={{ backgroundColor: preset.hex }}
              aria-label={preset.label}
              title={preset.label}
            />
          );
        })}
      </div>

      {/* Hue slider track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Accent color hue"
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
        onKeyDown={handleKeyDown}
      >
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none transition-shadow"
          style={{
            left: thumbLeft,
            backgroundColor: thumbColor,
            boxShadow: dragging ? `0 0 8px ${thumbColor}88` : `0 1px 3px rgba(0,0,0,0.4)`,
          }}
        />
      </div>
    </div>
  );
}
