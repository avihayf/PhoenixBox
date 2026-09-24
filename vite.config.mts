import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// ESM config (mts) is required because @tailwindcss/vite is ESM-only.
export default defineConfig({
  // Browser extensions load HTML from a subpath (e.g. popup/index.html).
  // Using a relative base ensures built assets resolve correctly from that folder.
  base: "./",
  plugins: [react(), tailwindcss()],
  root: "src/popup-ui",
  build: {
    assetsDir: "assets",
    sourcemap: false,
    // Never inline assets as data: URLs — the extension CSP (default-src
    // 'self') blocks them, so a future small image would silently not load.
    assetsInlineLimit: 0,
    // Firefox supports modulepreload natively; the polyfill is dead weight.
    modulePreload: { polyfill: false },
  },
});

