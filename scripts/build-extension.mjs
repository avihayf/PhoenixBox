import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const srcDir = path.join(repoRoot, "src");

function rmRF(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(from, to) {
  ensureDir(to);
  // fs.cpSync can occasionally throw ENOENT during chmod when files are
  // modified concurrently on some systems. Retry once to keep builds stable.
  try {
    fs.cpSync(from, to, { recursive: true });
  } catch (e) {
    if (e && e.code === "ENOENT") {
      fs.cpSync(from, to, { recursive: true });
      return;
    }
    throw e;
  }
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

// 1) Clean dist
rmRF(distDir);
ensureDir(distDir);

// 2) Build popup UI (Vite)
// Note: Vite `--outDir` is resolved relative to `root` (src/popup-ui),
// so we need to go back to repo root to place output in /dist/popup.
execSync("npx --yes vite build --config vite.config.mts --outDir ../../dist/popup --emptyOutDir", {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

// 3) Copy extension runtime files into dist
// - background page/scripts
copyDir(path.join(srcDir, "js"), path.join(distDir, "js"));
copyDir(path.join(srcDir, "css"), path.join(distDir, "css"));
copyDir(path.join(srcDir, "img"), path.join(distDir, "img"));
copyDir(path.join(srcDir, "fonts"), path.join(distDir, "fonts"));
copyDir(path.join(srcDir, "_locales"), path.join(distDir, "_locales"));

// - other html pages (options, pageAction, confirm)
copyFile(path.join(srcDir, "options.html"), path.join(distDir, "options.html"));
copyFile(path.join(srcDir, "pageActionPopup.html"), path.join(distDir, "pageActionPopup.html"));
copyFile(path.join(srcDir, "confirm-page.html"), path.join(distDir, "confirm-page.html"));
// confirm-page.js is already included via copyDir(src/js -> dist/js)

// 4) Copy and patch manifest.json into dist
const manifestSrc = path.join(srcDir, "manifest.json");
const manifestDist = path.join(distDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestSrc, "utf8"));

// Point popup to the new React UI
manifest.browser_action = manifest.browser_action || {};
manifest.browser_action.default_popup = "popup/index.html";

// Ensure resources are available from dist (web_accessible_resources paths are relative)
if (Array.isArray(manifest.web_accessible_resources)) {
  manifest.web_accessible_resources = manifest.web_accessible_resources.map((r) =>
    typeof r === "string" ? r.replace(/^\/+/, "") : r,
  );
}

fs.writeFileSync(manifestDist, JSON.stringify(manifest, null, 2), "utf8");

// 5) Sanity: ensure popup build exists
if (!exists(path.join(distDir, "popup", "index.html"))) {
  throw new Error("Popup build missing: dist/popup/index.html");
}

