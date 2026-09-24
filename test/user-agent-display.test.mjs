import chai from "chai";
import { parseUserAgentForDisplay as label } from "../src/popup-ui/lib/userAgentDisplay.ts";

const { expect } = chai;

describe("parseUserAgentForDisplay (popup)", () => {
  it("labels desktop Chrome on Windows", () => {
    expect(label("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"))
      .to.equal("Chrome 143 - Windows 10");
  });

  // Android agents contain "Linux"; checked first, every one read "Linux".
  it("labels Android as Android, not Linux", () => {
    expect(label("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36"))
      .to.equal("Chrome 143 - Android 14");
  });

  // iPhone agents contain "like Mac OS X".
  it("labels iPhone and iPad as iOS/iPadOS, not macOS", () => {
    expect(label("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"))
      .to.equal("Safari 17 - iOS 17.4");
    expect(label("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"))
      .to.equal("Safari 17 - iPadOS 17.4");
  });

  // Chromium-based Opera and Edge also carry "Chrome/".
  it("labels Opera and Edge rather than Chrome", () => {
    expect(label("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0"))
      .to.equal("Opera 115 - Windows 10");
    expect(label("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"))
      .to.equal("Edge 143 - Windows 10");
  });

  it("labels Firefox and macOS", () => {
    expect(label("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0"))
      .to.equal("Firefox 142 - macOS 10.15");
  });

  it("handles empty and unrecognised input", () => {
    expect(label("")).to.equal("Unknown");
    expect(label("curl/8.0")).to.equal("Unknown");
  });
});
