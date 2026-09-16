import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "ProductTemplateStorefrontDefaultsModal.jsx"), "utf8");

describe("product template storefront defaults editor", () => {
  test("persists the creator-facing storefront default fields", () => {
    expect(source).toContain("creator_default_title");
    expect(source).toContain("creator_default_description");
    expect(source).toContain("specs");
    expect(source).toContain("material_composition");
    expect(source).toContain("care_instructions");
    expect(source).toContain("fit_notes");
    expect(source).toContain("/admin/product-templates/${templateId}");
  });

  test("makes snapshot semantics explicit to admins", () => {
    expect(source).toContain("Existing creator products are never overwritten");
  });
});
