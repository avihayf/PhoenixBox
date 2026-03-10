/**
 * Container Color Utility
 * Single source of truth for container color name to hex value mapping
 * Ensures consistent colors across all UI components
 */

export const CONTAINER_COLOR_MAP: Record<string, string> = {
  blue: "#4A90E2",
  turquoise: "#1ABC9C",
  green: "#2ECC71",
  yellow: "#F1C40F",
  orange: "#F97316",
  red: "#B91C1C",
  pink: "#E91E63",
  purple: "#9B59B6",
};

export interface ContainerColorOption {
  value: string;
  hex: string;
  label: string;
}

export const CONTAINER_COLORS: ContainerColorOption[] = [
  { value: 'blue', hex: '#4A90E2', label: 'Blue' },
  { value: 'turquoise', hex: '#1ABC9C', label: 'Turquoise' },
  { value: 'green', hex: '#2ECC71', label: 'Green' },
  { value: 'yellow', hex: '#F1C40F', label: 'Yellow' },
  { value: 'orange', hex: '#F97316', label: 'Orange' },
  { value: 'red', hex: '#B91C1C', label: 'Red' },
  { value: 'pink', hex: '#E91E63', label: 'Pink' },
  { value: 'purple', hex: '#9B59B6', label: 'Purple' },
];

/**
 * Converts a container color name to its hex value
 * @param colorName - Color name from Firefox API (e.g., "red", "blue", "turquoise")
 * @returns Hex color value (e.g., "#E74C3C") or blue as fallback
 */
export function getContainerColorHex(colorName: string | undefined | null): string {
  if (!colorName) return CONTAINER_COLOR_MAP.blue;
  return CONTAINER_COLOR_MAP[colorName.toLowerCase()] || CONTAINER_COLOR_MAP.blue;
}
