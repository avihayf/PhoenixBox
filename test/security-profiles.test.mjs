import chai from "chai";
import { createRequire } from "node:module";
import * as popup from "../src/popup-ui/lib/securityProfiles.ts";

const { expect } = chai;
const require = createRequire(import.meta.url);
const background = require("../src/js/shared/reviewHelpers.js");

describe("security profiles", () => {
  // The popup and the background each carry these, because the UMD helper
  // cannot be imported into the Vite bundle; ten copies used to disagree.
  describe("popup/background parity", () => {
    it("agrees on the icons Firefox accepts", () => {
      expect([...popup.FIREFOX_CONTAINER_ICONS]).to.deep.equal(background.FIREFOX_CONTAINER_ICONS);
    });

    it("agrees on the default profiles", () => {
      expect(popup.SECURITY_PROFILES).to.deep.equal(background.SECURITY_PROFILES);
    });

    it("maps icons for Firefox the same way", () => {
      for (const icon of ["skull", "fence", "circle", "user-x", "briefcase", ""]) {
        expect(popup.firefoxIconFor(icon), icon).to.equal(background.firefoxIconFor(icon));
      }
    });
  });

  it("keeps Firefox's fence icon rather than replacing it", () => {
    expect(popup.firefoxIconFor("fence")).to.equal("fence");
  });

  it("gives Firefox fingerprint for a security icon", () => {
    expect(popup.firefoxIconFor("skull")).to.equal("fingerprint");
  });

  it("shows the profile icon for a default container with no override", () => {
    expect(popup.defaultSecurityIcon("firefox-container-1")).to.equal("skull");
    expect(popup.defaultSecurityIcon("firefox-container-9")).to.equal(null);
  });
});
