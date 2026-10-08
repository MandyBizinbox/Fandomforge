const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

describe("Template Studio V3 workflow contract", () => {
  test("variable templates separate variation generation from production editing", () => {
    const source = read("./ProductTemplateStudioV3Page.jsx");
    expect(source).toContain('? ["product", "variations", "production", "gallery", "size-guide"]');
    expect(source).toContain('currentSection === "variations" && variableProduct');
    expect(source).toContain('currentSection === "production" && variableProduct');
    expect(source).toContain("Production setup is handled separately in Production studio.");
  });

  test("product details are grouped by editing task without dropping storefront fields", () => {
    const source = read("./ProductTemplateStudioV3Page.jsx");
    expect(source).toContain("Basics");
    expect(source).toContain("Pricing & supplier");
    expect(source).toContain("Storefront defaults");
    expect(source).toContain("creator_default_description");
    expect(source).toContain("material_composition");
    expect(source).toContain("care_instructions");
    expect(source).toContain("fit_notes");
  });

  test("workspace overrides load after compatibility and dark contrast styles", () => {
    const route = read("../../routes/AdminTemplateStudioRoute.jsx");
    const compatibility = route.indexOf("templateStudioV3Compatibility.css");
    const dark = route.indexOf("templateStudioV3DarkContrast.css");
    const workspace = route.indexOf("templateStudioV3Workspace.css");
    expect(workspace).toBeGreaterThan(compatibility);
    expect(workspace).toBeGreaterThan(dark);
  });

  test("hidden tab panels cannot be forced visible by legacy CSS", () => {
    const source = read("./templateStudioV3Workspace.css");
    expect(source).toContain(".workspace-tabs__panel[hidden]");
    expect(source).toContain("display: none !important");
  });
});
