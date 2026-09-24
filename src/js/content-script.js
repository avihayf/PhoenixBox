/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

async function delayAnimation(delay = 350) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

async function doAnimation(element, property, value) {
  return new Promise((resolve) => {
    // transitionend never fires in a background tab (no animation frames) or
    // when transitions are disabled, which left the toast stuck; don't wait
    // on it for longer than the transition itself takes.
    const timer = setTimeout(done, 1000);
    function done() {
      clearTimeout(timer);
      element.removeEventListener("transitionend", done);
      resolve();
    }
    element.addEventListener("transitionend", done);
    window.requestAnimationFrame(() => {
      element.style[property] = value;
    });
  });
}

// The toast is built inside a closed shadow root and styled through CSSOM
// rather than a stylesheet. content.css used to be injected into every page,
// so any site could detect PhoenixBox by probing that class's computed style;
// and a page's style-src CSP can block an injected <style>, while element.style
// set from script is not affected.
function styled(element, styles) {
  Object.assign(element.style, styles);
  return element;
}

async function addMessage(message) {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });

  const toast = styled(document.createElement("div"), {
    alignItems: "center",
    background: "#efefef",
    boxSizing: "border-box",
    color: "#003f07",
    display: "flex",
    font: "12px sans-serif",
    gap: "6px",
    insetBlockStart: "0",
    insetInlineStart: "0",
    inlineSize: "100vw",
    padding: "8px",
    position: "fixed",
    transform: "translateY(-100%)",
    transition: "transform 0.3s cubic-bezier(0.07, 0.95, 0, 1) 0.3s",
    zIndex: "2147483647",
  });
  toast.setAttribute("role", "status");

  const text = document.createElement("span");
  text.textContent = message.text;

  // Loaded as a blob so the page never sees the extension's internal URL.
  const image = styled(document.createElement("img"), { blockSize: "16px", inlineSize: "16px" });
  image.alt = "";
  let objectUrl = null;
  try {
    const response = await fetch(browser.runtime.getURL("/img/icon-48.png"));
    objectUrl = URL.createObjectURL(await response.blob());
    image.src = objectUrl;
    toast.append(image);
  } catch {
    // The text alone is fine.
  }
  toast.append(text);
  shadow.append(toast);
  document.documentElement.appendChild(host);

  try {
    await delayAnimation(100);
    await doAnimation(toast, "transform", "translateY(0)");
    await delayAnimation(3000);
    await doAnimation(toast, "transform", "translateY(-100%)");
  } finally {
    host.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  // Only accept messages from our own extension's background script.
  if (sender.id !== browser.runtime.id) return;

  if (message && typeof message.text === "string") {
    addMessage(message);
    return;
  }

  if (message && message.method === "scanEndpoints") {
    // Same regex as the endlets bookmarklet — path must be wrapped in quotes on both sides.
    // Backtick is safe in a regex literal (no special meaning).
    const re = /(?<=["'`])\/[a-zA-Z0-9_?&=/\-#.]*(?=["'`])/g;
    const found = new Set();
    const html = document.documentElement.outerHTML;
    for (const m of html.matchAll(re)) { found.add(m[0]); }
    for (const s of document.getElementsByTagName("script")) {
      if (!s.src && s.textContent) {
        for (const m of s.textContent.matchAll(re)) { found.add(m[0]); }
      }
    }
    const noAssets = /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|css|map)$/i;
    return Promise.resolve(
      Array.from(found).filter(p => p.length > 0 && !noAssets.test(p)).sort()
    );
  }
});
