/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Apply accent color + dark/light theme from localStorage (mirrors accentColors.ts formula)
{
  const ACCENT_HUES = { cyan: 187, green: 142, purple: 271, pink: 330, red: 0, orange: 25, yellow: 48, indigo: 235 };
  const rawAccent = localStorage.getItem("accentColor");
  let accentHue = 187;
  if (rawAccent && rawAccent.startsWith("hue:")) {
    accentHue = Math.max(0, Math.min(360, Number(rawAccent.slice(4)) || 0));
  } else if (rawAccent && ACCENT_HUES[rawAccent] !== undefined) {
    accentHue = ACCENT_HUES[rawAccent];
  }
  const theme = localStorage.getItem("theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const isDark = theme === "dark";
  const root = document.documentElement;
  if (isDark) {
    root.classList.add("dark");
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
}

const NUMBER_OF_KEYBOARD_SHORTCUTS = 10;
const LOG_DEBUG = false;

async function setUpCheckBoxes() {
  for (const el of document.querySelectorAll("[data-permission-id]")) {
    const permissionId = el.dataset.permissionId;
    const permissionEnabled = await browser.permissions.contains({ permissions: [permissionId] });
    el.checked = !!permissionEnabled;
  }
}

function disablePermissionsInputs() {
  document.querySelectorAll("[data-permission-id]").forEach(el => {
    el.disabled = true;
  });
}

function enablePermissionsInputs() {
  document.querySelectorAll("[data-permission-id]").forEach(el => {
    el.disabled = false;
  });
}

for (const el of document.querySelectorAll("[data-permission-id]")) {
  const permissionId = el.dataset.permissionId;
  el.addEventListener("change", async() => {
    if (el.checked) {
      disablePermissionsInputs();
      const granted = await browser.permissions.request({ permissions: [permissionId] });
      if (!granted) {
        el.checked = false;
        enablePermissionsInputs();
      }
      return;
    }
    await browser.permissions.remove({ permissions: [permissionId] });
  });
}

async function maybeShowPermissionsWarningIcon() {
  const bothMozillaVpnPermissionsEnabled = await MozillaVPN.bothPermissionsEnabled();
  const permissionsWarningEl = document.querySelector(".warning-icon");
  if (permissionsWarningEl) {
    permissionsWarningEl.classList.toggle("show-warning", !bothMozillaVpnPermissionsEnabled);
  }
}

async function enableDisableSync() {
  const checkbox = document.querySelector("#syncCheck");
  await browser.storage.local.set({syncEnabled: !!checkbox.checked});
  try {
    await browser.runtime.sendMessage({ method: "resetSync" });
  } catch (e) {
    if (LOG_DEBUG) { console.error("Failed to send resetSync message:", e); }
  }
}

async function enableDisableReplaceTab() {
  const checkbox = document.querySelector("#replaceTabCheck");
  await browser.storage.local.set({replaceTabEnabled: !!checkbox.checked});
}

async function changeTheme(event) {
  const theme = event.currentTarget;
  await browser.storage.local.set({currentTheme: theme.value});
  await browser.storage.local.set({currentThemeId: theme.selectedIndex});
}

async function setupOptions() {
  const { syncEnabled } = await browser.storage.local.get("syncEnabled");
  const { replaceTabEnabled } = await browser.storage.local.get("replaceTabEnabled");
  const { currentThemeId } = await browser.storage.local.get("currentThemeId");

  document.querySelector("#syncCheck").checked = !!syncEnabled;
  document.querySelector("#replaceTabCheck").checked = !!replaceTabEnabled;
  document.querySelector("#changeTheme").selectedIndex = currentThemeId;
  setupContainerShortcutSelects();
}

async function setupContainerShortcutSelects () {
  const keyboardShortcut = await browser.runtime.sendMessage({method: "getShortcuts"});
  const identities = await browser.contextualIdentities.query({});
  const fragment = document.createDocumentFragment();
  const noneOption = document.createElement("option");
  noneOption.value = "none";
  noneOption.id = "none";
  noneOption.textContent = "None";
  fragment.append(noneOption);

  for (const identity of identities) {
    const option = document.createElement("option");
    option.value = identity.cookieStoreId;
    option.id = identity.cookieStoreId;
    option.textContent = identity.name;
    fragment.append(option);
  }

  for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
    const shortcutKey = "open_container_"+i;
    const shortcutSelect = document.getElementById(shortcutKey);
    shortcutSelect.appendChild(fragment.cloneNode(true));
    if (keyboardShortcut && keyboardShortcut[shortcutKey]) {
      const cookieStoreId = keyboardShortcut[shortcutKey];
      shortcutSelect.querySelector("#" + cookieStoreId).selected = true;
    }
  }
}

function storeShortcutChoice (event) {
  browser.runtime.sendMessage({
    method: "setShortcut",
    shortcut: event.target.id,
    cookieStoreId: event.target.value
  });
}

async function resetOnboarding() {
  await browser.storage.local.set({"onboarding-stage": 0});
}

async function resetPermissionsUi() {
  await maybeShowPermissionsWarningIcon();
  await setUpCheckBoxes();
  enablePermissionsInputs();
}

browser.permissions.onAdded.addListener(resetPermissionsUi);
browser.permissions.onRemoved.addListener(resetPermissionsUi);

document.addEventListener("DOMContentLoaded", setupOptions);
document.querySelector("#syncCheck").addEventListener( "change", enableDisableSync);
document.querySelector("#replaceTabCheck").addEventListener( "change", enableDisableReplaceTab);
document.querySelector("#changeTheme").addEventListener( "change", changeTheme);

maybeShowPermissionsWarningIcon();
for (let i=0; i < NUMBER_OF_KEYBOARD_SHORTCUTS; i++) {
  document.querySelector("#open_container_"+i)
    .addEventListener("change", storeShortcutChoice);
}

document.querySelectorAll("[data-btn-id]").forEach(btn => {
  btn.addEventListener("click", () => {
    switch (btn.dataset.btnId) {
    case "reset-onboarding":
      resetOnboarding();
      break;
    case "moz-vpn-learn-more":
      browser.tabs.create({
        url: MozillaVPN.attachUtmParameters("https://support.mozilla.org/kb/protect-your-container-tabs-mozilla-vpn", "options-learn-more")
      });
      break;
    }
  });
});
resetPermissionsUi();
