/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

async function fetchIconOverrides() {
  try {
    const stored = await browser.storage.local.get({ containerDisplayIconOverrides: {} });
    return stored.containerDisplayIconOverrides && typeof stored.containerDisplayIconOverrides === "object"
      ? stored.containerDisplayIconOverrides
      : {};
  } catch {
    return {};
  }
}

function getSecurityProfileIcon(identity) {
  const csid = identity?.cookieStoreId || "";
  const prefix = "firefox-container-";
  if (csid.startsWith(prefix)) {
    const idNum = Number(csid.slice(prefix.length));
    if (idNum === 1) return "skull";
    if (idNum === 2) return "user-x";
    if (idNum === 3) return "user-cog";
    if (idNum === 4) return "user-minus";
  }
  const lower = (identity?.name || "").toLowerCase();
  if (lower === "attacker") return "skull";
  if (lower === "victim") return "user-x";
  if (lower === "admin") return "user-cog";
  if (lower === "member") return "user-minus";
  return null;
}

function resolveDisplayIcon(identity, overrides) {
  const override = overrides?.[identity.cookieStoreId];
  return override || getSecurityProfileIcon(identity) || identity.icon;
}

function createDefaultRow() {
  const tr = document.createElement("tr");
  tr.classList.add("menu-item", "hover-highlight");

  const td = document.createElement("td");
  const iconDiv = document.createElement("div");
  iconDiv.className = "menu-icon";

  const contextIcon = document.createElement("div");
  contextIcon.className = "usercontext-icon";
  contextIcon.dataset.identityIcon = "fingerprint";
  contextIcon.dataset.identityColor = "grey";
  iconDiv.appendChild(contextIcon);
  td.appendChild(iconDiv);

  const menuText = document.createElement("span");
  menuText.className = "menu-text";
  menuText.textContent = browser.i18n.getMessage("default");
  td.appendChild(menuText);

  tr.appendChild(td);
  Utils.addEnterHandler(tr, async () => {
    const currentTab = await Utils.currentTab();
    if (!currentTab) {
      window.close();
      return;
    }
    const payload = PhoenixBoxPageActionHelpers.getDefaultAssignmentPayload(currentTab);
    await Utils.setOrRemoveAssignment(
      payload.tabId,
      payload.url,
      payload.userContextId,
      payload.value
    );
    window.close();
  });

  return tr;
}

function createIdentityRow(identity, iconOverrides) {
  const displayIcon = resolveDisplayIcon(identity, iconOverrides);
  const tr = document.createElement("tr");
  tr.classList.add("menu-item", "hover-highlight");
  tr.setAttribute("data-cookie-store-id", identity.cookieStoreId);

  const td = document.createElement("td");
  const iconDiv = document.createElement("div");
  iconDiv.className = "menu-icon";

  const contextIcon = document.createElement("div");
  contextIcon.className = "usercontext-icon";
  contextIcon.dataset.identityIcon = displayIcon;
  contextIcon.dataset.identityColor = identity.color;
  iconDiv.appendChild(contextIcon);
  td.appendChild(iconDiv);

  const menuText = document.createElement("span");
  menuText.className = "menu-text";
  menuText.textContent = identity.name;
  td.appendChild(menuText);

  tr.appendChild(td);
  Utils.addEnterHandler(tr, async () => {
    await Utils.alwaysOpenInContainer(identity);
    window.close();
  });

  return tr;
}

async function init() {
  const fragment = document.createDocumentFragment();
  const identities = await browser.contextualIdentities.query({});
  const iconOverrides = await fetchIconOverrides();
  const entries = PhoenixBoxPageActionHelpers.buildAlwaysOpenEntries(identities);

  for (const entry of entries) {
    if (entry.type === "default") {
      fragment.appendChild(createDefaultRow());
      continue;
    }

    // Flag image is only useful when VPN proxy data provides a country code.
    // The identity object doesn't carry VPN location info, so we skip
    // appending a broken <img> here. MozillaVPN.handleContainerList()
    // handles flag rendering when VPN data is available.
    fragment.appendChild(createIdentityRow(entry.identity, iconOverrides));
  }

  const list = document.querySelector("#picker-identities-list");
  list.replaceChildren(fragment);

  MozillaVPN.handleContainerList(identities);

  // Set the theme — applyTheme() sets both data-theme attribute and .dark class
  await Utils.applyTheme();
  const isDark = document.documentElement.classList.contains("dark");

  // Apply accent color from main popup UI (mirrors accentColors.ts formula)
  const ACCENT_HUES = { cyan: 187, green: 142, purple: 271, pink: 330, red: 0, orange: 25, yellow: 48, indigo: 235 };
  const rawAccent = localStorage.getItem("accentColor");
  let accentHue = 187;
  if (rawAccent && rawAccent.startsWith("hue:")) {
    accentHue = Math.max(0, Math.min(360, Number(rawAccent.slice(4)) || 0));
  } else if (rawAccent && ACCENT_HUES[rawAccent] !== undefined) {
    accentHue = ACCENT_HUES[rawAccent];
  }
  const root = document.documentElement;
  if (isDark) {
    root.style.setProperty("--ext-accent",       `hsl(${accentHue}, 85%, 60%)`);
    root.style.setProperty("--ext-accent-dark",   `hsl(${accentHue}, 80%, 45%)`);
    root.style.setProperty("--ext-accent-light",  `hsl(${accentHue}, 90%, 72%)`);
    root.style.setProperty("--ext-accent-bg",     `hsla(${accentHue}, 80%, 55%, 0.1)`);
    root.style.setProperty("--ext-glow-accent",   `hsla(${accentHue}, 85%, 55%, 0.5)`);
  } else {
    root.style.setProperty("--ext-accent",       `hsl(${accentHue}, 70%, 40%)`);
    root.style.setProperty("--ext-accent-dark",   `hsl(${accentHue}, 75%, 30%)`);
    root.style.setProperty("--ext-accent-light",  `hsl(${accentHue}, 65%, 50%)`);
    root.style.setProperty("--ext-accent-bg",     `hsla(${accentHue}, 70%, 45%, 0.08)`);
    root.style.setProperty("--ext-glow-accent",   `hsla(${accentHue}, 70%, 40%, 0.3)`);
  }
  root.style.setProperty("--icon-hue-rotate",   `${accentHue - 27}deg`);
}

async function initExtractEndpoints() {
  const btn = document.getElementById("extract-endpoints-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.textContent = "Scanning…";
    btn.disabled = true;
    try {
      const lastWindow = await browser.windows.getLastFocused({ populate: false });
      const tabs = lastWindow
        ? await browser.tabs.query({ active: true, windowId: lastWindow.id })
        : [];
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.id) {
        btn.textContent = "No active tab";
        btn.disabled = false;
        return;
      }
      await browser.runtime.sendMessage({
        method: "extractEndpoints",
        tabId: currentTab.id,
        pageUrl: currentTab.url,
      });
    } catch (e) {
      btn.textContent = "Error — try again";
      btn.disabled = false;
      return;
    }
    window.close();
  });
}

init();
initExtractEndpoints();
