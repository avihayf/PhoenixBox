import chai from "chai";
import { effectivePresetId, presetProxyType } from "../src/popup-ui/lib/proxyPresets.ts";

const { expect } = chai;
const presets = [
  { id: "burp", name: "Burp", scheme: "http", host: "127.0.0.1", port: 8080 },
  { id: "zap", name: "ZAP", scheme: "http", host: "127.0.0.1", port: 8090 },
  { id: "s5", name: "Tor", scheme: "socks5", host: "127.0.0.1", port: 9050 },
];
const burp = { type: "http", host: "127.0.0.1", port: 8080 };

describe("container proxy preset selection (popup)", () => {
  it("prefers the container's own proxy", () => {
    expect(effectivePresetId({ type: "http", host: "127.0.0.1", port: 8090 }, burp, true, presets))
      .to.equal("zap");
  });

  it("shows the Disable-proxy entry", () => {
    expect(effectivePresetId({ type: "direct" }, burp, true, presets)).to.equal("__direct__");
  });

  it("falls back to the global proxy when it applies to this container", () => {
    expect(effectivePresetId(null, burp, true, presets)).to.equal("burp");
  });

  // The promoted list sends every other container DIRECT; the dropdown used
  // to claim they went through Burp.
  it("does not show the global proxy for a container it does not apply to", () => {
    expect(effectivePresetId(null, burp, false, presets)).to.equal(undefined);
  });

  // Compared as URL strings, a global proxy with "user@" never matched.
  it("matches by endpoint, ignoring credentials", () => {
    expect(effectivePresetId(null, { ...burp, username: "alice" }, true, presets)).to.equal("burp");
  });

  it("maps socks5 presets onto Firefox's socks type", () => {
    expect(presetProxyType("socks5")).to.equal("socks");
    expect(effectivePresetId({ type: "socks", host: "127.0.0.1", port: 9050 }, null, true, presets))
      .to.equal("s5");
  });

  it("shows nothing when no proxy applies", () => {
    expect(effectivePresetId(null, null, true, presets)).to.equal(undefined);
  });
});
