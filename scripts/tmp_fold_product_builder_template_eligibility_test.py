#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontend/src/components/product-builder/productBuilderPricingGallery.test.js"
TEMP = ROOT / "frontend/src/components/product-builder/productBuilderTemplateEligibility.test.js"
MARKER = 'describe("Product Builder active-ready template eligibility"'

BLOCK = r'''


describe("Product Builder active-ready template eligibility", () => {
  const builderPath = path.join(__dirname, "ProductBuilderV4.jsx");

  test("new template choices use canonical readiness and require active status", () => {
    const source = fs.readFileSync(builderPath, "utf8");
    expect(source).toContain('import { templateReadiness } from "../../lib/templateReadiness";');
    expect(source).toContain('normalise(template?.status) === "active"');
    expect(source).toContain("templateReadiness(template, globalPrintOptions).isLaunchReady");
    expect(source).toContain("loadedTemplates.filter((template) => isBuilderSelectableTemplate(template, loadedPrintOptions))");
  });

  test("existing products retain their already-linked template for editing", () => {
    const source = fs.readFileSync(builderPath, "utf8");
    expect(source).toContain("const existingTemplate = loadedTemplates.find");
    expect(source).toContain("templatesForBuilder = [...selectableTemplates, existingTemplate]");
    expect(source).toContain("setTemplates(templatesForBuilder)");
  });
});
'''


def main():
    text = TARGET.read_text(encoding="utf-8")
    if MARKER not in text:
        TARGET.write_text(text.rstrip() + BLOCK + "\n", encoding="utf-8")
    if TEMP.exists():
        TEMP.unlink()


if __name__ == "__main__":
    main()
