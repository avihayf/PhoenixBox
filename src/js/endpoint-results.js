"use strict";

const STORAGE_KEY = "endpointScanResults";

// Sort modes: "alpha" = A→Z, "depth" = fewest segments first
let sortMode = "alpha";

function sortEndpoints(endpoints) {
  if (sortMode === "depth") {
    return [...endpoints].sort((a, b) => {
      const da = (a.match(/\//g) || []).length;
      const db = (b.match(/\//g) || []).length;
      return da !== db ? da - db : a.localeCompare(b);
    });
  }
  return [...endpoints].sort((a, b) => a.localeCompare(b));
}

function showToast() {
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(showToast).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast();
  });
}

function renderEndpoints(endpoints) {
  const list = document.getElementById("results-list");
  const empty = document.getElementById("empty-state");
  const count = document.getElementById("count");

  const filter = (document.getElementById("filter-input").value || "").toLowerCase();
  const filtered = filter ? endpoints.filter(e => e.toLowerCase().includes(filter)) : endpoints;
  const sorted = sortEndpoints(filtered);

  count.textContent = `${sorted.length} endpoint${sorted.length !== 1 ? "s" : ""}`;

  while (list.firstChild && list.firstChild !== empty) {
    list.removeChild(list.firstChild);
  }

  if (sorted.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const fragment = document.createDocumentFragment();
  for (const ep of sorted) {
    const row = document.createElement("div");
    row.className = "endpoint-row";

    const path = document.createElement("span");
    path.className = "endpoint-path";
    path.textContent = ep;
    row.appendChild(path);

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => copyText(ep));
    row.appendChild(copyBtn);

    fragment.appendChild(row);
  }
  list.prepend(fragment);
}

// Apply accent + theme synchronously before first paint (mirrors accentColors.ts formula)
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

async function init() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const data = stored[STORAGE_KEY];

  // Clear results from storage immediately after reading
  await browser.storage.local.remove(STORAGE_KEY);

  if (!data || !data.endpoints) {
    document.getElementById("count").textContent = "0 endpoints";
    return;
  }

  const { endpoints, pageUrl, scannedAt } = data;

  const urlEl = document.getElementById("page-url");
  urlEl.textContent = pageUrl || "";
  urlEl.title = pageUrl || "";

  if (scannedAt) {
    document.getElementById("scanned-at").textContent =
      `Scanned at ${new Date(scannedAt).toLocaleTimeString()}`;
  }

  renderEndpoints(endpoints);

  document.getElementById("filter-input").addEventListener("input", () => {
    renderEndpoints(endpoints);
  });

  document.getElementById("sort-btn").addEventListener("click", () => {
    const btn = document.getElementById("sort-btn");
    if (sortMode === "alpha") {
      sortMode = "depth";
      btn.textContent = "Depth";
      btn.classList.add("active");
    } else {
      sortMode = "alpha";
      btn.textContent = "A→Z";
      btn.classList.remove("active");
    }
    renderEndpoints(endpoints);
  });

  const COLOR_KEY = "endpointTextColor";
  const VALID_SWATCH_COLORS = new Set(["#00c8ff", "#3fb950", "#e6edf3", "#f0e040", "#ff7b3d"]);
  const savedColor = localStorage.getItem(COLOR_KEY);
  if (savedColor && VALID_SWATCH_COLORS.has(savedColor)) {
    document.documentElement.style.setProperty("--endpoint-color", savedColor);
    document.querySelectorAll(".swatch").forEach(s => {
      s.classList.toggle("active", s.dataset.color === savedColor);
    });
  }

  // Set swatch backgrounds via JS — inline HTML style gets overridden by Firefox UA stylesheet
  document.querySelectorAll(".swatch").forEach(s => {
    s.style.backgroundColor = s.dataset.color;
  });

  document.getElementById("color-swatches").addEventListener("click", (e) => {
    const swatch = e.target.closest(".swatch");
    if (!swatch) return;
    document.documentElement.style.setProperty("--endpoint-color", swatch.dataset.color);
    localStorage.setItem(COLOR_KEY, swatch.dataset.color);
    document.querySelectorAll(".swatch").forEach(s => s.classList.remove("active"));
    swatch.classList.add("active");
  });

  document.getElementById("copy-all-btn").addEventListener("click", () => {
    const currentSorted = sortEndpoints(
      (() => {
        const filter = (document.getElementById("filter-input").value || "").toLowerCase();
        return filter ? endpoints.filter(e => e.toLowerCase().includes(filter)) : endpoints;
      })()
    );
    copyText(currentSorted.join("\n"));
  });
}

init();
