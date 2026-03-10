import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";
import { webext } from "./lib/browser";

// Provide asset URLs to CSS (avoids brittle relative paths inside Vite output).
try {
  if (webext?.runtime?.getURL) {
    document.documentElement.style.setProperty(
      "--phoenix-bg-image",
      `url(${webext.runtime.getURL("img/logo.png")})`,
    );
    document.documentElement.style.setProperty(
      "--phoenix-vpn-connected-icon",
      `url(${webext.runtime.getURL("img/moz-vpn-connected.svg")})`,
    );
    document.documentElement.style.setProperty(
      "--phoenix-vpn-disconnected-icon",
      `url(${webext.runtime.getURL("img/moz-vpn-disconnected.svg")})`,
    );
  }
} catch {
  // ignore (e.g., non-extension preview)
}

const rootEl = document.getElementById("root");

if (rootEl) {
  // If the WebExtension Containers API is missing, render a friendly fallback
  // instead of showing a blank popup.
  const hasContainersApi = !!webext?.contextualIdentities;
  if (!hasContainersApi) {
    ReactDOM.createRoot(rootEl).render(
      <div
        style={{
          width: 352,
          minHeight: 200,
          padding: "16px 18px",
          fontFamily: "JetBrains Mono, monospace",
          background: "#f6f8ff",
          color: "#0c0c12",
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ fontSize: 16, margin: "0 0 8px" }}>Phoenix Box</h1>
        <p style={{ margin: "0 0 8px", fontSize: 13 }}>
          This extension requires Firefox and the Multi-Account Containers API.
        </p>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          Open it in Firefox to use the popup UI.
        </p>
      </div>,
    );
  } else {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

