import { defineConfig } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// ESM config (mts) is required because @tailwindcss/vite is ESM-only.
export default defineConfig({
  // Browser extensions load HTML from a subpath (e.g. popup/index.html).
  // Using a relative base ensures built assets resolve correctly from that folder.
  base: "./",
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  root: "src/popup-ui",
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    assetsDir: "assets",
    sourcemap: false,
  },
});

