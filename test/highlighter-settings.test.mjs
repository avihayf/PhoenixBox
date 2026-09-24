// Tests the popup's TypeScript directly: Node 22.18+ strips types natively, so
// pure modules under src/popup-ui/lib need no build step or extra test runner.
import chai from "chai";
import { createRequire } from "node:module";
import * as settings from "../src/popup-ui/lib/highlighterSettings.ts";

const { expect } = chai;
const require = createRequire(import.meta.url);
const backgroundHelpers = require("../src/js/shared/requestHeaderHelpers.js");

describe("highlighterSettings (popup)", () => {
  // The popup and the background page each carry these values, because the
  // UMD helper cannot be imported into the Vite bundle. Pin them together.
  describe("parity with the background helpers", () => {
    for (const name of [
      "HIGHLIGHTER_HEADERS_KEY",
      "LEGACY_HIGHLIGHTER_HEADERS_KEY",
      "JAR_ACK_VERSION_KEY",
      "REQUIRED_JAR_VERSION",
    ]) {
      it(`agrees on ${name}`, () => {
        expect(settings[name]).to.equal(backgroundHelpers[name]);
      });
    }

    it("agrees on what counts as acknowledged", () => {
      for (const v of [null, "", "1.1.9", "1.2", "1.2.0", "1.10.0", "2", true]) {
        expect(settings.isJarAcknowledged(v), String(v))
          .to.equal(backgroundHelpers.isJarAcknowledged(v));
      }
    });

    it("agrees on resolving the toggle from storage", () => {
      for (const stored of [{}, { highlighterHeadersEnabled: false, addContainerColorHeaderEnabled: true },
        { addContainerColorHeaderEnabled: true }, { highlighterHeadersEnabled: true }]) {
        expect(settings.resolveHighlighterHeadersEnabled(stored))
          .to.equal(backgroundHelpers.resolveHighlighterHeadersEnabled(stored));
      }
    });
  });

  describe("acknowledgementFor", () => {
    // The whole safety property: only an explicit confirmation lets the
    // container name through. Downloading is not installing.
    it("stores an acknowledgement only for an explicit confirmation", () => {
      expect(settings.acknowledgementFor("confirm-installed"))
        .to.equal(settings.REQUIRED_JAR_VERSION);
      expect(settings.acknowledgementFor("download")).to.equal(null);
      expect(settings.acknowledgementFor("dismiss")).to.equal(null);
    });

    it("stores a version that satisfies the requirement", () => {
      expect(settings.isJarAcknowledged(settings.acknowledgementFor("confirm-installed")))
        .to.equal(true);
    });
  });

  describe("noticeOnPopupOpen", () => {
    it("reminds users with the Highlighter on who have not confirmed", () => {
      expect(settings.noticeOnPopupOpen(true, false)).to.equal("confirm");
    });

    it("stays quiet once confirmed, or when the Highlighter is off", () => {
      expect(settings.noticeOnPopupOpen(true, true)).to.equal(null);
      expect(settings.noticeOnPopupOpen(false, false)).to.equal(null);
    });
  });

  describe("noticeOnEnable", () => {
    it("shows the setup explainer the first time", () => {
      expect(settings.noticeOnEnable(false, false)).to.equal("setup");
      expect(settings.noticeOnEnable(false, true)).to.equal("setup");
    });

    it("asks for confirmation on later enables until confirmed", () => {
      expect(settings.noticeOnEnable(true, false)).to.equal("confirm");
      expect(settings.noticeOnEnable(true, true)).to.equal(null);
    });
  });

  describe("HIGHLIGHTER_RELEASES_URL", () => {
    // A pinned asset URL 404ed before the release existed; the releases page
    // always resolves.
    it("points at the releases page, not a pinned asset", () => {
      expect(settings.HIGHLIGHTER_RELEASES_URL).to.match(/\/releases\/latest$/);
    });
  });
});
