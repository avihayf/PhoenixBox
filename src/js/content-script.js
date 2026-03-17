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
    const handler = () => {
      resolve();
      element.removeEventListener("transitionend", handler);
    };
    element.addEventListener("transitionend", handler);
    window.requestAnimationFrame(() => {
      element.style[property] = value;
    });
  });
}

async function addMessage(message) {
  const divElement = document.createElement("div");
  divElement.classList.add("container-notification");
  // Ideally we would use https://bugzilla.mozilla.org/show_bug.cgi?id=1340930 when this is available
  divElement.innerText = message.text;

  const imageElement = document.createElement("img");
  const imagePath = browser.runtime.getURL("/img/PhoenixLogo.png");
  const response = await fetch(imagePath);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  imageElement.src = objectUrl;
  imageElement.width = imageElement.height = 24;
  divElement.prepend(imageElement);

  document.body.appendChild(divElement);

  await delayAnimation(100);
  await doAnimation(divElement, "transform", "translateY(0)");
  await delayAnimation(3000);
  await doAnimation(divElement, "transform", "translateY(-100%)");

  divElement.remove();
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
    const re = /(?<=["'`])\/[a-zA-Z0-9_?&=\/\-#.]*(?=["'`])/g;
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
