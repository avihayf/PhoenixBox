/**
 * Accent Color System
 * Supports both named presets and custom hue values (0-360).
 * Generates all required CSS variables from a single hue number.
 */

export const ACCENT_PRESETS = [
  { id: 'cyan',   hue: 187, hex: '#00D9FF', label: 'Cyan' },
  { id: 'green',  hue: 142, hex: '#22C55E', label: 'Green' },
  { id: 'purple', hue: 271, hex: '#A855F7', label: 'Purple' },
  { id: 'pink',   hue: 330, hex: '#EC4899', label: 'Pink' },
  { id: 'red',    hue: 0,   hex: '#EF4444', label: 'Red' },
  { id: 'orange', hue: 25,  hex: '#F97316', label: 'Orange' },
  { id: 'yellow', hue: 48,  hex: '#EAB308', label: 'Yellow' },
  { id: 'indigo', hue: 235, hex: '#6366F1', label: 'Indigo' },
] as const;

export type AccentPresetId = typeof ACCENT_PRESETS[number]['id'];

export type AccentValue =
  | { type: 'preset'; id: AccentPresetId }
  | { type: 'custom'; hue: number };

export function accentToHue(accent: AccentValue): number {
  if (accent.type === 'custom') return accent.hue;
  const preset = ACCENT_PRESETS.find(p => p.id === accent.id);
  return preset?.hue ?? 187;
}

export function hueToHex(hue: number, saturation = 80, lightness = 55): string {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Apply accent CSS variables to the document root from a hue value.
 * Works for both dark and light mode.
 */
export function applyCustomHue(hue: number, isDark: boolean): void {
  const root = document.documentElement;
  const h = ((Math.round(hue) % 360) + 360) % 360;

  if (isDark) {
    root.style.setProperty('--ext-accent', `hsl(${h}, 85%, 60%)`);
    root.style.setProperty('--ext-accent-dark', `hsl(${h}, 80%, 45%)`);
    root.style.setProperty('--ext-accent-light', `hsl(${h}, 90%, 72%)`);
    root.style.setProperty('--ext-accent-bg', `hsla(${h}, 80%, 55%, 0.1)`);
    root.style.setProperty('--ext-glow-accent', `hsla(${h}, 85%, 55%, 0.5)`);
  } else {
    root.style.setProperty('--ext-accent', `hsl(${h}, 70%, 40%)`);
    root.style.setProperty('--ext-accent-dark', `hsl(${h}, 75%, 30%)`);
    root.style.setProperty('--ext-accent-light', `hsl(${h}, 65%, 50%)`);
    root.style.setProperty('--ext-accent-bg', `hsla(${h}, 70%, 45%, 0.08)`);
    root.style.setProperty('--ext-glow-accent', `hsla(${h}, 70%, 40%, 0.3)`);
  }
}

export function clearCustomHue(): void {
  const root = document.documentElement;
  root.style.removeProperty('--ext-accent');
  root.style.removeProperty('--ext-accent-dark');
  root.style.removeProperty('--ext-accent-light');
  root.style.removeProperty('--ext-accent-bg');
  root.style.removeProperty('--ext-glow-accent');
}

export function serializeAccent(accent: AccentValue): string {
  if (accent.type === 'preset') return accent.id;
  return `hue:${accent.hue}`;
}

export function deserializeAccent(raw: string | null): AccentValue {
  if (!raw) return { type: 'preset', id: 'cyan' };
  if (raw.startsWith('hue:')) {
    const hue = Math.max(0, Math.min(360, Number(raw.slice(4)) || 0));
    return { type: 'custom', hue };
  }
  const preset = ACCENT_PRESETS.find(p => p.id === raw);
  if (preset) return { type: 'preset', id: preset.id };
  return { type: 'preset', id: 'cyan' };
}
