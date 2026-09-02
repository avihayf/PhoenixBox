const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const viewPath = path.join(
  __dirname,
  "..",
  "src",
  "popup-ui",
  "app",
  "components",
  "views",
  "SiteActionsView.tsx"
);

describe("Highlighter update modal", () => {
  it("explains that container-name headers stay disabled until the update is acknowledged", () => {
    const source = fs.readFileSync(viewPath, "utf8");

    expect(source).to.include(
      "Container-name headers remain disabled until you download the update or confirm you already have v1.2.0+."
    );
    expect(source).to.include("I’ve updated to v1.2.0+");
    expect(source).to.not.include("if (highlighterModal === 'update') void clearHighlighterUpdateNotice();");
  });
});
