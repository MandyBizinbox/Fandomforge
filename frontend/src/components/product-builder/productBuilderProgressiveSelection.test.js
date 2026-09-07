import fs from "fs";
import path from "path";

const builderPath = path.join(__dirname, "ProductBuilderV4.jsx");
const cssPath = path.join(__dirname, "productBuilderV4.css");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("Product Builder progressive Basics selection", () => {
  test("product type selection gates the template browser", () => {
    const source = read(builderPath);
    expect(source).toContain("pb4-type-grid");
    expect(source).toContain("selectedProductTypeId ? <section");
    expect(source).toContain("Select a product type above to open its available templates.");
  });

  test("template cards stay compact and selected template owns the detail panel", () => {
    const source = read(builderPath);
    expect(source).toContain("pb4-template-card");
    expect(source).toContain("pb4-template-detail");
    expect(source).toContain("getTemplateShortDescription(selectedTemplate)");
    expect(source).toContain("getTemplateAvailableOptionsSummary(selectedTemplate)");
    expect(source).toContain("selectedTemplate && <section");
  });

  test("responsive CSS uses dense type/template grids and a desktop detail rail", () => {
    const css = read(cssPath);
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr))");
    expect(css).toContain("grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr))");
    expect(css).toContain("@media (min-width: 1024px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1.45fr) minmax(18rem, 0.75fr)");
  });

  test("business behavior owners remain untouched", () => {
    const source = read(builderPath);
    expect(source).toContain("const validateStep = (key) =>");
    expect(source).toContain("const buildPayload = () =>");
    expect(source).toContain("const save = async ({ publish = false } = {}) =>");
    expect(source).toContain("pricing.canPublishWithOverride");
  });
});
