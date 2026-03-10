const { expect } = require("chai");

const {
  buildAlwaysOpenEntries,
  getDefaultAssignmentPayload,
} = require("../src/js/shared/pageActionHelpers");

describe("pageActionHelpers", () => {
  describe("buildAlwaysOpenEntries", () => {
    it("prepends a default entry before container identities", () => {
      const entries = buildAlwaysOpenEntries([
        { cookieStoreId: "firefox-container-1", name: "Attacker", color: "red", icon: "circle" },
        { cookieStoreId: "firefox-container-2", name: "Victim", color: "blue", icon: "circle" },
      ]);

      expect(entries.map((entry) => entry.type)).to.deep.equal([
        "default",
        "container",
        "container",
      ]);
      expect(entries[1].identity.name).to.equal("Attacker");
      expect(entries[2].identity.name).to.equal("Victim");
    });
  });

  describe("getDefaultAssignmentPayload", () => {
    it("clears the current site assignment when default is selected", () => {
      expect(getDefaultAssignmentPayload({
        id: 9,
        url: "https://example.test/app",
      })).to.deep.equal({
        tabId: 9,
        url: "https://example.test/app",
        userContextId: false,
        value: true,
      });
    });
  });
});
