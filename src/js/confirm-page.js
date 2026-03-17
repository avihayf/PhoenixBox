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

async function load() {
  const searchParams = new URL(window.location).searchParams;
  const redirectUrl = searchParams.get("url");

  // Validate the redirect URL to prevent open redirects and local file access
  if (!isValidRedirectUrl(redirectUrl)) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error";
    errorDiv.textContent = "Invalid or restricted URL.";
    document.body.replaceChildren(errorDiv);
    return;
  }

  const cookieStoreId = searchParams.get("cookieStoreId");
  const currentCookieStoreId = searchParams.get("currentCookieStoreId");
  const redirectUrlElement = document.getElementById("redirect-url");
  redirectUrlElement.textContent = redirectUrl;
  appendFavicon(redirectUrl, redirectUrlElement);

  // Option for staying on the previous container
  document.getElementById("deny").addEventListener("click", (e) => {
    e.preventDefault();
    denySubmit(redirectUrl, currentCookieStoreId);
  });

  // Option for going to the default container (no container)
  document.getElementById("deny-no-container").addEventListener("click", (e) => {
    e.preventDefault();
    denySubmit(redirectUrl, currentCookieStoreId);
  });

  const container = await browser.contextualIdentities.get(cookieStoreId);
  const currentContainer = currentCookieStoreId ? await browser.contextualIdentities.get(currentCookieStoreId) : null;
  const currentContainerName = currentContainer ? setDenyButton(currentContainer.name) : setDenyButton("");

  document.querySelectorAll("[data-message-id]").forEach(el => {
    const elementData = el.dataset;
    const containerName = elementData.messageArg === "container-name" ? container.name : currentContainerName;
    el.textContent = browser.i18n.getMessage(elementData.messageId, containerName);
  });

  // Option for going to newly selected container
  document.getElementById("confirm").addEventListener("click", (e) => {
    e.preventDefault();
    confirmSubmit(redirectUrl, cookieStoreId);
  });
}

function setDenyButton(currentContainerName) {
  const buttonDeny = document.getElementById("deny");
  const buttonDenyNoContainer = document.getElementById("deny-no-container");

  if (currentContainerName) {
    buttonDenyNoContainer.style.display = "none";
    return currentContainerName;
  }
  buttonDeny.style.display = "none";
  return;
}

function appendFavicon(pageUrl, redirectUrlElement) {
  const origin = new URL(pageUrl).origin;
  const favIconElement = Utils.createFavIconElement(`${origin}/favicon.ico`);

  redirectUrlElement.prepend(favIconElement);
}

function confirmSubmit(redirectUrl, cookieStoreId) {
  const neverAsk = document.getElementById("never-ask").checked;
  // Sending neverAsk message to background to store for next time we see this process
  if (neverAsk) {
    browser.runtime.sendMessage({
      method: "neverAsk",
      neverAsk: true,
      cookieStoreId: cookieStoreId,
      pageUrl: redirectUrl
    });
  }
  openInContainer(redirectUrl, cookieStoreId);
}

/**
 * @returns {Promise<Tab>}
 */
async function getCurrentTab() {
  const tabs = await browser.tabs.query({
    active: true,
    windowId: browser.windows.WINDOW_ID_CURRENT
  });
  return tabs[0];
}

async function denySubmit(redirectUrl, currentCookieStoreId) {
  const tab = await getCurrentTab();
  const currentContainer = currentCookieStoreId ? await browser.contextualIdentities.get(currentCookieStoreId) : null;
  const neverAsk = document.getElementById("never-ask").checked;

  if (neverAsk) {
    await browser.runtime.sendMessage({
      method: "neverAsk",
      neverAsk: true,
      cookieStoreId: currentCookieStoreId,
      pageUrl: redirectUrl,
      defaultContainer: !currentContainer
    });
  }

  await browser.runtime.sendMessage({
    method: "exemptContainerAssignment",
    tabId: tab.id,
    pageUrl: redirectUrl
  });

  if (isValidRedirectUrl(redirectUrl)) {
    document.location.replace(redirectUrl);
  }
}

function isValidRedirectUrl(url) {
  if (!url) return false;
  try {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol.toLowerCase();
    // Only allow http and https for redirects
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

load();

async function openInContainer(redirectUrl, cookieStoreId) {
  if (!isValidRedirectUrl(redirectUrl)) {
    return;
  }
  const tab = await getCurrentTab();
  const reopenedTab = await browser.tabs.create({
    index: tab.index + 1,
    cookieStoreId,
    url: redirectUrl
  });
  if (tab.groupId >= 0 && typeof browser.tabs.group === "function") {
    // If the original tab was in a tab group, make sure that the reopened tab
    // stays in the same tab group.
    try {
      await browser.tabs.group({ groupId: tab.groupId, tabIds: reopenedTab.id });
    } catch {
      // ignore
    }
  }
  await browser.tabs.remove(tab.id);
}
