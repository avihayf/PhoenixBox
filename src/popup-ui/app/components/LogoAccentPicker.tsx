import { useCallback, useRef, useState } from 'react';
import { hueToHex, type LogoAccentValue } from '../../lib/accentColors';

interface LogoAccentPickerProps {
  value: LogoAccentValue;
  /** Current theme accent hue — used to seed the slider when unlinking. */
  themeHue: number;
  /** Current theme mode. White is only offered on dark, black only on light (each is invisible in the other). */
  isDark?: boolean;
  onChange: (value: LogoAccentValue) => void;
}

/**
 * Controls the color of the "Box" half of the PhoenixBox wordmark.
 * - Linked  : "Box" follows the theme accent (the hue bar). Controls hidden.
 * - Unlinked: a single track — black → rainbow → white — gives "Box" its own
 *   fixed color. Black and white are the two ends of the same scale (no
 *   separate swatch). The end that would be invisible in the current mode
 *   (white on light, black on dark) is disabled. ("Phoenix" always follows the
 *   hue bar via --ext-accent.)
 */
export function LogoAccentPicker({ value, themeHue, isDark = true, onChange }: LogoAccentPickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // The track has three zones: a black end, the rainbow hue span, and a white end.
  const BLACK_MAX = 0.085;
  const WHITE_MIN = 0.915;
  const HUE_SPAN = WHITE_MIN - BLACK_MAX;

  // White reads only on dark, black only on light — disable the invisible end.
  const whiteAllowed = isDark;
  const blackAllowed = !isDark;

  const isWhite = !value.linked && 'white' in value && value.white === true;
  const isBlack = !value.linked && 'black' in value && value.black === true;
  const currentHue = !value.linked && 'hue' in value ? value.hue : themeHue;
  const clampHue = (h: number) => Math.max(0, Math.min(359, h));

  const valueFromPointer = useCallback((clientX: number): LogoAccentValue => {
    const track = trackRef.current;
    if (!track) return { linked: false, hue: currentHue };
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // A disabled end falls back to the nearest allowed hue (0 or 359).
    if (ratio <= BLACK_MAX) return blackAllowed ? { linked: false, black: true } : { linked: false, hue: 0 };
    if (ratio >= WHITE_MIN) return whiteAllowed ? { linked: false, white: true } : { linked: false, hue: 359 };
    return { linked: false, hue: clampHue(Math.round(((ratio - BLACK_MAX) / HUE_SPAN) * 359)) };
  }, [currentHue, blackAllowed, whiteAllowed]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (value.linked) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(valueFromPointer(e.clientX));
  }, [value.linked, valueFromPointer, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || value.linked) return;
    onChange(valueFromPointer(e.clientX));
  }, [dragging, value.linked, valueFromPointer, onChange]);

  const handlePointerUp = useCallback(() => setDragging(false), []);

  // Keyboard model: a single linear position across the whole track.
  // 0 = black, 1..360 = hue (0..359), 361 = white. Disabled ends are clamped out.
  const minPos = blackAllowed ? 0 : 1;
  const maxPos = whiteAllowed ? 361 : 360;
  const currentPos = isBlack ? 0 : isWhite ? 361 : currentHue + 1;
  const posToValue = (pos: number): LogoAccentValue => {
    const p = Math.max(minPos, Math.min(maxPos, Math.round(pos)));
    if (p === 0) return { linked: false, black: true };
    if (p === 361) return { linked: false, white: true };
    return { linked: false, hue: p - 1 };
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (value.linked) return;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -1;
    else if (e.key === 'PageUp') delta = 15;
    else if (e.key === 'PageDown') delta = -15;
    else if (e.key === 'Home') { onChange(posToValue(minPos)); e.preventDefault(); return; }
    else if (e.key === 'End') { onChange(posToValue(maxPos)); e.preventDefault(); return; }
    else return;

    e.preventDefault();
    onChange(posToValue(currentPos + delta));
  }, [value.linked, currentPos, minPos, maxPos, onChange]);

  const valueText = isBlack ? 'Black' : isWhite ? 'White' : `Hue ${currentHue}`;

  const toggleLink = () => {
    onChange(value.linked ? { linked: false, hue: themeHue } : { linked: true });
  };

  const thumbLeft = isBlack
    ? `${(BLACK_MAX / 2) * 100}%`
    : isWhite
      ? `${(WHITE_MIN + (1 - WHITE_MIN) / 2) * 100}%`
      : `${(BLACK_MAX + (currentHue / 359) * HUE_SPAN) * 100}%`;
  const thumbColor = isBlack ? '#000000' : isWhite ? '#ffffff' : hueToHex(currentHue);
  const thumbBorder = isWhite ? 'var(--ext-border)' : '#ffffff';

  return (
    <div className="flex flex-col gap-2 w-full pt-2.5 mt-2.5 border-t border-[var(--ext-border)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ext-text-muted)] font-semibold">
          Logo
          <span className="ml-1 font-data text-[var(--ext-logo-accent)]">Box</span>
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
          "Box" follows the theme accent. Unlink to give it its own color.
        </p>
      ) : (
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Logo Box color"
          aria-valuemin={minPos}
          aria-valuemax={maxPos}
          aria-valuenow={currentPos}
          aria-valuetext={valueText}
          className="relative h-3 w-full rounded-full cursor-crosshair select-none touch-none focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-[var(--ext-bg)]"
          style={{
            background: 'linear-gradient(to right, #000 0%, #000 7%, hsl(0,85%,60%) 10%, hsl(45,85%,60%), hsl(90,85%,60%), hsl(140,85%,60%), hsl(190,85%,60%), hsl(240,85%,60%), hsl(290,85%,60%), hsl(340,85%,60%), hsl(359,85%,60%) 90%, #fff 93%, #fff 100%)',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          {/* Grey out whichever end can't be used in the current mode */}
          {!blackAllowed && (
            <div
              className="absolute inset-y-0 left-0 rounded-l-full pointer-events-none"
              style={{ width: `${BLACK_MAX * 100}%`, background: 'var(--ext-bg-secondary)', opacity: 0.6 }}
              title="Black is only available in light mode"
            />
          )}
          {!whiteAllowed && (
            <div
              className="absolute inset-y-0 right-0 rounded-r-full pointer-events-none"
              style={{ width: `${(1 - WHITE_MIN) * 100}%`, background: 'var(--ext-bg-secondary)', opacity: 0.6 }}
              title="White is only available in dark mode"
            />
          )}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 shadow-md pointer-events-none"
            style={{
              left: thumbLeft,
              backgroundColor: thumbColor,
              borderColor: thumbBorder,
              boxShadow: dragging ? `0 0 8px rgba(255,255,255,0.4)` : `0 1px 3px rgba(0,0,0,0.4)`,
            }}
          />
        </div>
      )}
    </div>
  );
}
