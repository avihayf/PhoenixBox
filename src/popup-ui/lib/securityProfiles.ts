// Container icon and security-profile rules, as the popup needs them.
//
// The background page owns applying them (see planProfileNormalization in
// src/js/shared/reviewHelpers.js); the popup only reads. Keep the values in
// sync with that file — test/security-profiles.test.mjs pins them together.

/** Icons Firefox's contextualIdentities API accepts. */
export const FIREFOX_CONTAINER_ICONS = [
  "fingerprint", "briefcase", "dollar", "cart", "circle", "gift",
  "vacation", "food", "fruit", "pet", "tree", "chill", "fence",
] as const;

export const SECURITY_PROFILES: Record<number, { name: string; color: string; icon: string }> = {
  1: { name: "Attacker", color: "red", icon: "skull" },
  2: { name: "Victim", color: "orange", icon: "user-x" },
  3: { name: "Admin", color: "green", icon: "user-cog" },
  4: { name: "Member", color: "yellow", icon: "user-minus" },
};

/** The icon to give Firefox for a chosen icon; custom icons become fingerprint. */
export function firefoxIconFor(icon: string): string {
  return (FIREFOX_CONTAINER_ICONS as readonly string[]).includes(icon) ? icon : "fingerprint";
}

/** The security icon a default container shows when it has no override. */
export function defaultSecurityIcon(cookieStoreId: string): string | null {
  const num = Number(String(cookieStoreId || "").replace("firefox-container-", ""));
  return SECURITY_PROFILES[num]?.icon ?? null;
}
