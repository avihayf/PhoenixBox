// Tests the popup's TypeScript directly: Node 22.18+ strips types natively, so
// pure modules under src/popup-ui/lib need no build step or extra test runner.
import chai from "chai";
import { createRequire } from "node:module";
import * as settings from "../src/popup-ui/lib/highlighterSettings.ts";

const { expect } = chai;
const require = createRequire(import.meta.url);
const background = require("../src/js/shared/highlighterSyncHelpers.js");

const TOKEN = "Z".repeat(43);

describe("highlighterSettings (popup)", () => {
  // The popup and the background page each carry these, because the UMD
  // helper cannot be imported into the Vite bundle. Pin them together.
  describe("parity with the background helpers", () => {
    for (const name of ["ENABLED_KEY", "PINS_KEY", "PAIRING_KEY", "STATUS_KEY", "CONNECT_REQUEST_KEY", "AUTO_PAIR_PAUSED_KEY"]) {
      it(`agrees on ${name}`, () => {
        expect(settings[name]).to.equal(background[name]);
      });
    }

    const pairingInputs = [
      `phx1:127.0.0.1:8079:${TOKEN}`,
      ` phx1:[::1]:8080:${TOKEN} `,
      `phx1:0.0.0.0:8081:${TOKEN}`,
      "phx1:127.0.0.1:8079:short",
      `phx2:127.0.0.1:8079:${TOKEN}`,
      "",
      null,
    ];
    it("agrees on what a pairing string means", () => {
      for (const input of pairingInputs) {
        expect(settings.parsePairingString(input), String(input))
          .to.deep.equal(background.parsePairingString(input));
      }
    });

    const addressInputs = ["127.0.0.1:18080", "[::1]:8080", "LOCALHOST:80", "host:0", "::1:80", "", undefined];
    it("agrees on what an address means", () => {
      for (const input of addressInputs) {
        expect(settings.parseAddress(input), String(input)).to.deep.equal(background.parseAddress(input));
      }
    });
  });

  describe("isPaired", () => {
    it("needs host, integer port and token", () => {
      expect(settings.isPaired({ host: "127.0.0.1", port: 8079, token: TOKEN })).to.equal(true);
      expect(settings.isPaired({ host: "127.0.0.1", port: "8079", token: TOKEN })).to.equal(false);
      expect(settings.isPaired(null)).to.equal(false);
    });
  });

  describe("describeStatus", () => {
    it("says what the user needs to know when paired", () => {
      expect(settings.describeStatus({ state: "error", message: "Can't reach it" }, true)).to.equal("Can't reach it");
      expect(settings.describeStatus({ state: "connected", jar: "2.0.0", addresses: { a: "127.0.0.1:18080" } }, true))
        .to.equal("Connected to Highlighter v2.0.0 · 1 listener");
      expect(settings.describeStatus({ state: "connected", addresses: {} }, true))
        .to.equal("Connected to Highlighter · 0 listeners");
    });

    it("says it is off, whatever the last status was", () => {
      const connected = { state: "connected", addresses: { a: "127.0.0.1:18080" } };
      expect(settings.describeStatus(connected, true, false)).to.match(/^Off\./);
      expect(settings.describeStatus(null, false, false)).to.match(/^Off\..*Connect/);
    });

    it("explains each unpaired state, including legacy mode", () => {
      expect(settings.describeStatus(null, false)).to.match(/Not paired/);
      expect(settings.describeStatus({ state: "searching" }, false)).to.match(/Looking for/);
      expect(settings.describeStatus({ state: "awaiting" }, false)).to.match(/Allow in Burp/);
      expect(settings.describeStatus({ state: "denied" }, false)).to.match(/denied/);
      expect(settings.describeStatus({ state: "legacy" }, false)).to.match(/legacy colour header/);
    });
  });

  describe("isLegacyMode", () => {
    it("is on only while switched on and unpaired", () => {
      expect(settings.isLegacyMode(false, true)).to.equal(true);
      expect(settings.isLegacyMode(true, true)).to.equal(false);
      expect(settings.isLegacyMode(false, false)).to.equal(false);
    });
  });
});
